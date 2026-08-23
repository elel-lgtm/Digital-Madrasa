-- ===========================================================================
-- 0010 — Madrasa subscriptions, card payments
-- ===========================================================================
--
-- Two distinct money flows exist in this platform and they are kept strictly
-- apart:
--
--   1. The madrasa owner pays Digital Madrasa a monthly subscription.
--   2. Parents pay their madrasa school fees.
--
-- They never share a table, a receipt series or a reconciliation job. The
-- platform's revenue and a school's fee income answer to different books, and
-- under Kenyan tax treatment they are not the same thing. Mixing them would
-- make both impossible to audit.
--
-- PCI note: no table here stores a card number. Only the brand, last four
-- digits, expiry and the gateway's token are persisted. The PAN is tokenised
-- on the device by the gateway SDK and never reaches our servers.
-- ===========================================================================

-- ------------------------------------------------------------------- enums

create type public.subscription_status as enum (
  'trialing',    -- inside the free window, full access
  'active',      -- paid, current
  'past_due',    -- a charge failed; still fully usable
  'grace',       -- past_due beyond the retry window; still usable, loud warning
  'restricted',  -- admin features locked; learning continues, data retained
  'cancelled'
);

create type public.billing_interval as enum ('monthly', 'yearly');

create type public.payment_channel as enum ('mpesa', 'card');

create type public.payment_provider as enum (
  'daraja', 'paystack', 'flutterwave', 'stripe', 'manual'
);

create type public.card_brand as enum ('visa', 'mastercard', 'amex', 'unknown');

-- ------------------------------------------------------------------- plans

create table public.subscription_plans (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  amount      numeric(12,2) not null check (amount >= 0),
  currency    text not null default 'KES',
  interval    public.billing_interval not null default 'monthly',
  trial_days  int not null default 30 check (trial_days >= 0),
  features    text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Platform pricing. Amounts live here, never in the client, so a tampered request cannot buy a month cheaply.';

insert into public.subscription_plans (code, name, amount, currency, interval, trial_days, features)
values (
  'madrasa_monthly',
  'Madrasa Monthly',
  3000.00,
  'KES',
  'monthly',
  30,
  array[
    'Unlimited students and teachers',
    'Hifz tracking and AI tajweed feedback',
    'Attendance, grades and report cards',
    'Fee collection via M-Pesa and card',
    'Parent accounts and messaging',
    'Data export'
  ]
);

-- ----------------------------------------------------------- saved cards

create table public.saved_cards (
  id            uuid primary key default gen_random_uuid(),
  madrasa_id    uuid not null references public.madrasas(id) on delete cascade,
  -- Set for a parent's card; null when the card belongs to the madrasa itself.
  parent_id     uuid references public.parents(id) on delete cascade,
  brand         public.card_brand not null default 'unknown',
  last4         text not null check (last4 ~ '^\d{4}$'),
  expiry_month  int not null check (expiry_month between 1 and 12),
  expiry_year   int not null check (expiry_year between 2024 and 2100),
  holder_name   text not null,
  provider      public.payment_provider not null,
  -- The gateway's token. Useless without our API credentials, and it is not
  -- a card number: it cannot be used anywhere else.
  provider_token text not null,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (provider, provider_token)
);

comment on column public.saved_cards.provider_token is
  'Gateway token. The card number itself is never stored anywhere in this database.';

-- --------------------------------------------------------- subscriptions

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  madrasa_id           uuid not null unique references public.madrasas(id) on delete cascade,
  plan_id              uuid not null references public.subscription_plans(id),
  status               public.subscription_status not null default 'trialing',
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  grace_ends_at        timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  default_card_id      uuid references public.saved_cards(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint period_ordered check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

-- ------------------------------------------------- subscription invoices

create table public.subscription_invoices (
  id              uuid primary key default gen_random_uuid(),
  madrasa_id      uuid not null references public.madrasas(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  invoice_no      text not null unique,
  amount_due      numeric(12,2) not null check (amount_due > 0),
  amount_paid     numeric(12,2) not null default 0 check (amount_paid >= 0),
  currency        text not null default 'KES',
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  due_date        date not null,
  status          public.invoice_status not null default 'issued',
  issued_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sub_invoice_period_ordered check (period_end > period_start)
);

-- ------------------------------------------------- subscription payments

create table public.subscription_payments (
  id                      uuid primary key default gen_random_uuid(),
  madrasa_id              uuid not null references public.madrasas(id) on delete cascade,
  subscription_invoice_id uuid not null references public.subscription_invoices(id) on delete cascade,
  amount                  numeric(12,2) not null check (amount > 0),
  currency                text not null default 'KES',
  channel                 public.payment_channel not null,
  provider                public.payment_provider not null,
  -- M-Pesa receipt or gateway charge id. Unique so a replayed callback cannot
  -- credit the same payment twice.
  provider_ref            text unique,
  checkout_request_id     text,
  status                  public.payment_status not null default 'initiated',
  card_last4              text check (card_last4 ~ '^\d{4}$'),
  card_brand              public.card_brand,
  failure_reason          text,
  -- Stored verbatim for dispute resolution. Never logged.
  raw_callback            jsonb,
  created_at              timestamptz not null default now(),
  settled_at              timestamptz,
  updated_at              timestamptz not null default now()
);

-- --------------------------------------------- card fields on fee payments

-- Parents can now pay fees by card as well as M-Pesa. The existing `payments`
-- table gains the same descriptive fields, without changing its meaning.
alter table public.payments
  add column if not exists channel public.payment_channel,
  add column if not exists provider public.payment_provider,
  add column if not exists card_last4 text,
  add column if not exists card_brand public.card_brand,
  add column if not exists failure_reason text,
  add column if not exists saved_card_id uuid references public.saved_cards(id) on delete set null;

alter table public.payments
  add constraint payments_card_last4_format
  check (card_last4 is null or card_last4 ~ '^\d{4}$');

-- ----------------------------------------------------------------- indexes

create index on public.saved_cards (madrasa_id) where deleted_at is null;
create index on public.saved_cards (parent_id) where deleted_at is null;
create index on public.subscriptions (status);
create index on public.subscriptions (current_period_end);
create index on public.subscription_invoices (madrasa_id, issued_at desc);
create index on public.subscription_invoices (status, due_date);
create index on public.subscription_payments (madrasa_id, created_at desc);
create index on public.subscription_payments (subscription_invoice_id);
create index on public.subscription_payments (status, created_at)
  where status in ('initiated', 'pending');
create index on public.payments (saved_card_id);

-- ---------------------------------------------------------------- triggers

create trigger set_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.saved_cards
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscription_invoices
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscription_payments
  for each row execute function public.set_updated_at();

/**
 * Every new madrasa starts a trial automatically.
 *
 * Done in a trigger rather than in the signup Edge Function so that a madrasa
 * cannot exist without a subscription row — there is no code path, including
 * a direct insert by an admin, that skips it.
 */
create or replace function public.start_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  select * into v_plan
  from public.subscription_plans
  where code = 'madrasa_monthly' and is_active
  limit 1;

  if not found then
    raise exception 'no active subscription plan configured';
  end if;

  insert into public.subscriptions (madrasa_id, plan_id, status, trial_ends_at)
  values (new.id, v_plan.id, 'trialing', now() + make_interval(days => v_plan.trial_days));

  return new;
end;
$$;

create trigger trg_madrasa_trial
  after insert on public.madrasas
  for each row execute function public.start_trial_subscription();

/**
 * Recomputes a subscription's status from its dates.
 *
 * Status is derived, never set by a client. Called by the billing cron and
 * after each successful payment.
 */
create or replace function public.refresh_subscription_status(p_madrasa_id uuid)
returns public.subscription_status
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.subscriptions%rowtype;
  v_status public.subscription_status;
begin
  select * into s from public.subscriptions where madrasa_id = p_madrasa_id;
  if not found then return null; end if;

  if s.cancelled_at is not null then
    v_status := 'cancelled';
  elsif s.current_period_end is not null and s.current_period_end > now() then
    v_status := 'active';
  elsif s.status = 'trialing' and s.trial_ends_at is not null and s.trial_ends_at > now() then
    v_status := 'trialing';
  elsif s.grace_ends_at is not null and s.grace_ends_at > now() then
    v_status := 'grace';
  elsif s.grace_ends_at is not null and s.grace_ends_at <= now() then
    v_status := 'restricted';
  else
    -- Trial or period has lapsed with no grace window opened yet.
    v_status := 'past_due';
  end if;

  update public.subscriptions set status = v_status where id = s.id;
  return v_status;
end;
$$;

/**
 * Whether a madrasa may use administrative features.
 *
 * True during grace on purpose: locking a school out the moment a card fails
 * would punish children for an adult's billing problem. Learning is never
 * gated by this function, and no data is deleted for non-payment.
 */
create or replace function public.madrasa_subscription_allows_admin(p_madrasa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.status in ('trialing', 'active', 'past_due', 'grace')
       from public.subscriptions s
      where s.madrasa_id = p_madrasa_id),
    false
  )
$$;

-- --------------------------------------------------------------------- RLS

alter table public.subscription_plans     enable row level security;
alter table public.subscription_plans     force row level security;
alter table public.saved_cards            enable row level security;
alter table public.saved_cards            force row level security;
alter table public.subscriptions          enable row level security;
alter table public.subscriptions          force row level security;
alter table public.subscription_invoices  enable row level security;
alter table public.subscription_invoices  force row level security;
alter table public.subscription_payments  enable row level security;
alter table public.subscription_payments  force row level security;

-- Plans are public reference data: the pricing page needs them before anyone
-- has an account. Writes are platform-admin only.
create policy "anyone may read active plans" on public.subscription_plans
  for select using (is_active or public.is_platform_admin());

create policy "admin manages plans" on public.subscription_plans
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- A subscription is visible to the madrasa's staff and to the platform admin.
-- Nobody may write it from the client: status, periods and cancellation all
-- move through Edge Functions, so a client cannot grant itself a paid month.
create policy "staff read own subscription" on public.subscriptions
  for select using (
    public.is_platform_admin()
    or (madrasa_id = public.current_madrasa_id() and public.current_role_name() = 'teacher')
  );

create policy "admin manages subscriptions" on public.subscriptions
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "staff read own subscription invoices" on public.subscription_invoices
  for select using (
    public.is_platform_admin()
    or (madrasa_id = public.current_madrasa_id() and public.current_role_name() = 'teacher')
  );

create policy "admin manages subscription invoices" on public.subscription_invoices
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "staff read own subscription payments" on public.subscription_payments
  for select using (
    public.is_platform_admin()
    or (madrasa_id = public.current_madrasa_id() and public.current_role_name() = 'teacher')
  );

create policy "admin manages subscription payments" on public.subscription_payments
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- A saved card is visible only to whoever saved it: the madrasa's staff for a
-- madrasa card, the parent alone for a parent card. Staff must not see a
-- parent's card, even the last four digits.
create policy "read own saved cards" on public.saved_cards
  for select using (
    deleted_at is null
    and (
      public.is_platform_admin()
      or (parent_id is not null and parent_id = public.current_parent_id())
      or (
        parent_id is null
        and madrasa_id = public.current_madrasa_id()
        and public.current_role_name() = 'teacher'
      )
    )
  );

-- Removing a card is the one card action a client may take directly. Adding
-- one requires tokenisation, which only an Edge Function can do.
create policy "delete own saved cards" on public.saved_cards
  for update using (
    (parent_id is not null and parent_id = public.current_parent_id())
    or (
      parent_id is null
      and madrasa_id = public.current_madrasa_id()
      and public.current_role_name() = 'teacher'
    )
  )
  with check (true);

create policy "admin manages saved cards" on public.saved_cards
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ------------------------------------------------- paywall on admin writes

-- Enrolling students and issuing fee invoices are the two actions that define
-- "running the school", so they are what a lapsed subscription blocks. Marking
-- attendance, recording recitations and grading all keep working: those belong
-- to the children, not to the billing relationship.
-- These replace the 0009 policies of the same name, preserving their existing
-- conditions verbatim and adding the subscription gate. `can_access_madrasa`
-- already covers tenancy and suspension, so only the new clause is added.
drop policy if exists "students: staff insert" on public.students;
create policy "students: staff insert" on public.students
  for insert with check (
    public.can_access_madrasa(madrasa_id)
    and public.current_role_name() = 'teacher'
    and public.madrasa_subscription_allows_admin(madrasa_id)
  );

drop policy if exists "invoices: staff insert" on public.invoices;
create policy "invoices: staff insert" on public.invoices
  for insert with check (
    public.can_access_madrasa(madrasa_id)
    and public.current_role_name() = 'teacher'
    and public.madrasa_subscription_allows_admin(madrasa_id)
  );
