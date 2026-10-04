-- Verifies migration 0034: only the pupil's own madrasa can list them, and
-- only with the guardian's agreement; sponsors see no name; a settled
-- sponsorship pays the invoice and tells the family. Runs inside a
-- transaction that rolls back.
--
--   npm run db:verify:sponsorship

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_owner2 uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_donor uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_student uuid;
  v_mum_row uuid; v_donor_row uuid;
  v_struct uuid := gen_random_uuid();
  v_inv uuid := gen_random_uuid();
  v_pay uuid;
  r record;
  v_n int;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'sp-owner@example.test'), (v_owner2, 'sp-owner2@example.test'), (v_mum, 'sp-mum@example.test'),
                 (v_donor, 'sp-donor@example.test'), (v_pupil, 'sp-pupil@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'SP Owner', 'sp-owner@example.test'),
    (v_owner2, 'teacher', null, 'SP Other', 'sp-owner2@example.test'),
    (v_mum, 'parent', null, 'SP Mum', 'sp-mum@example.test'),
    (v_donor, 'parent', null, 'SP Donor', 'sp-donor@example.test'),
    (v_pupil, 'student', null, 'Hidden Name', 'sp-pupil@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'SP Madrasa', 'sp-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'sp-owner@example.test', '+254712000061', 'active'),
    (v_other, 'SP Other', 'sp-' || substr(v_other::text, 1, 8), 'Mombasa', 'Mombasa', v_owner2, 'sp-owner2@example.test', '+254712000062', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil);
  update public.profiles set madrasa_id = v_other where id = v_owner2;
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-SP1', true, 'active'), (v_owner2, v_other, 'EMP-SP2', true, 'active');
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_pupil, v_ma, extract(year from now())::int, date '2013-01-01', 'female') returning id into v_student;

  select id into v_mum_row from public.parents where profile_id = v_mum;
  if v_mum_row is null then insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_mum_row; end if;
  select id into v_donor_row from public.parents where profile_id = v_donor;
  if v_donor_row is null then insert into public.parents (profile_id) values (v_donor) returning id into v_donor_row; end if;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status)
  values (v_mum_row, v_student, v_ma, 'mother', 'approved');

  insert into public.fee_structures (id, madrasa_id, name, amount, currency, applies_to, term, academic_year)
  values (v_struct, v_ma, 'SP Term', 1500, 'KES', 'all', 'Term 3', 2026);
  insert into public.invoices (id, madrasa_id, student_id, invoice_no, fee_structure_id,
                               amount_due, amount_paid, currency, due_date, status, issued_at, description)
  values (v_inv, v_ma, v_student, 'INV-SP-0001', v_struct, 1500, 0, 'KES', current_date + 10, 'issued', now(), 'sp');

  set local role authenticated;

  -- 1. another madrasa's teacher cannot list the pupil
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner2::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_sponsorship(v_student, true, 'x', true);
    v_failed := v_failed || text 'other madrasa listed the pupil';
  exception when insufficient_privilege then raise notice 'PASS  other madrasa refused'; end;

  -- 2. not without the guardian's agreement
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_sponsorship(v_student, true, 'x', false);
    v_failed := v_failed || text 'listed without guardian agreement';
  exception when invalid_parameter_value then raise notice 'PASS  guardian agreement required'; end;

  -- 3. nor by writing the row directly
  begin
    update public.students set sponsorship_open = true where id = v_student;
    if (select sponsorship_open from public.students where id = v_student) then
      v_failed := v_failed || text 'direct update listed the pupil';
    end if;
  exception when check_violation then raise notice 'PASS  direct update without agreement refused'; end;

  perform public.set_sponsorship(v_student, true, 'Wants to finish Juz Amma this year.', true);

  -- 4. a donor sees the pupil, anonymously, with the oldest open invoice
  perform set_config('request.jwt.claims', json_build_object('sub', v_donor::text, 'role', 'authenticated')::text, true);
  select * into r from public.sponsorable_students() where student_id = v_student;
  if r.needed is distinct from 1500 or r.invoice_id is distinct from v_inv or r.madrasa_name <> 'SP Madrasa' then
    v_failed := v_failed || format('listing wrong: %s %s', r.needed, r.invoice_id);
  elsif row_to_json(r)::text ilike '%Hidden Name%' then
    v_failed := v_failed || text 'listing reveals the name';
  else raise notice 'PASS  listed anonymously with what is owed'; end if;
  reset role;

  -- 5. anon cannot list
  set local role anon;
  begin
    perform * from public.sponsorable_students();
    v_failed := v_failed || text 'anon listed pupils';
  exception when insufficient_privilege then raise notice 'PASS  anon refused'; end;
  reset role;

  -- 6. a settled sponsorship pays the invoice and tells the family
  insert into public.payments (madrasa_id, parent_id, amount, currency, method, channel, provider, status, checkout_request_id, sponsored)
  values (v_ma, v_donor_row, 1500, 'KES', 'mpesa', 'mpesa', 'daraja', 'pending', 'ws_CO_SP_OK', true)
  returning id into v_pay;
  insert into public.payment_allocations (payment_id, invoice_id, madrasa_id, amount) values (v_pay, v_inv, v_ma, 1500);
  perform public.settle_fee_payment('ws_CO_SP_OK', true, 'SPREF1', 1500, '{}'::jsonb, null);

  if (select status from public.invoices where id = v_inv) <> 'paid' then
    v_failed := v_failed || text 'invoice not paid';
  else raise notice 'PASS  invoice paid'; end if;
  select count(*) into v_n from public.notifications where user_id = v_mum and payload ->> 'sponsored' = 'true';
  if v_n <> 1 then v_failed := v_failed || format('family told %s times', v_n);
  else raise notice 'PASS  family told'; end if;
  select count(*) into v_n from public.notifications where user_id = v_donor and type = 'payment_receipt';
  if v_n <> 1 then v_failed := v_failed || text 'donor got no receipt';
  else raise notice 'PASS  donor receipted'; end if;
  select count(*) into v_n from public.notifications where user_id = v_mum and body ilike '%SP Donor%';
  if v_n <> 0 then v_failed := v_failed || text 'family told the donor''s name'; end if;

  -- 7. once paid, the pupil drops off the list
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_donor::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.sponsorable_students() where student_id = v_student;
  reset role;
  if v_n <> 0 then v_failed := v_failed || text 'paid pupil still listed';
  else raise notice 'PASS  paid pupil no longer listed'; end if;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nSponsorship rules hold.';
end $$;

rollback;
