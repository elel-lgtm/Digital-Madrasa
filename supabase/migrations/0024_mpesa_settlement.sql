-- 0024_mpesa_settlement.sql
--
-- Server-side money movement for M-Pesa (Daraja STK Push), fees and the
-- madrasa subscription alike.
--
-- The rule from 0009 stands unchanged: money never changes state from a
-- client. Payments, allocations, receipts and subscription payments stay
-- read-only to every signed-in user. What this migration adds is the set of
-- functions the `payments` and `mpesa-callback` Edge Functions call with the
-- service role, and nothing a client can execute to move money:
--
--   settle_fee_payment            the callback's outcome for a fee payment
--   settle_subscription_payment   the same for a subscription payment
--   open_subscription_invoice     the invoice a subscription payment is for
--
-- Each settle function locks the payment row first and returns early when the
-- payment has already left `initiated`/`pending`. Safaricom retries callbacks,
-- and the app polls, so the same outcome can arrive several times; only the
-- first one does anything.
--
-- The subscription controls a client *may* use (cancel, resume, default card,
-- remove card) are SECURITY DEFINER functions with their own owner checks,
-- because a direct UPDATE through PostgREST is checked against the read policy
-- on the returned row, and because the old card policy accepted any new row.
--
-- Re-runnable: every object is created with `or replace` / `if not exists`.

-- -------------------------------------------------------------- numbering

create sequence if not exists public.receipt_no_seq;
create sequence if not exists public.subscription_invoice_no_seq;

-- Settlement finds a subscription payment by the id Safaricom echoes back, so
-- that id must name one payment. (`payments` has had this since 0007.)
create unique index if not exists subscription_payments_checkout_request_id_key
  on public.subscription_payments (checkout_request_id);

-- ---------------------------------------------------------- fee settlement

create or replace function public.settle_fee_payment(
  p_checkout_request_id text,
  p_success             boolean,
  p_provider_ref        text,
  p_amount              numeric,
  p_raw                 jsonb,
  p_failure_reason      text
)
returns table (status public.payment_status, receipt_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.payments%rowtype;
  v_receipt  text;
  v_parent   uuid;
begin
  select * into p
    from public.payments
   where checkout_request_id = p_checkout_request_id
   for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;

  -- Already settled: a replayed callback or a late poll. Report, change
  -- nothing — except that a success settled from a status query carries no
  -- M-Pesa receipt, and the callback arriving later may supply it.
  if p.status not in ('initiated', 'pending') then
    if p.status = 'success' and p.provider_ref is null and p_success and p_provider_ref is not null then
      update public.payments set provider_ref = p_provider_ref, raw_callback = p_raw where id = p.id;
    end if;
    return query
      select p.status, (select r.receipt_no from public.receipts r where r.payment_id = p.id);
    return;
  end if;

  -- The prompt asked for a fixed amount. A callback reporting a different one
  -- is not credited; it is kept for a person to look at.
  if p_success and p_amount is not null and p_amount <> p.amount then
    p_success := false;
    p_failure_reason := format('Amount mismatch: received %s, expected %s. Held for review.',
                               p_amount, p.amount);
  end if;

  if not p_success then
    update public.payments
       set status = 'failed',
           failure_reason = coalesce(p_failure_reason, 'The payment did not go through.'),
           raw_callback = p_raw
     where id = p.id;
    return query select 'failed'::public.payment_status, null::text;
    return;
  end if;

  update public.payments
     set status = 'success',
         provider_ref = p_provider_ref,
         settled_at = now(),
         failure_reason = null,
         raw_callback = p_raw
   where id = p.id;

  perform public.apply_payment(p.id);

  v_receipt := 'RCP-' || to_char(now(), 'YYYY') || '-'
               || lpad(nextval('public.receipt_no_seq')::text, 6, '0');
  insert into public.receipts (payment_id, madrasa_id, receipt_no)
  values (p.id, p.madrasa_id, v_receipt);

  select pa.profile_id into v_parent from public.parents pa where pa.id = p.parent_id;
  if v_parent is not null then
    insert into public.notifications (user_id, madrasa_id, type, title, body, payload, channel)
    values (
      v_parent, p.madrasa_id, 'payment_receipt',
      'Payment received',
      format('We received KES %s. Your receipt number is %s.',
             to_char(p.amount, 'FM999,999,990.00'), v_receipt),
      jsonb_build_object('payment_id', p.id, 'receipt_no', v_receipt),
      array['in_app', 'push', 'email']
    );
  end if;

  return query select 'success'::public.payment_status, v_receipt;
end;
$$;

-- --------------------------------------------------- subscription invoice

/**
 * The invoice a subscription payment settles: the oldest one still unpaid, or
 * a new one for the next period at the plan's price. The client never names
 * an amount; this is where it comes from.
 */
create or replace function public.open_subscription_invoice(p_madrasa_id uuid)
returns public.subscription_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.subscriptions%rowtype;
  plan   public.subscription_plans%rowtype;
  inv    public.subscription_invoices%rowtype;
  v_from timestamptz;
begin
  select * into s from public.subscriptions where madrasa_id = p_madrasa_id for update;
  if not found then
    raise exception 'no subscription for this madrasa' using errcode = 'P0002';
  end if;

  select * into inv
    from public.subscription_invoices
   where subscription_id = s.id
     and status in ('issued', 'partially_paid', 'overdue')
   order by due_date asc, issued_at asc
   limit 1;
  if found then
    return inv;
  end if;

  select * into plan from public.subscription_plans where id = s.plan_id;
  v_from := greatest(now(), coalesce(s.current_period_end, now()));

  insert into public.subscription_invoices (
    madrasa_id, subscription_id, invoice_no, amount_due, currency,
    period_start, period_end, due_date, status
  )
  values (
    s.madrasa_id, s.id,
    'DMS-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.subscription_invoice_no_seq')::text, 6, '0'),
    plan.amount, plan.currency,
    v_from,
    v_from + case plan.interval when 'yearly' then interval '1 year' else interval '1 month' end,
    current_date,
    'issued'
  )
  returning * into inv;

  return inv;
end;
$$;

-- ------------------------------------------------- subscription settlement

create or replace function public.settle_subscription_payment(
  p_checkout_request_id text,
  p_success             boolean,
  p_provider_ref        text,
  p_amount              numeric,
  p_raw                 jsonb,
  p_failure_reason      text
)
returns table (status public.payment_status, subscription_status public.subscription_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.subscription_payments%rowtype;
  inv      public.subscription_invoices%rowtype;
  s        public.subscriptions%rowtype;
  plan     public.subscription_plans%rowtype;
  v_paid   numeric(12,2);
  v_from   timestamptz;
  v_status public.subscription_status;
begin
  select * into p
    from public.subscription_payments
   where checkout_request_id = p_checkout_request_id
   for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;

  if p.status not in ('initiated', 'pending') then
    if p.status = 'success' and p.provider_ref is null and p_success and p_provider_ref is not null then
      update public.subscription_payments set provider_ref = p_provider_ref, raw_callback = p_raw where id = p.id;
    end if;
    return query
      select p.status, (select x.status from public.subscriptions x where x.madrasa_id = p.madrasa_id);
    return;
  end if;

  if p_success and p_amount is not null and p_amount <> p.amount then
    p_success := false;
    p_failure_reason := format('Amount mismatch: received %s, expected %s. Held for review.',
                               p_amount, p.amount);
  end if;

  if not p_success then
    update public.subscription_payments
       set status = 'failed',
           failure_reason = coalesce(p_failure_reason, 'The payment did not go through.'),
           raw_callback = p_raw
     where id = p.id;
    return query
      select 'failed'::public.payment_status,
             (select x.status from public.subscriptions x where x.madrasa_id = p.madrasa_id);
    return;
  end if;

  update public.subscription_payments
     set status = 'success',
         provider_ref = p_provider_ref,
         settled_at = now(),
         failure_reason = null,
         raw_callback = p_raw
   where id = p.id;

  select * into inv from public.subscription_invoices where id = p.subscription_invoice_id for update;
  v_paid := least(inv.amount_due, inv.amount_paid + p.amount);
  update public.subscription_invoices
     set amount_paid = v_paid,
         status = (case when v_paid >= inv.amount_due then 'paid' else 'partially_paid' end)::public.invoice_status
   where id = inv.id;

  -- A fully paid invoice buys one period, starting where the paid-up time
  -- ends (or now, if it already ended). Paying also withdraws a cancellation.
  if v_paid >= inv.amount_due then
    select * into s from public.subscriptions where id = inv.subscription_id for update;
    select * into plan from public.subscription_plans where id = s.plan_id;
    v_from := greatest(now(), coalesce(s.current_period_end, now()));
    update public.subscriptions
       set current_period_start = v_from,
           current_period_end = v_from + case plan.interval
                                           when 'yearly' then interval '1 year'
                                           else interval '1 month' end,
           grace_ends_at = null,
           cancelled_at = null,
           cancel_at_period_end = false,
           cancellation_reason = null
     where id = s.id;
  end if;

  v_status := public.refresh_subscription_status(p.madrasa_id);

  insert into public.notifications (user_id, madrasa_id, type, title, body, payload, channel)
  select t.profile_id, p.madrasa_id, 'payment_receipt',
         'Subscription payment received',
         format('We received KES %s for invoice %s.',
                to_char(p.amount, 'FM999,999,990.00'), inv.invoice_no),
         jsonb_build_object('subscription_payment_id', p.id, 'invoice_no', inv.invoice_no),
         array['in_app', 'push', 'email']
    from public.teachers t
   where t.madrasa_id = p.madrasa_id and t.is_owner and t.deleted_at is null;

  return query select 'success'::public.payment_status, v_status;
end;
$$;

-- Service role only. Nobody signed in may settle or invent money.
revoke execute on function public.settle_fee_payment(text, boolean, text, numeric, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.settle_subscription_payment(text, boolean, text, numeric, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.open_subscription_invoice(uuid)
  from public, anon, authenticated;
grant execute on function public.settle_fee_payment(text, boolean, text, numeric, jsonb, text) to service_role;
grant execute on function public.settle_subscription_payment(text, boolean, text, numeric, jsonb, text) to service_role;
grant execute on function public.open_subscription_invoice(uuid) to service_role;

-- ---------------------------------------------- owner subscription controls

create or replace function public.is_madrasa_owner(p_madrasa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teachers t
     where t.profile_id = auth.uid()
       and t.madrasa_id = p_madrasa_id
       and t.is_owner
       and t.deleted_at is null
  )
$$;

/**
 * Cancelling never cuts access mid-period: the madrasa keeps what it has
 * already paid for and simply does not renew. With nothing paid up, it takes
 * effect now.
 */
create or replace function public.cancel_subscription(p_reason text default null)
returns public.subscription_status
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.subscriptions%rowtype;
begin
  select * into s from public.subscriptions
   where madrasa_id = public.current_madrasa_id()
   for update;
  if not found or not public.is_madrasa_owner(s.madrasa_id) then
    raise exception 'only the madrasa owner can cancel the subscription' using errcode = '42501';
  end if;

  update public.subscriptions
     set cancel_at_period_end = true,
         cancellation_reason = nullif(left(trim(coalesce(p_reason, '')), 500), ''),
         cancelled_at = case
           when current_period_end is null or current_period_end <= now() then now()
           else null end
   where id = s.id;

  return public.refresh_subscription_status(s.madrasa_id);
end;
$$;

create or replace function public.resume_subscription()
returns public.subscription_status
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.subscriptions%rowtype;
begin
  select * into s from public.subscriptions
   where madrasa_id = public.current_madrasa_id()
   for update;
  if not found or not public.is_madrasa_owner(s.madrasa_id) then
    raise exception 'only the madrasa owner can manage the subscription' using errcode = '42501';
  end if;

  update public.subscriptions
     set cancel_at_period_end = false,
         cancelled_at = null,
         cancellation_reason = null
   where id = s.id;

  return public.refresh_subscription_status(s.madrasa_id);
end;
$$;

revoke execute on function public.cancel_subscription(text) from public, anon;
revoke execute on function public.resume_subscription() from public, anon;
grant execute on function public.cancel_subscription(text) to authenticated;
grant execute on function public.resume_subscription() to authenticated;

-- --------------------------------------------------------------- saved cards

-- The old policy let the card's owner UPDATE with `check (true)`, so the new
-- row could be anything: another madrasa, another parent, another token. The
-- two things a client may do to a card now go through functions instead.
drop policy if exists "delete own saved cards" on public.saved_cards;

create or replace function public.owns_saved_card(c public.saved_cards)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce: for a caller with no parent row current_parent_id() is null,
  -- which would make this null rather than false — and `if not null` does
  -- not refuse.
  select coalesce(
    c.deleted_at is null
    and (
      (c.parent_id is not null and c.parent_id = public.current_parent_id())
      or (
        c.parent_id is null
        and c.madrasa_id = public.current_madrasa_id()
        and public.is_madrasa_owner(c.madrasa_id)
      )
    ),
    false
  )
$$;

create or replace function public.remove_saved_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.saved_cards%rowtype;
begin
  select * into c from public.saved_cards where id = p_card_id for update;
  if not found or not public.owns_saved_card(c) then
    raise exception 'card not found' using errcode = 'P0002';
  end if;

  update public.saved_cards set deleted_at = now(), is_default = false where id = c.id;
  update public.subscriptions set default_card_id = null where default_card_id = c.id;
end;
$$;

create or replace function public.set_default_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.saved_cards%rowtype;
begin
  select * into c from public.saved_cards where id = p_card_id for update;
  if not found or not public.owns_saved_card(c) then
    raise exception 'card not found' using errcode = 'P0002';
  end if;

  if c.parent_id is not null then
    update public.saved_cards
       set is_default = (id = c.id)
     where parent_id = c.parent_id and deleted_at is null;
  else
    update public.saved_cards
       set is_default = (id = c.id)
     where parent_id is null and madrasa_id = c.madrasa_id and deleted_at is null;
    update public.subscriptions set default_card_id = c.id where madrasa_id = c.madrasa_id;
  end if;
end;
$$;

revoke execute on function public.owns_saved_card(public.saved_cards) from public, anon;
revoke execute on function public.remove_saved_card(uuid) from public, anon;
revoke execute on function public.set_default_card(uuid) from public, anon;
grant execute on function public.remove_saved_card(uuid) to authenticated;
grant execute on function public.set_default_card(uuid) to authenticated;

-- -------------------------------------------------------------------- audit

drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions
  after insert or update or delete on public.subscriptions
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_subscription_payments on public.subscription_payments;
create trigger trg_audit_subscription_payments
  after insert or update or delete on public.subscription_payments
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_saved_cards on public.saved_cards;
create trigger trg_audit_saved_cards
  after insert or update or delete on public.saved_cards
  for each row execute function public.write_audit();
