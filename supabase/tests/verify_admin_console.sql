-- Verifies migration 0026: the admin console's read functions refuse anyone
-- who is not a platform admin (owners included), give an admin correct
-- per-school figures, and never carry a pupil's name. Runs inside a
-- transaction that rolls back.
--
--   npm run db:verify:admin

begin;

do $$
declare
  v_ma uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_pupil uuid := gen_random_uuid();
  v_mum uuid := gen_random_uuid();
  v_student uuid;
  v_parent uuid;
  v_struct uuid := gen_random_uuid();
  v_over jsonb;
  v_n int;
  r record;
  v_text text;
  v_failed text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now()
    from (values (v_owner, 'va-owner@example.test'), (v_admin, 'va-admin@example.test'),
                 (v_pupil, 'va-pupil@example.test'), (v_mum, 'va-mum@example.test')) t(id, e);

  insert into public.profiles (id, role, madrasa_id, full_name, email) values
    (v_owner, 'teacher', null, 'VA Owner', 'va-owner@example.test'),
    (v_admin, 'admin', null, 'VA Admin', 'va-admin@example.test'),
    (v_pupil, 'student', null, 'Zzpupilname Uniquesurname', 'va-pupil@example.test'),
    (v_mum, 'parent', null, 'VA Mum', 'va-mum@example.test');
  -- Granted out of band, as in production (never by a client).
  update public.profiles set is_platform_admin = true where id = v_admin;

  insert into public.madrasas (id, name, slug, county, town, owner_id, contact_email, contact_phone, status)
  values (v_ma, 'VA Madrasa', 'va-' || substr(v_ma::text, 1, 8), 'Mandera', 'Mandera', v_owner,
          'va-owner@example.test', '+254712000001', 'active');
  update public.profiles set madrasa_id = v_ma where id in (v_owner, v_pupil, v_mum);
  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status)
  values (v_owner, v_ma, 'EMP-VA1', true, 'active');
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender)
  values (v_pupil, v_ma, extract(year from now())::int, date '2014-01-01', 'female') returning id into v_student;
  insert into public.parents (profile_id, madrasa_id) values (v_mum, v_ma) returning id into v_parent;
  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status)
  values (v_parent, v_student, v_ma, 'mother', 'approved');
  insert into public.fee_structures (id, madrasa_id, name, amount, currency, applies_to, term, academic_year)
  values (v_struct, v_ma, 'VA Term', 2500, 'KES', 'all', 'Term 3', 2026);
  insert into public.invoices (madrasa_id, student_id, invoice_no, fee_structure_id, amount_due, amount_paid,
                               currency, due_date, status, issued_at, description)
  values (v_ma, v_student, 'INV-VA-0001', v_struct, 2500, 500, 'KES', current_date + 10, 'partially_paid', now(), 'va');

  -- --------------------------------------------------------- the owner
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  -- 1-3. an owner, however senior in their own school, is not a platform admin
  begin
    perform public.admin_platform_overview();
    v_failed := v_failed || text 'owner read the platform overview';
  exception when insufficient_privilege then raise notice 'PASS  owner refused: overview'; end;
  begin
    perform count(*) from public.admin_madrasa_summaries();
    v_failed := v_failed || text 'owner read madrasa summaries';
  exception when insufficient_privilege then raise notice 'PASS  owner refused: madrasa summaries'; end;
  begin
    perform count(*) from public.admin_audit_log(null, 10);
    v_failed := v_failed || text 'owner read the platform audit log';
  exception when insufficient_privilege then raise notice 'PASS  owner refused: audit log'; end;

  -- ---------------------------------------------------------- the admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  -- 4. overview has every section, and counts this school
  v_over := public.admin_platform_overview();
  if not (v_over ? 'madrasas' and v_over ? 'people' and v_over ? 'subscriptions'
          and v_over ? 'revenue30d' and v_over ? 'delivery')
     or (v_over -> 'madrasas' ->> 'active')::int < 1
     or (v_over -> 'people' ->> 'students')::int < 1 then
    v_failed := v_failed || format('overview incomplete: %s', v_over);
  else raise notice 'PASS  admin overview: % active madrasa(s), % student(s)',
         v_over -> 'madrasas' ->> 'active', v_over -> 'people' ->> 'students'; end if;

  -- 5. per-school figures are right
  select * into r from public.admin_madrasa_summaries() s where s.id = v_ma;
  if r.students <> 1 or r.teachers <> 1 or r.parents <> 1 or r.fees_outstanding <> 2000
     or r.owner_email <> 'va-owner@example.test' or r.subscription_status is null then
    v_failed := v_failed || format('summary wrong: %s', row_to_json(r));
  else raise notice 'PASS  school summary: 1 pupil, 1 teacher, 1 parent, KES 2000 outstanding, %', r.subscription_status; end if;

  -- 6. no pupil's name anywhere in what the console reads
  select string_agg(row_to_json(s)::text, ' ') into v_text from public.admin_madrasa_summaries() s;
  v_text := coalesce(v_text, '') || public.admin_platform_overview()::text;
  select v_text || coalesce(string_agg(row_to_json(a)::text, ' '), '') into v_text
    from public.admin_audit_log(v_ma, 500) a;
  if v_text like '%Zzpupilname%' then
    v_failed := v_failed || text 'a pupil''s name reached the admin console';
  else raise notice 'PASS  no pupil name in console output'; end if;

  -- 7. the audit feed filters to one school, newest first, capped
  select count(*) into v_n from public.admin_audit_log(v_ma, 500) a where a.madrasa_id is distinct from v_ma;
  if v_n <> 0 then v_failed := v_failed || text 'audit filter leaked other schools';
  else raise notice 'PASS  audit feed filtered to the chosen school'; end if;
  select count(*) into v_n from public.admin_audit_log(null, 100000);
  if v_n > 500 then v_failed := v_failed || text 'audit limit not capped';
  else raise notice 'PASS  audit feed capped at 500'; end if;

  -- 8. and the console cannot write: the functions are read-only
  begin
    perform public.set_madrasa_status(v_ma, 'suspended', v_admin, 'x');
    v_failed := v_failed || text 'a signed-in admin called set_madrasa_status directly';
  exception when insufficient_privilege then
    raise notice 'PASS  status changes still go only through the lifecycle function';
  end;

  reset role;

  if array_length(v_failed, 1) > 0 then
    raise exception E'\n\nFAILURES:\n  - %\n', array_to_string(v_failed, E'\n  - ');
  end if;
  raise notice E'\nAdmin console reads hold.';
end $$;

rollback;
