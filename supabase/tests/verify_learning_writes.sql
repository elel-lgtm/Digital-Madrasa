-- Verifies migration 0023 against the live schema: who may hand in work,
-- what a student can and cannot change on it, and that certificates get an
-- unforgeable code, notify the family and verify publicly. Runs inside a
-- transaction that rolls back, so it leaves nothing behind.
--
--   npm run db:verify:learning

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();   -- madrasa A
  v_mb uuid := gen_random_uuid();   -- madrasa B
  v_owner uuid := gen_random_uuid();
  v_ownerb uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_teacher uuid;
  v_class1 uuid := gen_random_uuid();
  v_class2 uuid := gen_random_uuid();
  v_classb uuid := gen_random_uuid();
  v_student uuid;
  v_parent uuid;
  v_as1 uuid := gen_random_uuid();  -- assignment in the pupil's class
  v_as2 uuid := gen_random_uuid();  -- assignment in another class
  v_asb uuid := gen_random_uuid();  -- assignment in another madrasa
  v_sub uuid;
  v_cert uuid;
  v_code text;
  v_n int;
  r record;
  v_failed text[] := '{}';
begin
  -- ------------------------------------------------------------ fixtures
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'lw-owner@example.test'), (v_ownerb, 'lw-ownerb@example.test'),
                 (v_pupil, 'lw-pupil@example.test'), (v_mum, 'lw-mum@example.test')) t(id, e);

  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'LW Owner', 'lw-owner@example.test'),
    (v_ownerb, 'teacher', null, 'LW Owner B', 'lw-ownerb@example.test'),
    (v_pupil, 'student', null, 'LW Pupil', 'lw-pupil@example.test'),
    (v_mum, 'parent', null, 'LW Mum', 'lw-mum@example.test');

  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'LW Madrasa A', 'lw-a-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'lw-owner@example.test', '+254712000001', 'active'),
    (v_mb, 'LW Madrasa B', 'lw-b-' || substr(v_mb::text, 1, 8), 'Wajir', 'Wajir', v_ownerb, 'lw-ownerb@example.test', '+254712000002', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil, v_mum);
  update public.profiles set madrasa_id = v_mb where id = v_ownerb;

  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status)
  values (v_owner, v_ma, 'EMP-LW1', true, 'active') returning id into v_teacher;

  insert into public.classes (id, madrasa_id, name, level, capacity) values
    (v_class1, v_ma, 'LW Hifz', 'Level 1', 30),
    (v_class2, v_ma, 'LW Tajweed', 'Level 1', 30),
    (v_classb, v_mb, 'LW Other', 'Level 1', 30);

  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_pupil, v_ma, extract(year from now())::int, date '2014-01-01', 'female', v_class1)
  returning id into v_student;

  insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_parent;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status)
  values (v_parent, v_student, v_ma, 'mother', 'approved');

  insert into public.assignments (id, madrasa_id, class_id, title, instructions, assignment_type, due_at) values
    (v_as1, v_ma, v_class1, 'LW essay', 'Write about ikhfa', 'written', now() + interval '3 days'),
    (v_as2, v_ma, v_class2, 'LW other class', 'Not yours', 'written', now() + interval '3 days'),
    (v_asb, v_mb, v_classb, 'LW other madrasa', 'Not yours', 'written', now() + interval '3 days');

  -- ------------------------------------------------------- as the pupil
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil::text, 'role', 'authenticated')::text, true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_pupil then
    raise exception 'harness broken: acting as % / %', current_user, auth.uid();
  end if;

  -- 1. own class: accepted, and the supplied score/status are ignored
  insert into public.submissions (assignment_id, student_id, madrasa_id, text_body, status, score)
  values (v_as1, v_student, v_ma, 'first draft', 'graded', 100) returning id into v_sub;
  select status, score into r from public.submissions where id = v_sub;
  if r.status <> 'pending' or r.score is not null then
    v_failed := v_failed || format('student set own status/score: %s / %s', r.status, r.score);
  else raise notice 'PASS  submission accepted; status forced pending, score ignored'; end if;

  -- 2. another class of the same madrasa: refused
  begin
    insert into public.submissions (assignment_id, student_id, madrasa_id, text_body)
    values (v_as2, v_student, v_ma, 'wrong class');
    v_failed := v_failed || text 'submission to another class was ACCEPTED';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS  submission to another class refused';
  end;

  -- 3. another madrasa: refused
  begin
    insert into public.submissions (assignment_id, student_id, madrasa_id, text_body)
    values (v_asb, v_student, v_mb, 'wrong madrasa');
    v_failed := v_failed || text 'submission to another madrasa was ACCEPTED';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS  submission to another madrasa refused';
  end;

  -- 4. revise while pending; a score smuggled in is dropped
  update public.submissions set text_body = 'second draft', score = 99 where id = v_sub;
  select text_body, score into r from public.submissions where id = v_sub;
  if r.text_body <> 'second draft' or r.score is not null then
    v_failed := v_failed || format('pending revision wrong: %s / %s', r.text_body, r.score);
  else raise notice 'PASS  pending submission revised; smuggled score dropped'; end if;

  -- 9. a student cannot issue a certificate
  begin
    insert into public.certificates (student_id, madrasa_id, kind, title, verification_code)
    values (v_student, v_ma, 'juz_completion', 'Self-awarded', 'X');
    v_failed := v_failed || text 'student issued a certificate';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS  student cannot issue a certificate';
  end;

  -- ------------------------------------------------------- as the teacher
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  -- 5. grading: mark lands, the student's text is untouched
  update public.submissions set score = 80, status = 'graded', text_body = 'teacher rewrite' where id = v_sub;
  select text_body, score, status into r from public.submissions where id = v_sub;
  if r.score <> 80 or r.status <> 'graded' or r.text_body <> 'second draft' then
    v_failed := v_failed || format('grading wrong: %s / %s / %s', r.score, r.status, r.text_body);
  else raise notice 'PASS  graded; student text preserved'; end if;

  -- 7. issue a certificate; the supplied code is replaced
  insert into public.certificates (student_id, madrasa_id, kind, title, verification_code)
  values (v_student, v_ma, 'juz_completion', 'Juz 30 completed', 'AAAAAAAAAA')
  returning id, verification_code into v_cert, v_code;
  if v_code = 'AAAAAAAAAA' or v_code !~ '^[A-HJ-NP-Z2-9]{10}$' then
    v_failed := v_failed || format('certificate code not generated: %s', v_code);
  else raise notice 'PASS  certificate code generated: %', v_code; end if;

  -- 11a. staff cannot edit a certificate after issue
  update public.certificates set verification_code = 'BBBBBBBBBB', title = 'Edited' where id = v_cert;
  if (select verification_code from public.certificates where id = v_cert) <> v_code
     or (select title from public.certificates where id = v_cert) <> 'Juz 30 completed' then
    v_failed := v_failed || text 'certificate was edited after issue';
  else raise notice 'PASS  certificate cannot be edited after issue'; end if;

  reset role;

  -- 8. the pupil and the approved parent were notified
  select count(*) into v_n from public.notifications
   where type = 'certificate_issued' and payload->>'certificate_id' = v_cert::text
     and user_id in (v_pupil, v_mum);
  if v_n <> 2 then v_failed := v_failed || format('expected 2 certificate notices, found %s', v_n);
  else raise notice 'PASS  student and parent notified'; end if;

  -- ------------------------------------------------------- as the pupil again
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil::text, 'role', 'authenticated')::text, true);

  -- 6. once graded, the pupil can no longer change it
  update public.submissions set text_body = 'after marking' where id = v_sub;
  if (select text_body from public.submissions where id = v_sub) <> 'second draft' then
    v_failed := v_failed || text 'graded submission was edited by the student';
  else raise notice 'PASS  graded submission locked for the student'; end if;

  -- 12. returned work can be revised, and goes back to pending
  reset role;
  update public.submissions set status = 'returned' where id = v_sub;
  set local role authenticated;
  update public.submissions set text_body = 'third draft', status = 'graded', score = 100 where id = v_sub;
  select text_body, status, score into r from public.submissions where id = v_sub;
  if r.text_body <> 'third draft' or r.status <> 'pending' or r.score <> 80 then
    v_failed := v_failed || format('returned revision wrong: %s / %s / %s', r.text_body, r.status, r.score);
  else raise notice 'PASS  returned work revised; status back to pending, mark untouched'; end if;

  -- ------------------------------------------------------- anonymous check
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  -- 10. a stranger with the code can verify it; a wrong code finds nothing
  select * into r from public.verify_certificate(lower(v_code));
  if r.valid is not true or r.student_name <> 'LW Pupil' then
    v_failed := v_failed || text 'valid certificate did not verify';
  else raise notice 'PASS  certificate verifies publicly (% for %)', r.title, r.student_name; end if;
  select count(*) into v_n from public.verify_certificate('ZZZZZZZZZZ');
  if v_n <> 0 then v_failed := v_failed || text 'unknown code returned a row';
  else raise notice 'PASS  unknown code returns nothing'; end if;

  -- 11b. withdrawal goes through withdraw_certificate(); a student cannot
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil::text, 'role', 'authenticated')::text, true);
  begin
    perform public.withdraw_certificate(v_cert);
    v_failed := v_failed || text 'student withdrew a certificate';
  exception when insufficient_privilege then
    raise notice 'PASS  student cannot withdraw a certificate';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  perform public.withdraw_certificate(v_cert);
  raise notice 'PASS  staff withdrew the certificate';
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select * into r from public.verify_certificate(v_code);
  if r.valid is not false then v_failed := v_failed || text 'withdrawn certificate still valid';
  else raise notice 'PASS  withdrawn certificate reported invalid'; end if;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nLearning write rules hold.';
end $$;

rollback;
