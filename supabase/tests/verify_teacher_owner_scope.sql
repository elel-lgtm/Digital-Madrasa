-- Proves that managing staff is confined to the madrasa the caller owns.
--
--   npm run db:verify:teachers
--
-- The policy expression is evaluated directly against the live schema rather
-- than through PostgREST, so what is checked is the rule itself: for a given
-- caller and a given staff row, does the owner clause hold?
--
-- The case that matters is the one the old policy got wrong: a person who owns
-- one madrasa and is an ordinary teacher in another. Everything rolls back.

begin;

do $$
declare
  v_m_a        uuid := gen_random_uuid();
  v_m_b        uuid := gen_random_uuid();
  v_owner_a    uuid := gen_random_uuid();
  v_owner_b    uuid := gen_random_uuid();
  v_dual       uuid := gen_random_uuid();
  v_outsider   uuid := gen_random_uuid();
  v_failed     text[] := '{}';
  v_allowed    boolean;
begin
  -- ---------------------------------------------------------------- fixtures
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'tscope-' || substr(u::text, 1, 8) || '@example.test', '', now(), now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_dual, v_outsider]) u;

  insert into public.profiles (id, role, madrasa_id, full_name, email)
  values (v_owner_a,  'teacher', null, 'Owner A',  'tscope-a@example.test'),
         (v_owner_b,  'teacher', null, 'Owner B',  'tscope-b@example.test'),
         (v_dual,     'teacher', null, 'Dual Hat', 'tscope-d@example.test'),
         (v_outsider, 'teacher', null, 'Outsider', 'tscope-o@example.test');

  insert into public.madrasas (id, name, slug, county, town, owner_id,
                               contact_email, contact_phone, status)
  values (v_m_a, 'Scope A', 'tscope-a-' || substr(v_m_a::text, 1, 8),
          'Mandera', 'Mandera', v_owner_a, 'a@example.test', '+254700000301', 'active'),
         (v_m_b, 'Scope B', 'tscope-b-' || substr(v_m_b::text, 1, 8),
          'Wajir', 'Wajir', v_owner_b, 'b@example.test', '+254700000302', 'active');

  -- The dual-hat person's profile points at B, which is what
  -- `can_access_madrasa` reads, while their owner record is in A.
  update public.profiles set madrasa_id = v_m_a where id = v_owner_a;
  update public.profiles set madrasa_id = v_m_b where id in (v_owner_b, v_dual, v_outsider);

  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status)
  values (v_owner_a, v_m_a, 'EMP-A01', true,  'active'),
         (v_owner_b, v_m_b, 'EMP-B01', true,  'active'),
         (v_dual,    v_m_a, 'EMP-A02', true,  'active'),   -- owns A
         (v_dual,    v_m_b, 'EMP-B02', false, 'active'),   -- plain staff in B
         (v_outsider, v_m_b, 'EMP-B03', false, 'active');

  -- --------------------------------------------------------------- the rule
  -- Mirrors the owner clause the policies use, for a staff row in madrasa B.
  create temporary table t_case (who uuid, expected boolean) on commit drop;
  insert into t_case values
    (v_owner_b,  true),    -- B's own owner
    (v_dual,     false),   -- owns A, only a teacher in B
    (v_outsider, false),   -- plain teacher in B
    (v_owner_a,  false);   -- owner of A, not in B at all

  declare
    r record;
  begin
    for r in select * from t_case loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', r.who::text, 'role', 'authenticated')::text, true);

      select public.can_access_madrasa(v_m_b)
             and exists (
               select 1 from public.teachers t
                where t.profile_id = auth.uid()
                  and t.is_owner
                  and t.deleted_at is null
                  and t.madrasa_id = v_m_b
             )
        into v_allowed;

      if v_allowed is distinct from r.expected then
        v_failed := v_failed || format(
          'caller %s: expected %s but got %s for staff in madrasa B',
          r.who::text, r.expected::text, coalesce(v_allowed::text, 'null')
        )::text;
      end if;
    end loop;
  end;

  -- The cases above evaluate the clause this migration installs. That alone
  -- would pass whether or not the live policy had been changed, so the
  -- deployed expression itself is read back and checked: Postgres prints the
  -- self-comparison verbatim when the correlation is missing, which is how the
  -- fault was found in the first place.
  declare
    v_unscoped int;
    v_total    int;
  begin
    select count(*) filter (where coalesce(qual, with_check) like '%t.madrasa_id = t.madrasa_id%'),
           count(*)
      into v_unscoped, v_total
      from pg_policies
     where schemaname = 'public'
       and tablename = 'teachers'
       and policyname in ('teachers: owner invites', 'teachers: owner updates');

    if v_total <> 2 then
      v_failed := v_failed || format(
        'expected both owner policies on public.teachers, found %s', v_total)::text;
    end if;
    if v_unscoped > 0 then
      v_failed := v_failed || format(
        '%s owner policy/policies still compare t.madrasa_id with itself', v_unscoped)::text;
    end if;
  end;

  perform set_config('request.jwt.claims', null, true);

  if array_length(v_failed, 1) is null then
    raise notice 'Teacher management is scoped to the madrasa the caller owns.';
  else
    raise exception E'\n%', array_to_string(v_failed, E'\n');
  end if;
end $$;

rollback;
