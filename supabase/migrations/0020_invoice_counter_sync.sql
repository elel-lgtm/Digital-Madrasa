-- ===========================================================================
-- 0020 — Invoice counter synchronisation
-- ===========================================================================
--
-- 0017 introduced a per-madrasa counter, but nothing ever reconciled it with
-- invoices that already existed. A madrasa whose invoices arrived by any other
-- route — the seed script, an import, a migration from a previous system — has
-- no counter row at all. `issue_invoices_for_students` then created one at 0,
-- allocated sequence 1, and collided with the INV-…-0001 already on disk:
--
--   23505 duplicate key value violates unique constraint "invoices_invoice_no_key"
--
-- The failure is permanent rather than transient. Every retry starts from 0
-- again, so such a madrasa can never issue another invoice.
--
-- Three things are wrong and all three are fixed here.
--
--   1. Uniqueness was enforced on the wrong scope. 0007 made `invoice_no`
--      globally unique, but 0017 documents the invariant as unique *per
--      madrasa* and allocates accordingly. With more than one madrasa the two
--      cannot both hold: every madrasa's first invoice of the year is
--      INV-<year>-0001, so the second tenant to issue one is rejected by a
--      constraint describing a rule the system does not actually have. This
--      has not bitten yet only because a single madrasa exists today.
--
--   2. Counters were never seeded from existing invoices.
--
--   3. Counter creation and locking were split across two statements, so the
--      lock could be skipped in the very case it exists for.
--
-- Existing invoices are not modified, renumbered, or deleted.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Uniqueness per madrasa, matching the documented invariant
-- ---------------------------------------------------------------------------

-- Per-madrasa first, so uniqueness is never unenforced in between.
create unique index if not exists invoices_madrasa_invoice_no_key
  on public.invoices (madrasa_id, invoice_no);

alter table public.invoices drop constraint if exists invoices_invoice_no_key;
drop index if exists public.invoices_invoice_no_key;

comment on index public.invoices_madrasa_invoice_no_key is
  'Invoice numbers are unique within a madrasa, not across the platform: each tenant numbers its own invoices from one.';

-- ---------------------------------------------------------------------------
-- 2. The high-water mark actually present in the invoices table
-- ---------------------------------------------------------------------------

-- Numbers carry a year (INV-2026-0007) but the counter deliberately does not
-- reset annually — resetting would reissue numbers a madrasa has already sent
-- out. So the high-water mark is the largest sequence across every year, and
-- rolling into a new year simply continues the run.
--
-- Soft-deleted invoices count. Their numbers were issued and may exist on
-- paper, so reusing them would be worse than leaving a gap.
create or replace function public.invoice_seq_high_water(p_madrasa_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    max((regexp_match(invoice_no, '^INV-[0-9]{4}-([0-9]+)$'))[1]::int),
    0
  )
  from public.invoices
  where madrasa_id = p_madrasa_id
    -- Anything not matching the scheme (hand-entered, legacy) cannot be
    -- compared numerically and must not abort the aggregate.
    and invoice_no ~ '^INV-[0-9]{4}-[0-9]+$';
$$;

revoke all on function public.invoice_seq_high_water(uuid) from public, anon, authenticated;

comment on function public.invoice_seq_high_water is
  'Largest invoice sequence already used by a madrasa, across all years. Used to seed and heal invoice_counters.';

-- ---------------------------------------------------------------------------
-- 3. Back-fill every madrasa's counter from the invoices it already has
-- ---------------------------------------------------------------------------

-- Idempotent: re-running moves a counter forward to the high-water mark and
-- never backwards, so a counter already ahead (numbers issued then deleted)
-- keeps its position and those numbers are not handed out twice.
insert into public.invoice_counters (madrasa_id, last_seq)
select m.id, public.invoice_seq_high_water(m.id)
from public.madrasas m
on conflict (madrasa_id) do update
  set last_seq = greatest(
    public.invoice_counters.last_seq,
    excluded.last_seq
  );

-- ---------------------------------------------------------------------------
-- 4. Allocation that seeds, heals and locks in one statement
-- ---------------------------------------------------------------------------

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

  -- Create the counter if missing, seeded from the invoices already on disk,
  -- and heal it if it has fallen behind them. `greatest` means the counter
  -- only ever moves forward, so a number is never handed out twice.
  --
  -- One statement rather than the previous insert-then-select-for-update: the
  -- `do update` takes the row lock even when the row already existed, and when
  -- two callers race to create it the loser blocks here and then sees the
  -- winner's row. Splitting the two left a window where the lock was silently
  -- skipped — exactly the race the counter exists to prevent.
  insert into public.invoice_counters as ic (madrasa_id, last_seq)
  values (p_madrasa_id, public.invoice_seq_high_water(p_madrasa_id))
  on conflict (madrasa_id) do update
    set last_seq = greatest(ic.last_seq, public.invoice_seq_high_water(p_madrasa_id))
  returning ic.last_seq into v_seq;

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
  'Allocates gapless per-madrasa invoice numbers under a row lock and creates the invoices in one transaction. Seeds and heals the counter from existing invoices so a madrasa whose invoices arrived by seed, import or migration can still issue.';
