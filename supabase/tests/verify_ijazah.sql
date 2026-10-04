-- Verifies migration 0030: a teacher records their own chain of transmission,
-- an ijazah carries a snapshot of it that the client cannot forge or change,
-- and the public check shows it. Runs inside a transaction that rolls back.
--
--   npm run db:verify:ijazah

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_student uuid;
  v_cert uuid;
  v_code text;
  v_tajweed uuid;
  r record;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'ij-owner@example.test'), (v_pupil, 'ij-pupil@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'Sheikh IJ Owner', 'ij-owner@example.test'),
    (v_pupil, 'student', null, 'IJ Pupil', 'ij-pupil@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status)
  values (v_ma, 'IJ Madrasa', 'ij-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'ij-owner@example.test', '+254712000021', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil);
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values (v_owner, v_ma, 'EMP-IJ1', true, 'active');
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_pupil, v_ma, extract(year from now())::int, date '2012-01-01', 'male') returning id into v_student;

  set local role authenticated;

  -- 1. a pupil cannot record a chain
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_my_sanad(array['Anyone']);
    v_failed := v_failed || text 'pupil recorded a chain';
  exception when insufficient_privilege then raise notice 'PASS  pupil cannot record a chain'; end;

  -- 2. the teacher records theirs; blanks dropped, names trimmed
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  perform public.set_my_sanad(array['  Sheikh Hassan Ali ', '', 'Sheikh Muhammad Nur']);
  reset role;
  if (select sanad from public.teachers where profile_id = v_owner) is distinct from array['Sheikh Hassan Ali', 'Sheikh Muhammad Nur'] then
    v_failed := v_failed || text 'chain not cleaned and saved';
  else raise notice 'PASS  teacher chain saved, trimmed, blanks dropped'; end if;

  -- 3. an over-long chain is refused
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_my_sanad(array_fill('X'::text, array[41]));
    v_failed := v_failed || text '41-name chain accepted';
  exception when invalid_parameter_value then raise notice 'PASS  over-long chain refused'; end;

  -- 4. an ijazah gets the database's chain, not the client's
  insert into public.certificates (student_id, madrasa_id, kind, title, verification_code, sanad)
  values (v_student, v_ma, 'ijazah', 'Ijazah in Hafs', 'pending', array['Forged Sheikh'])
  returning id, verification_code into v_cert, v_code;
  reset role;
  if (select sanad from public.certificates where id = v_cert)
       is distinct from array['Sheikh IJ Owner', 'Sheikh Hassan Ali', 'Sheikh Muhammad Nur'] then
    v_failed := v_failed || format('ijazah chain wrong: %s', (select sanad from public.certificates where id = v_cert));
  else raise notice 'PASS  ijazah carries awarding teacher then their chain'; end if;

  -- 5. other kinds carry no chain
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  insert into public.certificates (student_id, madrasa_id, kind, title, verification_code, sanad)
  values (v_student, v_ma, 'tajweed_level', 'Tajweed 1', 'pending', array['Forged']) returning id into v_tajweed;
  reset role;
  if (select sanad from public.certificates where id = v_tajweed) is not null then
    v_failed := v_failed || text 'non-ijazah certificate kept a chain';
  else raise notice 'PASS  other certificates carry no chain'; end if;

  -- 6. the chain on an issued ijazah cannot be edited, and survives the teacher editing theirs
  update public.certificates set sanad = array['Edited'] where id = v_cert;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  perform public.set_my_sanad(array['Someone Else']);
  reset role;
  if (select sanad[2] from public.certificates where id = v_cert) <> 'Sheikh Hassan Ali' then
    v_failed := v_failed || text 'issued chain was changed';
  else raise notice 'PASS  issued chain frozen'; end if;

  -- 7. the public check shows it
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select * into r from public.verify_certificate(v_code);
  reset role;
  if r.sanad is distinct from E'Sheikh IJ Owner\nSheikh Hassan Ali\nSheikh Muhammad Nur' or r.valid is not true then
    v_failed := v_failed || format('public check wrong: %s', r.sanad);
  else raise notice 'PASS  public check shows the chain'; end if;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nIjazah and sanad rules hold.';
end $$;

rollback;
