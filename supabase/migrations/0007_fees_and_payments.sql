-- ============================================================================
-- Digital Madrasa — 0007: fee structures, invoices, payments, receipts
-- ============================================================================

create table public.fee_structures (
  id            uuid primary key default gen_random_uuid(),
  madrasa_id    uuid not null references public.madrasas (id) on delete cascade,
  name          text not null,
  academic_year int not null check (academic_year between 2000 and 2100),
  term          text not null,
  amount        numeric(12,2) not null check (amount > 0),
  currency      char(3) not null default 'KES',
  applies_to    public.fee_scope not null,
  class_id      uuid references public.classes (id) on delete cascade,
  student_id    uuid references public.students (id) on delete cascade,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint fee_scope_target check (
    (applies_to = 'all'     and class_id is null and student_id is null)
    or (applies_to = 'class'   and class_id is not null)
    or (applies_to = 'student' and student_id is not null)
  )
);

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  madrasa_id       uuid not null references public.madrasas (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  invoice_no       text not null unique,
  fee_structure_id uuid references public.fee_structures (id) on delete set null,
  description      text not null,
  amount_due       numeric(12,2) not null check (amount_due > 0),
  amount_paid      numeric(12,2) not null default 0 check (amount_paid >= 0),
  currency         char(3) not null default 'KES',
  due_date         date not null,
  status           public.invoice_status not null default 'draft',
  issued_at        timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint invoice_not_overpaid check (amount_paid <= amount_due)
);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  madrasa_id          uuid not null references public.madrasas (id) on delete cascade,
  parent_id           uuid references public.parents (id) on delete set null,
  amount              numeric(12,2) not null check (amount > 0),
  currency            char(3) not null default 'KES',
  method              public.payment_method not null,
  -- M-Pesa receipt / Stripe intent. Unique, which is what makes a replayed
  -- callback a no-op rather than a double credit.
  provider_ref        text unique,
  checkout_request_id text unique,
  status              public.payment_status not null default 'initiated',
  -- Stored verbatim for dispute resolution and chargebacks.
  raw_callback        jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  settled_at          timestamptz
);

-- A single M-Pesa payment can settle several invoices (siblings in one go).
create table public.payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  madrasa_id uuid not null references public.madrasas (id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

create table public.receipts (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments (id) on delete cascade,
  madrasa_id uuid not null references public.madrasas (id) on delete cascade,
  receipt_no text not null unique,
  pdf_url    text,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index fee_structures_madrasa_idx on public.fee_structures (madrasa_id)
  where deleted_at is null;
create index invoices_madrasa_idx  on public.invoices (madrasa_id, due_date desc)
  where deleted_at is null;
create index invoices_student_idx  on public.invoices (student_id, due_date desc)
  where deleted_at is null;
create index invoices_status_idx   on public.invoices (madrasa_id, status)
  where deleted_at is null;
create index payments_madrasa_idx  on public.payments (madrasa_id, created_at desc);
create index payments_parent_idx   on public.payments (parent_id, created_at desc);
create index payments_pending_idx  on public.payments (status, created_at)
  where status in ('initiated', 'pending');
create index allocations_invoice_idx on public.payment_allocations (invoice_id);

create trigger trg_fee_structures_updated_at before update on public.fee_structures
  for each row execute function public.set_updated_at();
create trigger trg_invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- invoice status ----
-- Status is derived, never sent by a client.

create or replace function public.refresh_invoice_status()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('void', 'draft') then
    return new;
  end if;

  if new.amount_paid >= new.amount_due then
    new.status := 'paid';
  elsif new.due_date < current_date then
    new.status := 'overdue';
  elsif new.amount_paid > 0 then
    new.status := 'partially_paid';
  else
    new.status := 'issued';
  end if;
  return new;
end;
$$;

create trigger trg_invoices_refresh_status
  before insert or update of amount_paid, amount_due, due_date on public.invoices
  for each row execute function public.refresh_invoice_status();

-- Applies a successful payment across its invoices inside one transaction.
-- Called by the mpesa-callback Edge Function, which is idempotent on
-- payments.provider_ref.
create or replace function public.apply_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric(12,2);
  v_alloc     record;
begin
  select amount into v_remaining from public.payments where id = p_payment_id for update;
  if v_remaining is null then
    raise exception 'payment % not found', p_payment_id;
  end if;

  for v_alloc in
    select a.invoice_id, i.amount_due - i.amount_paid as owed
      from public.payment_allocations a
      join public.invoices i on i.id = a.invoice_id
     where a.payment_id = p_payment_id
     order by i.due_date asc
     for update of i
  loop
    exit when v_remaining <= 0;
    update public.invoices
       set amount_paid = amount_paid + least(v_alloc.owed, v_remaining)
     where id = v_alloc.invoice_id;
    v_remaining := v_remaining - least(v_alloc.owed, v_remaining);
  end loop;
end;
$$;

revoke execute on function public.apply_payment(uuid) from public, authenticated;
