-- Proves the recitation Storage read policy asks the same question the
-- recitation row does, against the live schema, in a transaction that rolls
-- back.
--
--   npm run db:verify:storage
--
-- The policy is evaluated directly rather than through the Storage API, so the
-- check is of the rule itself: for each role, does `can_read_student` say yes
-- for the student behind this object? That is the property the API then
-- enforces when it decides whether to mint a signed URL.

begin;

do $$
declare
  v_madrasa   uuid := gen_random_uuid();
  v_other_m   uuid := gen_random_uuid();
  v_owner     uuid := gen_random_uuid();
  v_other_own uuid := gen_random_uuid();
  v_pupil_u   uuid := gen_random_uuid();
  v_peer_u    uuid := gen_random_uuid();
  v_parent_u  uuid := gen_random_uuid();
  v_stranger  uuid := gen_random_uuid();
  v_pupil     uuid;
  v_peer      uuid;
  v_parent    uuid;
  v_stranger_p uuid;
  v_path      text;
  v_failed    text[] := '{}';
  v_allowed   boolean;
begin
  -- ---------------------------------------------------------------- fixtures
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'scope-' || substr(u::text, 1, 8) || '@example.test', '', now(), now(), now()
  from unnest(array[v_owner, v_other_own, v_pupil_u, v_peer_u, v_parent_u, v_stranger]) u;

  insert into public.profiles (id, role, madrasa_id, full_name, email)
  values (v_owner,     'teacher', null, 'Scope Owner',   'scope-owner@example.test'),
         (v_other_own, 'teacher', null, 'Other Owner',   'scope-other@example.test'),
         (v_pupil_u,   'student', null, 'Scope Pupil',   'scope-pupil@example.test'),
         (v_peer_u,    'student', null, 'Scope Peer',    'scope-peer@example.test'),
         (v_parent_u,  'parent',  null, 'Scope Parent',  'scope-parent@example.test'),
         (v_stranger,  'parent',  null, 'Scope Stranger','scope-stranger@example.test');

  insert into public.madrasas (id, name, slug, county, town, owner_id,
                               contact_email, contact_phone, status)
  values (v_madrasa, 'Scope Madrasa', 'scope-' || substr(v_madrasa::text, 1, 8),
          'Mandera', 'Mandera', v_owner, 'a@example.test', '+254700000101', 'active'),
         (v_other_m, 'Other Madrasa', 'other-' || substr(v_other_m::text, 1, 8),
          'Wajir', 'Wajir', v_other_own, 'b@example.test', '+254700000102', 'active');

  update public.profiles set madrasa_id = v_madrasa
   where id in (v_owner, v_pupil_u, v_peer_u, v_parent_u, v_stranger);
  update public.profiles set madrasa_id = v_other_m where id = v_other_own;

  insert into public.students (madrasa_id, profile_id, date_of_birth, gender)
  values (v_madrasa, v_pupil_u, date '2015-01-01', 'male') returning id into v_pupil;
  insert into public.students (madrasa_id, profile_id, date_of_birth, gender)
  values (v_madrasa, v_peer_u, date '2015-01-01', 'male') returning id into v_peer;

  insert into public.parents (profile_id, madrasa_id) values (v_parent_u, v_madrasa)
  returning id into v_parent;
  insert into public.parents (profile_id, madrasa_id) values (v_stranger, v_madrasa)
  returning id into v_stranger_p;

  -- The parent is linked to the pupil and approved; the stranger is not linked.
  insert into public.parent_student_links (parent_id, student_id, madrasa_id,
                                           relationship, status, requested_at, decided_at)
  values (v_parent, v_pupil, v_madrasa, 'mother', 'approved', now(), now());

  v_path := 'madrasa/' || v_madrasa::text || '/recitations/' || gen_random_uuid()::text;

  insert into public.recitations (student_id, madrasa_id, audio_url, duration_ms,
                                  surah_no, ayah_from, ayah_to, qiraah_style)
  values (v_pupil, v_madrasa, v_path, 1000, 67, 1, 3, 'hafs');

  -- ------------------------------------------------------- the rule itself
  -- `can_read_student` reads the caller's role and identity from the JWT, so
  -- each case sets the claims the policy would see and asks the same question
  -- the policy asks.

  -- 1. the student themselves
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pupil_u::text, 'role', 'authenticated')::text, true);
  select public.can_read_student(v_pupil) into v_allowed;
  if not v_allowed then
    v_failed := v_failed || 'a student cannot read their own recitation';
  end if;

  -- 2. a different student in the same madrasa
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_peer_u::text, 'role', 'authenticated')::text, true);
  select public.can_read_student(v_pupil) into v_allowed;
  if v_allowed then
    v_failed := v_failed || 'another pupil in the madrasa can read the recitation';
  end if;

  -- 3. the approved parent
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parent_u::text, 'role', 'authenticated')::text, true);
  select public.can_read_student(v_pupil) into v_allowed;
  if not v_allowed then
    v_failed := v_failed || 'an approved parent cannot read their child''s recitation';
  end if;

  -- 4. a parent in the same madrasa with no approved link — the Phase 4D gap
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  select public.can_read_student(v_pupil) into v_allowed;
  if v_allowed then
    v_failed := v_failed || 'an unlinked parent in the same madrasa can read the recitation';
  end if;

  -- 5. staff of the same madrasa
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  select public.can_read_student(v_pupil) into v_allowed;
  if not v_allowed then
    v_failed := v_failed || 'a teacher in the madrasa cannot read the recitation';
  end if;

  -- 6. staff of another madrasa
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_other_own::text, 'role', 'authenticated')::text, true);
  select public.can_read_student(v_pupil) into v_allowed;
  if v_allowed then
    v_failed := v_failed || 'a teacher from another madrasa can read the recitation';
  end if;

  -- ------------------------------------------- the policy joins on the path
  -- The rule above only reaches Storage if the policy can find the recitation
  -- from the object name, so the join the policy performs is checked too.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  if not exists (
    select 1 from public.recitations r
     where r.audio_url = v_path and r.deleted_at is null
       and public.can_read_student(r.student_id)
  ) then
    v_failed := v_failed || 'the policy join from an object path to its recitation fails';
  end if;

  if exists (
    select 1 from public.recitations r
     where r.audio_url = v_path || '-not-a-real-object'
       and public.can_read_student(r.student_id)
  ) then
    v_failed := v_failed || 'an unknown object path resolves to a recitation';
  end if;

  -- A soft-deleted recitation must stop authorising its audio.
  update public.recitations set deleted_at = now() where audio_url = v_path;
  if exists (
    select 1 from public.recitations r
     where r.audio_url = v_path and r.deleted_at is null
       and public.can_read_student(r.student_id)
  ) then
    v_failed := v_failed || 'a deleted recitation still authorises its audio';
  end if;

  perform set_config('request.jwt.claims', null, true);

  if array_length(v_failed, 1) is null then
    raise notice 'Recitation storage scope behaves correctly.';
  else
    raise exception E'\n%', array_to_string(v_failed, E'\n');
  end if;
end $$;

rollback;
