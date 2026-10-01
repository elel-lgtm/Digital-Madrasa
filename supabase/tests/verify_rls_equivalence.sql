-- Proves migration 0027 changed how the child-scoped read rule is evaluated,
-- not what it allows.
--
-- For every kind of caller, the set readable_student_ids() returns must equal
-- the set of students can_read_student() allows, and the rows each rewritten
-- policy shows must equal the rows the old per-row rule would have shown.
-- Callers cover every branch of can_read_student(), including the ones that
-- are easy to get subtly wrong: a teacher whose madrasa is suspended (sees
-- nothing), a parent whose child studies at a suspended madrasa (still sees
-- that child — the parent branch never checked madrasa status), a pending
-- link (sees nothing), a soft-deleted pupil, an 'admin'-role profile that is
-- not a platform admin, and a caller with no session at all.
-- Rolls back.
--
--   npm run db:verify:rls

begin;

do $$
declare
  v_a uuid := gen_random_uuid();  -- active madrasa
  v_b uuid := gen_random_uuid();  -- suspended madrasa
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_pupil1 uuid := gen_random_uuid();
  v_pupil2 uuid := gen_random_uuid();
  v_pupil3 uuid := gen_random_uuid();   -- madrasa B
  v_gone uuid := gen_random_uuid();     -- soft-deleted pupil in A
  v_admin uuid := gen_random_uuid();
  v_fake_admin uuid := gen_random_uuid();
  v_class_a uuid := gen_random_uuid();
  v_class_b uuid := gen_random_uuid();
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_sg uuid; v_parent uuid;
  u record;
  v_expected uuid[];
  v_actual uuid[];
  v_n_old int;
  v_n_new int;
  t text;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner_a, 'eq-owner-a@example.test'), (v_owner_b, 'eq-owner-b@example.test'),
                 (v_mum, 'eq-mum@example.test'), (v_pupil1, 'eq-p1@example.test'), (v_pupil2, 'eq-p2@example.test'),
                 (v_pupil3, 'eq-p3@example.test'), (v_gone, 'eq-gone@example.test'),
                 (v_admin, 'eq-admin@example.test'), (v_fake_admin, 'eq-fake@example.test')) t(id, e);

  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner_a, 'teacher', null, 'EQ Owner A', 'eq-owner-a@example.test'),
    (v_owner_b, 'teacher', null, 'EQ Owner B', 'eq-owner-b@example.test'),
    (v_mum, 'parent', null, 'EQ Mum', 'eq-mum@example.test'),
    (v_pupil1, 'student', null, 'EQ Pupil 1', 'eq-p1@example.test'),
    (v_pupil2, 'student', null, 'EQ Pupil 2', 'eq-p2@example.test'),
    (v_pupil3, 'student', null, 'EQ Pupil 3', 'eq-p3@example.test'),
    (v_gone, 'student', null, 'EQ Gone', 'eq-gone@example.test'),
    (v_admin, 'admin', null, 'EQ Admin', 'eq-admin@example.test'),
    (v_fake_admin, 'admin', null, 'EQ Not Platform Admin', 'eq-fake@example.test');
  update public.profiles set is_platform_admin = true where id = v_admin;

  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status) values
    (v_a, 'EQ A', 'eq-a-' || substr(v_a::text, 1, 8), 'Garissa', 'Garissa', v_owner_a, 'eq-owner-a@example.test', '+254712000001', 'active'),
    (v_b, 'EQ B', 'eq-b-' || substr(v_b::text, 1, 8), 'Wajir', 'Wajir', v_owner_b, 'eq-owner-b@example.test', '+254712000002', 'active');
  update public.profiles set madrasa_id = v_a where id in (v_owner_a, v_mum, v_pupil1, v_pupil2, v_gone);
  update public.profiles set madrasa_id = v_b where id in (v_owner_b, v_pupil3);

  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values
    (v_owner_a, v_a, 'EMP-EQA', true, 'active'), (v_owner_b, v_b, 'EMP-EQB', true, 'active');
  insert into public.classes (id, madrasa_id, name, level, capacity) values
    (v_class_a, v_a, 'EQ A1', 'Level 1', 30), (v_class_b, v_b, 'EQ B1', 'Level 1', 30);

  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_pupil1, v_a, 2026, date '2014-01-01', 'female', v_class_a) returning id into v_s1;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_pupil2, v_a, 2026, date '2014-01-01', 'male', v_class_a) returning id into v_s2;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_pupil3, v_b, 2026, date '2014-01-01', 'female', v_class_b) returning id into v_s3;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_gone, v_a, 2026, date '2014-01-01', 'male', v_class_a) returning id into v_sg;
  update public.students set deleted_at = now() where id = v_sg;

  insert into public.parents (profile_id, madrasa_id) values (v_mum, v_a) returning id into v_parent;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status) values
    (v_parent, v_s1, v_a, 'mother', 'approved'),
    (v_parent, v_s2, v_a, 'mother', 'pending'),   -- pending: must not be readable
    (v_parent, v_s3, v_b, 'mother', 'approved');  -- child at the madrasa about to be suspended

  insert into public.attendance (madrasa_id, class_id, student_id, session_date, status)
  select s.madrasa_id, s.class_id, s.id, current_date - d, 'present'
    from public.students s cross join generate_series(0, 2) d
   where s.id in (v_s1, v_s2, v_s3, v_sg);
  insert into public.hifz_progress (student_id, madrasa_id, surah_no, ayah_no, juz_no, status)
  select s.id, s.madrasa_id, 114, 1, 30, 'memorised' from public.students s where s.id in (v_s1, v_s2, v_s3, v_sg);

  update public.madrasas set status = 'suspended' where id = v_b;

  -- ------------------------------------------------------------ callers
  for u in
    select * from (values
      ('owner of active madrasa', v_owner_a), ('owner of suspended madrasa', v_owner_b),
      ('parent', v_mum), ('student', v_pupil1), ('platform admin', v_admin),
      ('admin role, not platform admin', v_fake_admin), ('no session', null::uuid)
    ) t(label, uid)
  loop
    perform set_config('request.jwt.claims',
      case when u.uid is null then json_build_object('role', 'anon')::text
           else json_build_object('sub', u.uid, 'role', 'authenticated')::text end, true);

    -- 1. the two functions agree on every student on the platform
    select coalesce(array_agg(s.id order by s.id), '{}') into v_expected
      from public.students s where public.can_read_student(s.id);
    select coalesce(array_agg(x order by x), '{}') into v_actual from public.readable_student_ids() x;
    if v_expected is distinct from v_actual then
      v_failed := v_failed || format('%s: can_read_student allows %s students, readable_student_ids returns %s',
                                     u.label, cardinality(v_expected), cardinality(v_actual));
    end if;

    -- 2. the rewritten policies show exactly the rows the old rule allowed
    if u.uid is not null then
      foreach t in array array['attendance', 'hifz_progress', 'students'] loop
        execute format('select count(*) from public.%I where deleted_at is null and public.can_read_student(%s)',
                       t, case when t = 'students' then 'id' else 'student_id' end) into v_n_old;
        set local role authenticated;
        execute format('select count(*) from public.%I', t) into v_n_new;
        reset role;
        if v_n_old <> v_n_new then
          v_failed := v_failed || format('%s: %s shows %s rows, old rule allowed %s', u.label, t, v_n_new, v_n_old);
        end if;
      end loop;
    end if;

    raise notice 'PASS  %: % student(s) readable, identical under both', u.label, cardinality(v_actual);
  end loop;

  -- 3. the branches themselves, spelled out
  perform set_config('request.jwt.claims', json_build_object('sub', v_mum, 'role', 'authenticated')::text, true);
  if not (v_s1 in (select public.readable_student_ids()) and v_s3 in (select public.readable_student_ids())
          and v_s2 not in (select public.readable_student_ids())) then
    v_failed := v_failed || text 'parent branch: approved children (any madrasa) yes, pending link no';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.readable_student_ids()) then
    v_failed := v_failed || text 'teacher of a suspended madrasa can read students';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fake_admin, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.readable_student_ids()) then
    v_failed := v_failed || text 'an admin-role profile without is_platform_admin can read students';
  end if;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nThe set-based policies allow exactly what can_read_student() allows.';
end $$;

rollback;
