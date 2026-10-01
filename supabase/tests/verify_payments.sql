-- Verifies migration 0024 against the live schema: only the service role can
-- settle money; a settlement credits invoices once, issues one receipt and
-- tells the parent; replays and wrong amounts change nothing; a subscription
-- payment buys exactly one period; only the owner can cancel or resume; and
-- a card can be managed only by whoever saved it. Runs inside a transaction
-- that rolls back, so it leaves nothing behind.
--
--   npm run db:verify:payments

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_mb uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_teach uuid := gen_random_uuid();
  v_ownerb uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_student uuid;
  v_parent uuid;
  v_parent2 uuid;
  v_struct uuid := gen_random_uuid();
  v_inv1 uuid := gen_random_uuid();
  v_inv2 uuid := gen_random_uuid();
  v_pay uuid;
  v_pay2 uuid;
  v_sinv public.subscription_invoices%rowtype;
  v_sinv2 public.subscription_invoices%rowtype;
  v_spay uuid;
  v_card uuid := gen_random_uuid();
  v_card2 uuid := gen_random_uuid();
  v_mcard uuid := gen_random_uuid();
  v_end timestamptz;
  v_n int;
  r record;
  v_failed text[] := '{}';
begin
  -- ------------------------------------------------------------ fixtures
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'vp-owner@example.test'), (v_teach, 'vp-teach@example.test'),
                 (v_ownerb, 'vp-ownerb@example.test'), (v_pupil, 'vp-pupil@example.test'),
                 (v_mum, 'vp-mum@example.test'), (v_other, 'vp-other@example.test')) t(id, e);

  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'VP Owner', 'vp-owner@example.test'),
    (v_teach, 'teacher', null, 'VP Teacher', 'vp-teach@example.test'),
    (v_ownerb, 'teacher', null, 'VP Owner B', 'vp-ownerb@example.test'),
    (v_pupil, 'student', null, 'VP Pupil', 'vp-pupil@example.test'),
    (v_mum, 'parent', null, 'VP Mum', 'vp-mum@example.test'),
    (v_other, 'parent', null, 'VP Other', 'vp-other@example.test');

  -- Inserting a madrasa starts its trial subscription (0010 trigger).
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'VP Madrasa A', 'vp-a-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'vp-owner@example.test', '+254712000001', 'active'),
    (v_mb, 'VP Madrasa B', 'vp-b-' || substr(v_mb::text, 1, 8), 'Wajir', 'Wajir', v_ownerb, 'vp-ownerb@example.test', '+254712000002', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_teach, v_pupil, v_mum, v_other);
  update public.profiles set madrasa_id = v_mb where id = v_ownerb;

  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-VP1', true, 'active'),
    (v_teach, v_ma, 'EMP-VP2', false, 'active'),
    (v_ownerb, v_mb, 'EMP-VP3', true, 'active');

  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_pupil, v_ma, extract(year from now())::int, date '2014-01-01', 'female')
  returning id into v_student;

  insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_parent;
  insert into public.parents (profile_id, madrasa_id) values (v_other, v_ma) returning id into v_parent2;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status)
  values (v_parent, v_student, v_ma, 'mother', 'approved');

  insert into public.fee_structures (id, madrasa_id, name, amount, currency, applies_to, term, academic_year)
  values (v_struct, v_ma, 'VP Term', 1500, 'KES', 'all', 'Term 3', 2026);
  insert into public.invoices (id, madrasa_id, student_id, invoice_no, fee_structure_id,
                               amount_due, amount_paid, currency, due_date, status, issued_at, description)
  values (v_inv1, v_ma, v_student, 'INV-VP-0001', v_struct, 1500, 0, 'KES', current_date + 10, 'issued', now(), 'vp 1'),
         (v_inv2, v_ma, v_student, 'INV-VP-0002', v_struct, 1000, 400, 'KES', current_date + 20, 'partially_paid', now(), 'vp 2');

  -- What the payments function does on pay-fees: one payment, one allocation per invoice.
  insert into public.payments (madrasa_id, parent_id, amount, currency, method, channel, provider, status, checkout_request_id)
  values (v_ma, v_parent, 2100, 'KES', 'mpesa', 'mpesa', 'daraja', 'pending', 'ws_CO_VP_OK')
  returning id into v_pay;
  insert into public.payment_allocations (payment_id, invoice_id, madrasa_id, amount)
  values (v_pay, v_inv1, v_ma, 1500), (v_pay, v_inv2, v_ma, 600);

  insert into public.payments (madrasa_id, parent_id, amount, currency, method, channel, provider, status, checkout_request_id)
  values (v_ma, v_parent, 1500, 'KES', 'mpesa', 'mpesa', 'daraja', 'pending', 'ws_CO_VP_BAD')
  returning id into v_pay2;
  insert into public.payment_allocations (payment_id, invoice_id, madrasa_id, amount)
  values (v_pay2, v_inv1, v_ma, 1500);

  insert into public.saved_cards (id, madrasa_id, parent_id, brand, last4, expiry_month, expiry_year, holder_name, provider, provider_token) values
    (v_card, v_ma, v_parent, 'visa', '4242', 12, 2030, 'VP Mum', 'paystack', 'tok_vp_1'),
    (v_card2, v_ma, v_parent, 'mastercard', '4444', 11, 2031, 'VP Mum', 'paystack', 'tok_vp_2'),
    (v_mcard, v_ma, null, 'visa', '1111', 10, 2032, 'VP Madrasa', 'paystack', 'tok_vp_3');

  -- --------------------------------------------- as the parent (a client)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_mum then
    raise exception 'harness broken: acting as % / %', current_user, auth.uid();
  end if;

  -- 1. a signed-in user cannot settle, or open an invoice
  begin
    perform public.settle_fee_payment('ws_CO_VP_OK', true, 'QWERTY1234', 2100, '{}'::jsonb, null);
    v_failed := v_failed || text 'a parent settled their own payment';
  exception when insufficient_privilege then
    raise notice 'PASS  a parent cannot call settle_fee_payment';
  end;
  begin
    perform public.settle_subscription_payment('x', true, 'x', 1, '{}'::jsonb, null);
    v_failed := v_failed || text 'a parent called settle_subscription_payment';
  exception when insufficient_privilege then
    raise notice 'PASS  a parent cannot call settle_subscription_payment';
  end;
  begin
    perform public.open_subscription_invoice(v_ma);
    v_failed := v_failed || text 'a parent opened a subscription invoice';
  exception when insufficient_privilege then
    raise notice 'PASS  a parent cannot call open_subscription_invoice';
  end;

  -- 2. nor mark a payment paid directly
  update public.payments set status = 'success' where id = v_pay;
  get diagnostics v_n = row_count;
  if v_n <> 0 then v_failed := v_failed || text 'a parent updated a payment row';
  else raise notice 'PASS  a parent cannot update a payment'; end if;

  -- 3. nor rewrite a card (the old `check (true)` policy is gone)
  update public.saved_cards set madrasa_id = v_mb where id = v_card;
  get diagnostics v_n = row_count;
  if v_n <> 0 then v_failed := v_failed || text 'a parent rewrote a saved card directly';
  else raise notice 'PASS  a saved card cannot be updated directly'; end if;

  -- ------------------------------------------------ as the service role
  set local role service_role;

  -- 4. success: both invoices credited, oldest due first, receipt, notice
  select * into r from public.settle_fee_payment('ws_CO_VP_OK', true, 'VPTEST0001', 2100,
                                                 '{"Body":{}}'::jsonb, null);
  if r.status <> 'success' or r.receipt_no !~ '^RCP-\d{4}-\d{6}$' then
    v_failed := v_failed || format('settle returned %s / %s', r.status, r.receipt_no);
  else raise notice 'PASS  settled: receipt %', r.receipt_no; end if;

  select (select amount_paid from public.invoices where id = v_inv1) a1,
         (select status from public.invoices where id = v_inv1) s1,
         (select amount_paid from public.invoices where id = v_inv2) a2,
         (select status from public.invoices where id = v_inv2) s2 into r;
  if r.a1 <> 1500 or r.s1 <> 'paid' or r.a2 <> 1000 or r.s2 <> 'paid' then
    v_failed := v_failed || format('invoices after settle: %s %s / %s %s', r.a1, r.s1, r.a2, r.s2);
  else raise notice 'PASS  both invoices paid in full'; end if;

  select count(*) into v_n from public.notifications
   where user_id = v_mum and type = 'payment_receipt' and payload ->> 'payment_id' = v_pay::text;
  if v_n <> 1 then v_failed := v_failed || format('parent notices: %s', v_n);
  else raise notice 'PASS  parent notified once'; end if;

  -- 5. a replayed callback changes nothing
  select * into r from public.settle_fee_payment('ws_CO_VP_OK', true, 'VPTEST0001', 2100, '{}'::jsonb, null);
  select count(*) into v_n from public.receipts where payment_id = v_pay;
  if r.status <> 'success' or v_n <> 1
     or (select amount_paid from public.invoices where id = v_inv1) <> 1500 then
    v_failed := v_failed || text 'replay changed state';
  else raise notice 'PASS  replayed callback is a no-op'; end if;

  -- 6. a callback reporting a different amount is not credited
  update public.invoices set amount_paid = 0 where id = v_inv1;  -- reopen for the test
  select * into r from public.settle_fee_payment('ws_CO_VP_BAD', true, 'VPTEST0002', 1, '{}'::jsonb, null);
  if r.status <> 'failed' or (select amount_paid from public.invoices where id = v_inv1) <> 0
     or (select failure_reason from public.payments where id = v_pay2) not like 'Amount mismatch%' then
    v_failed := v_failed || text 'amount mismatch was credited';
  else raise notice 'PASS  wrong amount held for review, nothing credited'; end if;

  -- 7. an unknown checkout is an error, not a silent success
  begin
    perform public.settle_fee_payment('ws_CO_NOPE', true, 'X', 1, '{}'::jsonb, null);
    v_failed := v_failed || text 'unknown checkout settled';
  exception when no_data_found then
    raise notice 'PASS  unknown checkout rejected';
  end;

  -- 8. subscription: invoice priced from the plan, reused until paid
  update public.subscriptions
     set status = 'past_due', trial_ends_at = now() - interval '1 day', current_period_end = null
   where madrasa_id = v_ma;
  v_sinv := public.open_subscription_invoice(v_ma);
  v_sinv2 := public.open_subscription_invoice(v_ma);
  if v_sinv.id <> v_sinv2.id
     or v_sinv.amount_due <> (select p.amount from public.subscription_plans p
                                join public.subscriptions s on s.plan_id = p.id
                               where s.madrasa_id = v_ma)
     or v_sinv.invoice_no !~ '^DMS-\d{4}-\d{6}$' then
    v_failed := v_failed || format('subscription invoice wrong: %s %s', v_sinv.invoice_no, v_sinv.amount_due);
  else raise notice 'PASS  subscription invoice % at plan price, reused', v_sinv.invoice_no; end if;

  insert into public.subscription_payments (madrasa_id, subscription_invoice_id, amount, currency, channel, provider, status, checkout_request_id)
  values (v_ma, v_sinv.id, v_sinv.amount_due, 'KES', 'mpesa', 'daraja', 'pending', 'ws_CO_VP_SUB')
  returning id into v_spay;

  -- 9. payment settles: one period, status active, owner told
  select * into r from public.settle_subscription_payment('ws_CO_VP_SUB', true, 'VPSUB0001',
                                                          v_sinv.amount_due, '{}'::jsonb, null);
  select current_period_end into v_end from public.subscriptions where madrasa_id = v_ma;
  if r.status <> 'success' or r.subscription_status <> 'active'
     or v_end < now() + interval '27 days' or v_end > now() + interval '32 days'
     or (select status from public.subscription_invoices where id = v_sinv.id) <> 'paid' then
    v_failed := v_failed || format('subscription settle: %s %s until %s', r.status, r.subscription_status, v_end);
  else raise notice 'PASS  subscription active until %', v_end::date; end if;

  select count(*) into v_n from public.notifications
   where user_id = v_owner and type = 'payment_receipt'
     and payload ->> 'subscription_payment_id' = v_spay::text;
  if v_n <> 1 then v_failed := v_failed || format('owner notices: %s', v_n);
  else raise notice 'PASS  owner notified once'; end if;

  -- 10. replay does not buy a second month
  perform public.settle_subscription_payment('ws_CO_VP_SUB', true, 'VPSUB0001', v_sinv.amount_due, '{}'::jsonb, null);
  if (select current_period_end from public.subscriptions where madrasa_id = v_ma) <> v_end then
    v_failed := v_failed || text 'replay extended the subscription';
  else raise notice 'PASS  replay does not extend the period'; end if;

  -- 11. the next invoice starts where the paid period ends
  v_sinv2 := public.open_subscription_invoice(v_ma);
  if v_sinv2.id = v_sinv.id or v_sinv2.period_start <> v_end then
    v_failed := v_failed || text 'next invoice does not follow the paid period';
  else raise notice 'PASS  next invoice starts at the end of the paid period'; end if;

  -- ------------------------------------------- subscription controls
  set local role authenticated;

  -- 12. an ordinary teacher cannot cancel
  perform set_config('request.jwt.claims', json_build_object('sub', v_teach::text, 'role', 'authenticated')::text, true);
  begin
    perform public.cancel_subscription('not mine');
    v_failed := v_failed || text 'a non-owner cancelled the subscription';
  exception when insufficient_privilege then
    raise notice 'PASS  a teacher who is not the owner cannot cancel';
  end;

  -- 13. the owner cancels: access runs to the end of the paid period
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  perform public.cancel_subscription('Closing for Ramadan');
  select * into r from public.subscriptions where madrasa_id = v_ma;
  if not r.cancel_at_period_end or r.cancelled_at is not null or r.status <> 'active' then
    v_failed := v_failed || format('cancel: %s %s %s', r.cancel_at_period_end, r.cancelled_at, r.status);
  else raise notice 'PASS  owner cancelled; still active until period end'; end if;

  -- 14. and resumes
  perform public.resume_subscription();
  select * into r from public.subscriptions where madrasa_id = v_ma;
  if r.cancel_at_period_end or r.cancellation_reason is not null then
    v_failed := v_failed || text 'resume did not clear the cancellation';
  else raise notice 'PASS  owner resumed'; end if;

  -- 15. the other madrasa's owner cancels only their own
  perform set_config('request.jwt.claims', json_build_object('sub', v_ownerb::text, 'role', 'authenticated')::text, true);
  perform public.cancel_subscription(null);
  if (select cancel_at_period_end from public.subscriptions where madrasa_id = v_ma) then
    v_failed := v_failed || text 'owner B cancelled madrasa A';
  else raise notice 'PASS  cancelling touches only the caller''s own madrasa'; end if;

  -- ------------------------------------------------------------ cards
  -- 16. another parent cannot touch the card
  perform set_config('request.jwt.claims', json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
  begin
    perform public.remove_saved_card(v_card);
    v_failed := v_failed || text 'another parent removed the card';
  exception when no_data_found then
    raise notice 'PASS  another parent cannot remove the card';
  end;

  -- 17. staff cannot manage a parent's card
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_default_card(v_card);
    v_failed := v_failed || text 'staff set a parent''s default card';
  exception when no_data_found then
    raise notice 'PASS  staff cannot manage a parent''s card';
  end;

  -- 18. the owner can set the madrasa card as the renewal card
  perform public.set_default_card(v_mcard);
  if (select default_card_id from public.subscriptions where madrasa_id = v_ma) is distinct from v_mcard then
    v_failed := v_failed || text 'madrasa default card not set';
  else raise notice 'PASS  owner set the madrasa renewal card'; end if;

  -- 19. a plain teacher cannot
  perform set_config('request.jwt.claims', json_build_object('sub', v_teach::text, 'role', 'authenticated')::text, true);
  begin
    perform public.remove_saved_card(v_mcard);
    v_failed := v_failed || text 'a non-owner removed the madrasa card';
  exception when no_data_found then
    raise notice 'PASS  a teacher who is not the owner cannot remove the madrasa card';
  end;

  -- 20. the parent picks a default, then removes a card
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  perform public.set_default_card(v_card2);
  select count(*) filter (where is_default) into v_n from public.saved_cards where parent_id = v_parent;
  if v_n <> 1 or not (select is_default from public.saved_cards where id = v_card2) then
    v_failed := v_failed || text 'default card not exclusive';
  else raise notice 'PASS  exactly one default card'; end if;
  perform public.remove_saved_card(v_card2);
  select count(*) into v_n from public.saved_cards where id = v_card2;
  if v_n <> 0 then v_failed := v_failed || text 'removed card still visible';
  else raise notice 'PASS  removed card disappears for its owner'; end if;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nPayment settlement rules hold.';
end $$;

rollback;
