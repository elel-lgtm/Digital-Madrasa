-- Proves invoice numbering allocates correctly against the live schema, in a
-- transaction that rolls back. Covers the cases that produced the production
-- failure: a madrasa with invoices but no counter row, and a counter that has
-- drifted from the invoices actually present.
--
--   npm run db:verify:invoices

begin;

do $$
declare
  v_m1       uuid := gen_random_uuid();
  v_m2       uuid := gen_random_uuid();
  v_owner1   uuid := gen_random_uuid();
  v_owner2   uuid := gen_random_uuid();
  v_struct1  uuid := gen_random_uuid();
  v_struct2  uuid := gen_random_uuid();
  v_pupils1  uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_pupils2  uuid[] := array[gen_random_uuid()];
  v_created  int;
  v_seq      int;
  v_text     text;
  v_failed   text[] := '{}';
  v_pupil    uuid;
begin
  -- ---------------------------------------------------------------- fixtures
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'inv-' || substr(u::text, 1, 8) || '@example.test', '', now(), now(), now()
  from unnest(array[v_owner1, v_owner2] || v_pupils1 || v_pupils2) u;

  insert into public.profiles (id, role, madrasa_id, full_name, email)
  select u, 'student', null, 'Inv Pupil', 'inv-' || substr(u::text, 1, 8) || '@example.test'
  from unnest(v_pupils1 || v_pupils2) u;

  insert into public.profiles (id, role, madrasa_id, full_name, email)
  values (v_owner1, 'teacher', null, 'Inv Owner 1', 'inv-' || substr(v_owner1::text, 1, 8) || '@example.test'),
         (v_owner2, 'teacher', null, 'Inv Owner 2', 'inv-' || substr(v_owner2::text, 1, 8) || '@example.test');

  insert into public.madrasas (id, name, slug, county, town, owner_id,
                               contact_email, contact_phone, status)
  values (v_m1, 'Inv Madrasa One', 'inv-one-' || substr(v_m1::text, 1, 8), 'Mandera', 'Mandera',
          v_owner1, 'one@example.test', '+254700000001', 'active'),
         (v_m2, 'Inv Madrasa Two', 'inv-two-' || substr(v_m2::text, 1, 8), 'Wajir', 'Wajir',
          v_owner2, 'two@example.test', '+254700000002', 'active');

  update public.profiles set madrasa_id = v_m1 where id = v_owner1 or id = any(v_pupils1);
  update public.profiles set madrasa_id = v_m2 where id = v_owner2 or id = any(v_pupils2);

  insert into public.students (id, madrasa_id, profile_id, date_of_birth, gender)
  select u, v_m1, u, date '2015-01-01', 'male' from unnest(v_pupils1) u;
  insert into public.students (id, madrasa_id, profile_id, date_of_birth, gender)
  select u, v_m2, u, date '2015-01-01', 'male' from unnest(v_pupils2) u;

  insert into public.fee_structures (id, madrasa_id, name, amount, currency,
                                     applies_to, term, academic_year)
  values (v_struct1, v_m1, 'Inv Term', 1000, 'KES', 'all', 'Term 1', 2026),
         (v_struct2, v_m2, 'Inv Term', 1000, 'KES', 'all', 'Term 1', 2026);

  -- ============================================================== CASE 7
  -- Invoices already exist, no counter row — the exact production failure.
  insert into public.invoices (madrasa_id, student_id, invoice_no, fee_structure_id,
                               amount_due, amount_paid, currency, due_date, status,
                               issued_at, description)
  values (v_m1, v_pupils1[1], 'INV-2026-0001', v_struct1,
          1000, 0, 'KES', date '2026-10-01', 'issued', now(), 'pre-existing');

  delete from public.invoice_counters where madrasa_id = v_m1;

  begin
    v_created := public.issue_invoices_for_students(
      v_m1, v_struct1, array[v_pupils1[2], v_pupils1[3]], date '2026-10-02', 'batch a');
  exception when others then
    v_failed := v_failed || format('missing counter row still fails: %s', sqlerrm);
    v_created := -1;
  end;

  if v_created <> 2 then
    v_failed := v_failed || format('expected 2 invoices from a seeded madrasa, got %s', v_created);
  end if;

  -- ============================================================== CASE 3 + 4
  -- Numbering continues past the pre-existing invoice, sequentially.
  select string_agg(invoice_no, ',' order by invoice_no) into v_text
    from public.invoices where madrasa_id = v_m1;

  if v_text <> 'INV-2026-0001,INV-2026-0002,INV-2026-0003' then
    v_failed := v_failed || format('expected a gapless run, got %s', v_text);
  end if;

  -- ============================================================== CASE 1
  -- The pre-existing invoice was not renumbered or removed.
  if not exists (
    select 1 from public.invoices
     where madrasa_id = v_m1 and invoice_no = 'INV-2026-0001' and description = 'pre-existing'
  ) then
    v_failed := v_failed || 'the pre-existing invoice was modified';
  end if;

  -- ============================================================== CASE 5
  -- A second madrasa numbers from one, independently, and the two coexist.
  v_created := public.issue_invoices_for_students(
    v_m2, v_struct2, v_pupils2, date '2026-10-02', 'batch b');

  select invoice_no into v_text from public.invoices where madrasa_id = v_m2;

  if v_text <> 'INV-2026-0001' then
    v_failed := v_failed || format('second madrasa should start at 0001, got %s', v_text);
  end if;

  if (select count(*) from public.invoices
       where invoice_no = 'INV-2026-0001' and madrasa_id in (v_m1, v_m2)) <> 2 then
    v_failed := v_failed || 'two madrasas cannot both hold INV-2026-0001';
  end if;

  -- ============================================================== CASE 6
  -- A counter deliberately pushed behind its invoices heals rather than
  -- colliding, and one pushed ahead keeps its position.
  update public.invoice_counters set last_seq = 0 where madrasa_id = v_m1;

  begin
    v_created := public.issue_invoices_for_students(
      v_m1, v_struct1, array[v_pupils1[1]], date '2026-10-02', 'heal');
  exception when others then
    v_failed := v_failed || format('counter behind max did not heal: %s', sqlerrm);
  end;

  select last_seq into v_seq from public.invoice_counters where madrasa_id = v_m1;
  if v_seq < 3 then
    v_failed := v_failed || format('counter should have healed to at least 3, got %s', v_seq);
  end if;

  update public.invoice_counters set last_seq = 99 where madrasa_id = v_m1;
  perform public.issue_invoices_for_students(
    v_m1, v_struct1, array[v_pupils1[1]], date '2026-10-02', 'ahead');
  select last_seq into v_seq from public.invoice_counters where madrasa_id = v_m1;
  if v_seq < 99 then
    v_failed := v_failed || format('a counter ahead of max must not move backwards, got %s', v_seq);
  end if;

  -- ============================================================== CASE 9
  -- Uniqueness is still enforced, now per madrasa.
  begin
    insert into public.invoices (madrasa_id, student_id, invoice_no, fee_structure_id,
                                 amount_due, amount_paid, currency, due_date, status,
                                 issued_at, description)
    values (v_m1, v_pupils1[1], 'INV-2026-0001', v_struct1,
            1000, 0, 'KES', date '2026-10-01', 'issued', now(), 'dupe');
    v_failed := v_failed || 'a duplicate invoice_no within one madrasa was accepted';
  exception when unique_violation then
    null; -- expected
  end;

  -- ============================================================== CASE 8 (partial)
  -- Sequential allocation within one call never repeats a number.
  if exists (
    select invoice_no from public.invoices
     where madrasa_id = v_m1 group by invoice_no having count(*) > 1
  ) then
    v_failed := v_failed || 'duplicate invoice numbers within a madrasa';
  end if;

  -- ------------------------------------------------------------------ report
  if array_length(v_failed, 1) is null then
    raise notice '✓ Invoice numbering behaves correctly.';
  else
    raise exception E'\n✗ %', array_to_string(v_failed, E'\n✗ ');
  end if;
end $$;

rollback;
