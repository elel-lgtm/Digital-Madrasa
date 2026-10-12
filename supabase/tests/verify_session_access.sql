-- Verifies migration 0038: a live session (and its meeting link) is visible
-- to its own class, their parents and staff only; the reading room admits the
-- same people; scheduling notifies the class and its parents. Runs inside a
-- transaction that rolls back.
--
--   npm run db:verify:sessions

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_in uuid := gen_random_uuid();
  v_out uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_class_a uuid; v_class_b uuid;
  v_s_in uuid; v_s_out uuid; v_mum_row uuid;
  v_lesson uuid;
  v_n int;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'sa-owner@example.test'), (v_in, 'sa-in@example.test'), (v_out, 'sa-out@example.test'), (v_mum, 'sa-mum@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'SA Owner', 'sa-owner@example.test'),
    (v_in, 'student', null, 'In Class', 'sa-in@example.test'),
    (v_out, 'student', null, 'Other Class', 'sa-out@example.test'),
    (v_mum, 'parent', null, 'SA Mum', 'sa-mum@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status)
  values (v_ma, 'SA Madrasa', 'sa-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'sa-owner@example.test', '+254712000091', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_in, v_out);
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values (v_owner, v_ma, 'EMP-SA1', true, 'active');
  insert into public.classes (madrasa_id, name, level, capacity) values (v_ma, 'Class A', 'Level 1', 20) returning id into v_class_a;
  insert into public.classes (madrasa_id, name, level, capacity) values (v_ma, 'Class B', 'Level 1', 20) returning id into v_class_b;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_in, v_ma, extract(year from now())::int, date '2013-01-01', 'male', v_class_a) returning id into v_s_in;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_out, v_ma, extract(year from now())::int, date '2013-01-01', 'female', v_class_b) returning id into v_s_out;
  select id into v_mum_row from public.parents where profile_id = v_mum;
  if v_mum_row is null then insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_mum_row; end if;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status)
  values (v_mum_row, v_s_in, v_ma, 'mother', 'approved');

  -- the teacher schedules a session for class A
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  insert into public.lessons (madrasa_id, class_id, title, surah_from, ayah_from, surah_to, ayah_to, scheduled_for, meeting_url)
  values (v_ma, v_class_a, 'Evening halaqa', 112, 1, 112, 4, now() + interval '1 day', 'https://meet.google.com/abc-defg-hij')
  returning id into v_lesson;
  select count(*) into v_n from public.lessons where id = v_lesson;
  if v_n <> 1 then v_failed := v_failed || text 'teacher cannot see own session'; end if;

  -- 1. a pupil of class A sees it, and may enter its room
  perform set_config('request.jwt.claims', json_build_object('sub', v_in::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.lessons where id = v_lesson;
  if v_n <> 1 or not public.can_join_halaqa('halaqa:' || v_lesson) then v_failed := v_failed || text 'class pupil shut out';
  else raise notice 'PASS  class pupil sees the session and may join the room'; end if;

  -- 2. a pupil of class B in the same madrasa sees neither the link nor the room
  perform set_config('request.jwt.claims', json_build_object('sub', v_out::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.lessons where id = v_lesson;
  if v_n <> 0 then v_failed := v_failed || text 'another class saw the meeting link'; end if;
  if public.can_join_halaqa('halaqa:' || v_lesson) then v_failed := v_failed || text 'another class joined the room'; end if;
  if v_n = 0 and not public.can_join_halaqa('halaqa:' || v_lesson) then raise notice 'PASS  another class sees nothing'; end if;

  -- 3. the class pupil's parent sees it
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.lessons where id = v_lesson;
  if v_n <> 1 then v_failed := v_failed || text 'parent of a class pupil shut out';
  else raise notice 'PASS  parent sees their child''s session'; end if;
  reset role;

  -- 4. scheduling told the class pupil and the parent, not the other class
  select count(*) into v_n from public.notifications where type = 'live_session' and payload ->> 'lesson_id' = v_lesson::text;
  if v_n <> 2 then v_failed := v_failed || format('expected 2 notices, got %s', v_n); end if;
  select count(*) into v_n from public.notifications where type = 'live_session' and user_id = v_out;
  if v_n <> 0 then v_failed := v_failed || text 'other class notified'; end if;
  if not exists (select 1 from unnest(v_failed) f where f like '%notice%' or f like '%notified%') then
    raise notice 'PASS  class and parents notified, nobody else';
  end if;

  -- 5. a link outside the allowlist is refused
  begin
    update public.lessons set meeting_url = 'https://evil.example/join' where id = v_lesson;
    v_failed := v_failed || text 'a non-meeting link was stored';
  exception when check_violation then raise notice 'PASS  only Meet/Zoom/Teams/Jitsi links accepted'; end;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nLive session access holds.';
end $$;

rollback;
