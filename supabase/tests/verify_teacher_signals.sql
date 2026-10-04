-- Verifies migration 0032: a teacher gets one row per active pupil of their
-- own madrasa with the right numbers, and a pupil is refused. Runs inside a
-- transaction that rolls back.
--
--   npm run db:verify:signals

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_owner2 uuid := gen_random_uuid();
  v_p1 uuid := gen_random_uuid();
  v_p3 uuid := gen_random_uuid();
  v_class uuid;
  v_s1 uuid; v_s3 uuid;
  v_rec uuid;
  r record;
  v_n int;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'ts-owner@example.test'), (v_owner2, 'ts-owner2@example.test'),
                 (v_p1, 'ts-p1@example.test'), (v_p3, 'ts-p3@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'TS Owner', 'ts-owner@example.test'),
    (v_owner2, 'teacher', null, 'TS Other Owner', 'ts-owner2@example.test'),
    (v_p1, 'student', null, 'TS Pupil', 'ts-p1@example.test'),
    (v_p3, 'student', null, 'TS Elsewhere', 'ts-p3@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'TS Madrasa', 'ts-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'ts-owner@example.test', '+254712000041', 'active'),
    (v_other, 'TS Other', 'ts-' || substr(v_other::text, 1, 8), 'Mombasa', 'Mombasa', v_owner2, 'ts-owner2@example.test', '+254712000042', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_p1);
  update public.profiles set madrasa_id = v_other where id in (v_owner2, v_p3);
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-TS1', true, 'active'), (v_owner2, v_other, 'EMP-TS2', true, 'active');
  insert into public.classes (madrasa_id, name, level, capacity) values (v_ma, 'TS Class', 'beginner', 20) returning id into v_class;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_p1, v_ma, extract(year from now())::int, date '2012-01-01', 'male', v_class) returning id into v_s1;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_p3, v_other, extract(year from now())::int, date '2012-01-01', 'male') returning id into v_s3;

  -- attendance: 4 of 4 the fortnight before, 1 of 4 this fortnight
  insert into public.attendance (madrasa_id, class_id, student_id, session_date, status)
  select v_ma, v_class, v_s1, current_date - d, case when d < 14 and d > 1 then 'absent'::public.attendance_status else 'present' end
    from unnest(array[1, 3, 5, 7, 15, 17, 19, 21]) d;

  -- learning Al-Mulk, last moved 25 days ago; one memorised surah overdue
  insert into public.hifz_progress (student_id, madrasa_id, surah_no, ayah_no, juz_no, status, updated_at, next_review_at)
  values (v_s1, v_ma, 67, 12, 29, 'learning', now() - interval '25 days', null),
         (v_s1, v_ma, 112, 4, 30, 'memorised', now() - interval '30 days', now() - interval '10 days');

  -- a recitation scored 80 by AI, overridden to 90 by the teacher
  insert into public.recitations (student_id, madrasa_id, audio_url, duration_ms, surah_no, ayah_from, ayah_to, qiraah_style, created_at)
  values (v_s1, v_ma, 'madrasa/' || v_ma || '/recitations/s', 1000, 112, 1, 4, 'hafs', now() - interval '2 days') returning id into v_rec;
  insert into public.tajweed_feedback (recitation_id, madrasa_id, overall_score, assessment, model_version, processing_ms, teacher_override)
  values (v_rec, v_ma, 80, 'assessed', 'm', 1, '{"overallScore":90,"remarks":""}');

  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', v_p1::text, 'role', 'authenticated')::text, true);
  begin
    perform * from public.teacher_signals();
    v_failed := v_failed || text 'pupil saw class insights';
  exception when insufficient_privilege then raise notice 'PASS  pupil refused'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.teacher_signals();
  if v_n <> 1 then v_failed := v_failed || format('expected 1 pupil, got %s', v_n);
  else raise notice 'PASS  own madrasa only'; end if;

  select * into r from public.teacher_signals();
  if r.full_name <> 'TS Pupil' or r.class_name <> 'TS Class' then v_failed := v_failed || text 'name or class wrong'; end if;
  if (r.present_recent, r.sessions_recent, r.present_prev, r.sessions_prev) <> (1, 4, 4, 4) then
    v_failed := v_failed || format('attendance %s/%s vs %s/%s', r.present_recent, r.sessions_recent, r.present_prev, r.sessions_prev);
  else raise notice 'PASS  attendance fortnights'; end if;
  if r.learning_surah <> 67 or r.learning_ayah <> 12 or r.learning_moved_at > now() - interval '24 days' then
    v_failed := v_failed || text 'learning surah wrong';
  else raise notice 'PASS  surah being learned'; end if;
  if r.overdue_reviews <> 1 then v_failed := v_failed || format('overdue %s', r.overdue_reviews);
  else raise notice 'PASS  overdue revision'; end if;
  if r.score_recent <> 90 then v_failed := v_failed || format('score %s, expected the teacher''s 90', r.score_recent);
  else raise notice 'PASS  teacher''s score preferred'; end if;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nTeacher signals hold.';
end $$;

rollback;
