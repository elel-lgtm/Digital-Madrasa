-- Verifies migration 0036: teachers add videos to their own madrasa only,
-- pupils read but cannot add, other madrasas see nothing, and only a bare
-- YouTube id is accepted. Runs inside a transaction that rolls back.
--
--   npm run db:verify:videos

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_owner2 uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_class uuid;
  v_n int;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'cv-owner@example.test'), (v_owner2, 'cv-owner2@example.test'), (v_pupil, 'cv-pupil@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'CV Owner', 'cv-owner@example.test'),
    (v_owner2, 'teacher', null, 'CV Other', 'cv-owner2@example.test'),
    (v_pupil, 'student', null, 'CV Pupil', 'cv-pupil@example.test');
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'CV Madrasa', 'cv-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'cv-owner@example.test', '+254712000071', 'active'),
    (v_other, 'CV Other', 'cv-' || substr(v_other::text, 1, 8), 'Mombasa', 'Mombasa', v_owner2, 'cv-owner2@example.test', '+254712000072', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil);
  update public.profiles set madrasa_id = v_other where id = v_owner2;
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-CV1', true, 'active'), (v_owner2, v_other, 'EMP-CV2', true, 'active');
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_pupil, v_ma, extract(year from now())::int, date '2013-01-01', 'male');
  insert into public.classes (madrasa_id, name, level, capacity) values (v_ma, 'CV Class', 'Level 1', 20) returning id into v_class;

  set local role authenticated;

  -- 1. the teacher adds a video to their class
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  insert into public.class_videos (madrasa_id, class_id, youtube_id, title, added_by)
  values (v_ma, v_class, 'wNEMJeXmM_U', 'Ikhfa of noon sakinah', v_owner);
  raise notice 'PASS  teacher adds a video';

  -- 2. only a bare 11-character id is accepted
  begin
    insert into public.class_videos (madrasa_id, youtube_id, title, added_by)
    values (v_ma, 'https://evil.example/x', 'Bad link', v_owner);
    v_failed := v_failed || text 'a URL was stored instead of an id';
  exception when check_violation then raise notice 'PASS  only a YouTube id is accepted'; end;

  -- 3. a pupil reads but cannot add
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.class_videos;
  if v_n <> 1 then v_failed := v_failed || format('pupil sees %s videos, expected 1', v_n);
  else raise notice 'PASS  pupil sees the class video'; end if;
  begin
    insert into public.class_videos (madrasa_id, youtube_id, title, added_by) values (v_ma, 't0Z7KvotYkc', 'Pupil video', v_pupil);
    v_failed := v_failed || text 'a pupil added a video';
  exception when insufficient_privilege then raise notice 'PASS  pupil cannot add'; end;

  -- 4. another madrasa sees nothing and cannot add to this one
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner2::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.class_videos;
  if v_n <> 0 then v_failed := v_failed || text 'another madrasa saw the video';
  else raise notice 'PASS  other madrasa sees nothing'; end if;
  begin
    insert into public.class_videos (madrasa_id, youtube_id, title, added_by) values (v_ma, 't0Z7KvotYkc', 'Intruder', v_owner2);
    v_failed := v_failed || text 'another madrasa added a video';
  exception when insufficient_privilege then raise notice 'PASS  other madrasa cannot add'; end;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nVideo library rules hold.';
end $$;

rollback;
