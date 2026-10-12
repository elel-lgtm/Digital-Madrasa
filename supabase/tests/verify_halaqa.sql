-- Verifies migration 0037: only the madrasa's teachers mark readings; a
-- pupil reads their own marks and not another pupil's; the live room admits
-- only the lesson's own madrasa. Runs inside a transaction that rolls back.
--
--   npm run db:verify:halaqa

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_owner2 uuid := gen_random_uuid();
  v_p1 uuid := gen_random_uuid();
  v_p2 uuid := gen_random_uuid();
  v_s1 uuid; v_s2 uuid;
  v_class uuid;
  v_lesson uuid;
  v_n int;
  v_ok boolean;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'hq-owner@example.test'), (v_owner2, 'hq-owner2@example.test'),
                 (v_p1, 'hq-p1@example.test'), (v_p2, 'hq-p2@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'HQ Owner', 'hq-owner@example.test'),
    (v_owner2, 'teacher', null, 'HQ Other', 'hq-owner2@example.test'),
    (v_p1, 'student', null, 'HQ One', 'hq-p1@example.test'),
    (v_p2, 'student', null, 'HQ Two', 'hq-p2@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'HQ Madrasa', 'hq-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'hq-owner@example.test', '+254712000081', 'active'),
    (v_other, 'HQ Other', 'hq-' || substr(v_other::text, 1, 8), 'Mombasa', 'Mombasa', v_owner2, 'hq-owner2@example.test', '+254712000082', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_p1, v_p2);
  update public.profiles set madrasa_id = v_other where id = v_owner2;
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-HQ1', true, 'active'), (v_owner2, v_other, 'EMP-HQ2', true, 'active');
  insert into public.classes (madrasa_id, name, level, capacity) values (v_ma, 'HQ Class', 'Level 1', 20) returning id into v_class;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_p1, v_ma, extract(year from now())::int, date '2013-01-01', 'male', v_class) returning id into v_s1;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_p2, v_ma, extract(year from now())::int, date '2013-01-01', 'female', v_class) returning id into v_s2;
  insert into public.lessons (madrasa_id, class_id, title, surah_from, ayah_from, surah_to, ayah_to)
  values (v_ma, v_class, 'HQ Halaqa', 112, 1, 112, 4) returning id into v_lesson;

  set local role authenticated;

  -- 1. the teacher marks pupil one's reading
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  insert into public.halaqa_readings (madrasa_id, lesson_id, student_id, surah_no, ayah_from, ayah_to, mark, marked_by)
  values (v_ma, v_lesson, v_s1, 112, 1, 4, 'excellent', v_owner);
  raise notice 'PASS  teacher marks a reading';
  if not public.can_join_halaqa('halaqa:' || v_lesson) then v_failed := v_failed || text 'teacher refused from own room'; end if;

  -- 2. a pupil cannot mark, sees their own mark only, and may join the room
  perform set_config('request.jwt.claims', json_build_object('sub', v_p2::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.halaqa_readings (madrasa_id, lesson_id, student_id, surah_no, ayah_from, ayah_to, mark, marked_by)
    values (v_ma, v_lesson, v_s2, 112, 1, 4, 'excellent', v_p2);
    v_failed := v_failed || text 'a pupil marked their own reading';
  exception when insufficient_privilege then raise notice 'PASS  pupil cannot mark'; end;
  select count(*) into v_n from public.halaqa_readings;
  if v_n <> 0 then v_failed := v_failed || text 'pupil two saw pupil one''s mark';
  else raise notice 'PASS  pupils see only their own marks'; end if;
  if not public.can_join_halaqa('halaqa:' || v_lesson) then v_failed := v_failed || text 'pupil refused from own class room';
  else raise notice 'PASS  pupil may join the room'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_p1::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.halaqa_readings;
  if v_n <> 1 then v_failed := v_failed || text 'pupil one cannot see their mark';
  else raise notice 'PASS  pupil sees their mark'; end if;

  -- 3. another madrasa's teacher is kept out of the room and the marks
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner2::text, 'role', 'authenticated')::text, true);
  v_ok := public.can_join_halaqa('halaqa:' || v_lesson);
  if v_ok then v_failed := v_failed || text 'another madrasa joined the room';
  else raise notice 'PASS  other madrasa kept out of the room'; end if;
  if public.can_join_halaqa('halaqa:not-a-uuid') or public.can_join_halaqa('lobby') then
    v_failed := v_failed || text 'a malformed topic was accepted';
  end if;
  select count(*) into v_n from public.halaqa_readings;
  if v_n <> 0 then v_failed := v_failed || text 'another madrasa saw marks'; end if;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nHalaqa rules hold.';
end $$;

rollback;
