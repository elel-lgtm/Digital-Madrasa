-- Verifies migration 0028 against the live schema: who may turn AI feedback
-- on or off for a pupil, that the database records who did it and when, and
-- that a feedback row has a score exactly when it was assessed from the
-- audio. Runs inside a transaction that rolls back.
--
--   npm run db:verify:consent

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_mb uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_ownerb uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_student uuid;
  v_parent uuid;
  v_parent2 uuid;
  v_rec uuid;
  r record;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'ac-owner@example.test'), (v_ownerb, 'ac-ownerb@example.test'),
                 (v_pupil, 'ac-pupil@example.test'), (v_mum, 'ac-mum@example.test'),
                 (v_pending, 'ac-pending@example.test')) t(id, e);

  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'AC Owner', 'ac-owner@example.test'),
    (v_ownerb, 'teacher', null, 'AC Owner B', 'ac-ownerb@example.test'),
    (v_pupil, 'student', null, 'AC Pupil', 'ac-pupil@example.test'),
    (v_mum, 'parent', null, 'AC Mum', 'ac-mum@example.test'),
    (v_pending, 'parent', null, 'AC Pending', 'ac-pending@example.test');

  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'AC Madrasa A', 'ac-a-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'ac-owner@example.test', '+254712000011', 'active'),
    (v_mb, 'AC Madrasa B', 'ac-b-' || substr(v_mb::text, 1, 8), 'Wajir', 'Wajir', v_ownerb, 'ac-ownerb@example.test', '+254712000012', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil, v_mum, v_pending);
  update public.profiles set madrasa_id = v_mb where id = v_ownerb;

  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-AC1', true, 'active'), (v_ownerb, v_mb, 'EMP-AC2', true, 'active');

  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, ai_feedback_consent)
  values (v_pupil, v_ma, extract(year from now())::int, date '2015-01-01', 'male', true)
  returning id into v_student;

  -- 1. a consent supplied at admission is not recorded as anyone's: off
  --    by default matters less than "never attributed to nobody"
  select ai_feedback_consent, ai_feedback_consent_by, ai_feedback_consent_at into r
    from public.students where id = v_student;
  if r.ai_feedback_consent_by is not null then
    v_failed := v_failed || text 'consent at insert attributed without an actor';
  end if;
  update public.students set ai_feedback_consent = false where id = v_student;

  insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_parent;
  insert into public.parents (profile_id, madrasa_id) values (v_pending, v_ma) returning id into v_parent2;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status) values
    (v_parent, v_student, v_ma, 'mother', 'approved'),
    (v_parent2, v_student, v_ma, 'guardian', 'pending');

  set local role authenticated;

  -- 2. the pupil cannot consent for themself
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_ai_feedback_consent(v_student, true);
    v_failed := v_failed || text 'pupil changed own consent';
  exception when insufficient_privilege then raise notice 'PASS  pupil cannot consent';
  end;

  -- 3. a parent whose link is still pending cannot
  perform set_config('request.jwt.claims', json_build_object('sub', v_pending::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_ai_feedback_consent(v_student, true);
    v_failed := v_failed || text 'pending parent changed consent';
  exception when insufficient_privilege then raise notice 'PASS  pending parent cannot consent';
  end;

  -- 4. staff of another madrasa cannot
  perform set_config('request.jwt.claims', json_build_object('sub', v_ownerb::text, 'role', 'authenticated')::text, true);
  begin
    perform public.set_ai_feedback_consent(v_student, true);
    v_failed := v_failed || text 'another madrasa changed consent';
  exception when insufficient_privilege or no_data_found then raise notice 'PASS  another madrasa cannot consent';
  end;

  -- 5. the approved parent can, and is recorded as the one who did
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  perform public.set_ai_feedback_consent(v_student, true);
  reset role;
  select ai_feedback_consent, ai_feedback_consent_by, ai_feedback_consent_at into r
    from public.students where id = v_student;
  if r.ai_feedback_consent is not true or r.ai_feedback_consent_by is distinct from v_mum or r.ai_feedback_consent_at is null then
    v_failed := v_failed || format('parent consent not recorded: %s / %s', r.ai_feedback_consent, r.ai_feedback_consent_by);
  else raise notice 'PASS  approved parent consented; recorded as the parent'; end if;

  -- 6. an unrelated update keeps who and when, even if the client tries to change them
  update public.students set ai_feedback_consent_by = v_owner, ai_feedback_consent_at = now() - interval '1 year',
         gender = 'male' where id = v_student;
  select ai_feedback_consent_by, ai_feedback_consent_at into r from public.students where id = v_student;
  if r.ai_feedback_consent_by is distinct from v_mum or r.ai_feedback_consent_at < now() - interval '1 day' then
    v_failed := v_failed || text 'consent attribution could be rewritten';
  else raise notice 'PASS  consent attribution cannot be rewritten'; end if;

  -- 7. staff of the pupil's madrasa can withdraw it, and are recorded
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  perform public.set_ai_feedback_consent(v_student, false);
  reset role;
  select ai_feedback_consent, ai_feedback_consent_by into r from public.students where id = v_student;
  if r.ai_feedback_consent is not false or r.ai_feedback_consent_by is distinct from v_owner then
    v_failed := v_failed || text 'staff withdrawal not recorded';
  else raise notice 'PASS  madrasa staff withdrew consent; recorded as staff'; end if;

  -- 8. the change is in the audit log
  if not exists (select 1 from public.audit_log where entity_id = v_student and action = 'students.update'
                   and (after ->> 'ai_feedback_consent') = 'false' and (before ->> 'ai_feedback_consent') = 'true') then
    v_failed := v_failed || text 'consent change not audited';
  else raise notice 'PASS  consent change audited'; end if;

  -- 9. a score exists exactly when the audio was assessed
  insert into public.recitations (student_id, madrasa_id, audio_url, duration_ms, surah_no, ayah_from, ayah_to, qiraah_style)
  values (v_student, v_ma, 'madrasa/' || v_ma || '/recitations/x', 1000, 112, 1, 4, 'hafs') returning id into v_rec;
  begin
    insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, assessment, model_version, processing_ms)
    values (v_rec, v_ma, 80, 'not_consented', 'none', 0);
    v_failed := v_failed || text 'score stored for an unassessed recitation';
  exception when check_violation then raise notice 'PASS  no score without an assessment'; end;
  begin
    insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, assessment, model_version, processing_ms)
    values (v_rec, v_ma, null, 'assessed', 'm', 0);
    v_failed := v_failed || text 'assessed recitation stored without a score';
  exception when check_violation then raise notice 'PASS  no assessment without a score'; end;
  insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, assessment, model_version, processing_ms)
  values (v_rec, v_ma, null, 'not_consented', 'none', 0);
  raise notice 'PASS  unassessed recitation stored with no score';

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nAI feedback consent rules hold.';
end $$;

rollback;
