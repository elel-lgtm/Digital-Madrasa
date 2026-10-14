-- Verifies migration 0040: staff see their own madrasa's impact, the platform
-- admin sees every madrasa, parents and pupils are refused, and no names are
-- returned. Runs inside a transaction that rolls back.
--
--   npm run db:verify:impact

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_owner2 uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_student uuid;
  j jsonb;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'im-owner@example.test'), (v_owner2, 'im-owner2@example.test'), (v_admin, 'im-admin@example.test'),
                 (v_pupil, 'im-pupil@example.test'), (v_mum, 'im-mum@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email, is_platform_admin) values
    (v_owner, 'teacher', null, 'IM Owner', 'im-owner@example.test', false),
    (v_owner2, 'teacher', null, 'IM Other', 'im-owner2@example.test', false),
    (v_admin, 'admin', null, 'IM Admin', 'im-admin@example.test', true),
    (v_pupil, 'student', null, 'Secret Pupil Name', 'im-pupil@example.test', false),
    (v_mum, 'parent', null, 'IM Mum', 'im-mum@example.test', false);
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_ma, 'IM Madrasa', 'im-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'im-owner@example.test', '+254712000111', 'active'),
    (v_other, 'IM Other', 'im-' || substr(v_other::text, 1, 8), 'Mombasa', 'Mombasa', v_owner2, 'im-owner2@example.test', '+254712000112', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil);
  update public.profiles set madrasa_id = v_other where id = v_owner2;
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner, v_ma, 'EMP-IM1', true, 'active'), (v_owner2, v_other, 'EMP-IM2', true, 'active');
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_pupil, v_ma, extract(year from now())::int, date '2013-01-01', 'male') returning id into v_student;
  insert into public.hifz_progress (student_id, madrasa_id, surah_no, ayah_no, juz_no, status)
  values (v_student, v_ma, 112, 4, 30, 'memorised'), (v_student, v_ma, 113, 5, 30, 'mastered');

  set local role authenticated;

  -- 1. the owner sees their own madrasa only
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  j := public.impact_summary();
  if (j ->> 'madrasas')::int <> 1 or (j ->> 'pupils')::int <> 1 or (j ->> 'surahsMemorised')::int <> 2 then
    v_failed := v_failed || format('owner numbers wrong: %s', j);
  else raise notice 'PASS  owner sees their madrasa''s impact'; end if;
  if j::text ilike '%Secret Pupil Name%' then v_failed := v_failed || text 'a pupil''s name leaked'; end if;
  if jsonb_array_length(j -> 'monthly') <> 6 then v_failed := v_failed || text 'trend is not six months'; end if;

  -- 2. the other owner sees none of it
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner2::text, 'role', 'authenticated')::text, true);
  j := public.impact_summary();
  if (j ->> 'pupils')::int <> 0 then v_failed := v_failed || text 'another madrasa saw these pupils';
  else raise notice 'PASS  other madrasa sees only its own'; end if;

  -- 3. the platform admin sees both madrasas
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  j := public.impact_summary();
  if j ->> 'scope' <> 'platform' or (j ->> 'madrasas')::int < 2 then v_failed := v_failed || format('admin scope wrong: %s', j ->> 'madrasas');
  else raise notice 'PASS  platform admin sees every madrasa'; end if;

  -- 4. pupils and parents are refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil::text, 'role', 'authenticated')::text, true);
  begin
    j := public.impact_summary();
    v_failed := v_failed || text 'a pupil saw impact';
  exception when insufficient_privilege then raise notice 'PASS  pupil refused'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum::text, 'role', 'authenticated')::text, true);
  begin
    j := public.impact_summary();
    v_failed := v_failed || text 'a parent saw impact';
  exception when insufficient_privilege then raise notice 'PASS  parent refused'; end;

  reset role;
  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nImpact rules hold.';
end $$;

rollback;
