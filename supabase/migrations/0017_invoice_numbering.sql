-- ===========================================================================
-- 0017 — Race-safe invoice numbering
-- ===========================================================================
--
-- Invoice numbers must be unique per madrasa and must not skip. Computing
-- `count(*) + 1` in application code races: two staff issuing invoices at the
-- same moment both read the same count and both write the same number. The
-- unique constraint then rejects one of them, and the failure surfaces as a
-- mysterious half-completed batch.
--
-- A per-madrasa counter row with a lock makes allocation serial. Invoices are
-- created in the same transaction, so a failure leaves neither the numbers
-- nor the rows behind.
-- ===========================================================================

create table if not exists public.invoice_counters (
  madrasa_id uuid primary key references public.madrasas(id) on delete cascade,
  last_seq   int not null default 0
);

alter table public.invoice_counters enable row level security;
alter table public.invoice_counters force row level security;

-- No policies on purpose: only SECURITY DEFINER functions touch this, and a
-- client able to read it could infer another madrasa's invoice volume.

create or replace function public.issue_invoices_for_students(
  p_madrasa_id       uuid,
  p_fee_structure_id uuid,
  p_student_ids      uuid[],
  p_due_date         date,
  p_description      text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount   numeric(12,2);
  v_currency text;
  v_year     int := extract(year from now())::int;
  v_student  uuid;
  v_seq      int;
  v_created  int := 0;
begin
  -- The amount comes from the fee structure, never from the caller.
  select amount, currency into v_amount, v_currency
    from public.fee_structures
   where id = p_fee_structure_id and madrasa_id = p_madrasa_id;

  if v_amount is null then
    raise exception 'fee structure not found for this madrasa';
  end if;

  -- Take the counter row and hold it for the rest of the transaction. Any
  -- concurrent call waits here rather than racing.
  insert into public.invoice_counters (madrasa_id, last_seq)
  values (p_madrasa_id, 0)
  on conflict (madrasa_id) do nothing;

  perform 1 from public.invoice_counters
   where madrasa_id = p_madrasa_id
     for update;

  foreach v_student in array p_student_ids loop
    -- Skip a student who already has an unpaid invoice for this structure,
    -- so re-running a batch tops up rather than double-billing a family.
    if exists (
      select 1 from public.invoices
       where student_id = v_student
         and fee_structure_id = p_fee_structure_id
         and status <> 'void'
    ) then
      continue;
    end if;

    update public.invoice_counters
       set last_seq = last_seq + 1
     where madrasa_id = p_madrasa_id
    returning last_seq into v_seq;

    insert into public.invoices (
      madrasa_id, student_id, invoice_no, fee_structure_id,
      amount_due, amount_paid, currency, due_date, status,
      issued_at, description
    ) values (
      p_madrasa_id, v_student,
      'INV-' || v_year::text || '-' || lpad(v_seq::text, 4, '0'),
      p_fee_structure_id,
      v_amount, 0, coalesce(v_currency, 'KES'), p_due_date, 'issued',
      now(), p_description
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.issue_invoices_for_students(uuid, uuid, uuid[], date, text) from public, anon, authenticated;
grant execute on function public.issue_invoices_for_students(uuid, uuid, uuid[], date, text) to service_role;

comment on function public.issue_invoices_for_students is
  'Allocates gapless per-madrasa invoice numbers under a row lock and creates the invoices in one transaction.';
