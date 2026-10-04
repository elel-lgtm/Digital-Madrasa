-- Verifies migration 0033: a phone number reaches only the approved children
-- of the one parent registered with it, in any of its spellings; a pending
-- link, an unknown number and a shared number reach nothing; and no signed-in
-- user can call it. Runs inside a transaction that rolls back.
--
--   npm run db:verify:ussd

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_twin1 uuid := gen_random_uuid();
  v_twin2 uuid := gen_random_uuid();
  v_p1 uuid := gen_random_uuid();
  v_p2 uuid := gen_random_uuid();
  v_s1 uuid; v_s2 uuid; v_parent_row uuid;
  v_n int;
  v_name text;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'us-owner@example.test'), (v_parent, 'us-parent@example.test'),
                 (v_twin1, 'us-twin1@example.test'), (v_twin2, 'us-twin2@example.test'),
                 (v_p1, 'us-p1@example.test'), (v_p2, 'us-p2@example.test')) t(id, e);
  insert into public.profiles (id, role, madrasa_id, full_name, email, phone) values
    (v_owner, 'teacher', null, 'US Owner', 'us-owner@example.test', null),
    (v_parent, 'parent', null, 'US Parent', 'us-parent@example.test', '+254799000001'),
    (v_twin1, 'parent', null, 'US Twin One', 'us-twin1@example.test', '+254799000002'),
    (v_twin2, 'parent', null, 'US Twin Two', 'us-twin2@example.test', '254799000002'),
    (v_p1, 'student', null, 'Linked Pupil', 'us-p1@example.test', null),
    (v_p2, 'student', null, 'Pending Pupil', 'us-p2@example.test', null);
  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status)
  values (v_ma, 'US Madrasa', 'us-' || substr(v_ma::text, 1, 8), 'Garissa', 'Garissa', v_owner, 'us-owner@example.test', '+254712000051', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_p1, v_p2);
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status) values (v_owner, v_ma, 'EMP-US1', true, 'active');
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_p1, v_ma, extract(year from now())::int, date '2012-01-01', 'male') returning id into v_s1;
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_p2, v_ma, extract(year from now())::int, date '2012-01-01', 'female') returning id into v_s2;

  select id into v_parent_row from public.parents where profile_id = v_parent;
  if v_parent_row is null then
    insert into public.parents (profile_id, madrasa_id) values (v_parent, v_ma) returning id into v_parent_row;
  end if;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status) values
    (v_parent_row, v_s1, v_ma, 'father', 'approved'),
    (v_parent_row, v_s2, v_ma, 'father', 'pending');

  -- 1. signed-in users cannot call it
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_parent::text, 'role', 'authenticated')::text, true);
  begin
    perform * from public.ussd_children('+254799000001');
    v_failed := v_failed || text 'a signed-in user called ussd_children';
  exception when insufficient_privilege then raise notice 'PASS  closed to signed-in users'; end;
  reset role;

  -- 2. the approved child only, whichever way the number is written
  set local role service_role;
  select count(*), min(first_name) into v_n, v_name from public.ussd_children('+254799000001');
  if v_n <> 1 or v_name <> 'Linked' then v_failed := v_failed || format('expected Linked only, got %s (%s)', v_n, v_name);
  else raise notice 'PASS  approved child only, pending link hidden'; end if;
  select count(*) into v_n from public.ussd_children('0799000001');
  if v_n <> 1 then v_failed := v_failed || text 'local spelling not matched';
  else raise notice 'PASS  0799… matches +254799…'; end if;

  -- 3. unknown and shared numbers reach nothing
  select count(*) into v_n from public.ussd_children('+254799999999');
  if v_n <> 0 then v_failed := v_failed || text 'unknown number reached a child'; end if;
  select count(*) into v_n from public.ussd_children('+254799000002');
  if v_n <> 0 then v_failed := v_failed || text 'shared number reached a child';
  else raise notice 'PASS  unknown and shared numbers reach nothing'; end if;
  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nUSSD rules hold.';
end $$;

rollback;
