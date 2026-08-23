-- ===========================================================================
-- 0011 — Signup RPCs
-- ===========================================================================
--
-- Creating an owner account touches five tables: profiles, madrasas, teachers,
-- subscriptions (via trigger) and the profile's tenant back-reference. Doing
-- that as a sequence of client inserts means a failure halfway leaves an auth
-- user who owns nothing, cannot use the app, and cannot sign up again with the
-- same email. So each signup is one transactional function.
--
-- These are the ONLY functions that may set `role` and `madrasa_id`. Neither
-- accepts them as parameters, and no path here can set `is_platform_admin` —
-- that flag is granted out of band by SQL and nowhere else.
-- ===========================================================================

create or replace function public.register_madrasa_owner(
  p_user_id      uuid,
  p_full_name    text,
  p_email        text,
  p_phone        text,
  p_madrasa_name text,
  p_county       text,
  p_town         text,
  p_locale       text default 'en'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_madrasa_id uuid := gen_random_uuid();
  v_slug       text;
  v_suffix     int := 0;
begin
  -- A caller may only ever set up their own account. Without this, one
  -- authenticated user could provision a madrasa owned by someone else.
  if auth.uid() is distinct from p_user_id then
    raise exception 'you may only register your own account';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'this account is already registered';
  end if;

  -- Slug must be unique and is derived, never client-supplied.
  v_slug := regexp_replace(lower(trim(p_madrasa_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'madrasa'; end if;

  while exists (select 1 from public.madrasas where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_slug || '-' || v_suffix::text;
  end loop;

  -- Role is set here, by the server. `is_platform_admin` is left at its
  -- default of false and is not addressable from this function.
  insert into public.profiles (id, role, madrasa_id, full_name, email, phone, locale)
  values (p_user_id, 'teacher', null, p_full_name, p_email, p_phone, p_locale);

  insert into public.madrasas (id, name, slug, county, town, owner_id,
                               contact_email, contact_phone, status)
  values (v_madrasa_id, p_madrasa_name, v_slug, p_county, p_town, p_user_id,
          p_email, p_phone, 'active');

  update public.profiles set madrasa_id = v_madrasa_id where id = p_user_id;

  insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status)
  values (p_user_id, v_madrasa_id, 'EMP-001', true, 'active');

  -- The trial subscription is created by the trigger on madrasas (0010).
  return v_madrasa_id;
end;
$$;

create or replace function public.register_parent(
  p_user_id   uuid,
  p_full_name text,
  p_email     text,
  p_phone     text,
  p_locale    text default 'en'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'you may only register your own account';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'this account is already registered';
  end if;

  -- A parent starts with no tenant. `madrasa_id` is set only when their first
  -- child link is approved, which is what opens that child's records to them.
  insert into public.profiles (id, role, madrasa_id, full_name, email, phone, locale)
  values (p_user_id, 'parent', null, p_full_name, p_email, p_phone, p_locale);

  insert into public.parents (profile_id, madrasa_id)
  values (p_user_id, null);
end;
$$;

-- Callable by a signed-in user setting up their own account, and by nobody
-- else. `anon` is deliberately excluded: signup creates the auth user first,
-- so by the time these run the caller is authenticated.
revoke all on function public.register_madrasa_owner(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.register_parent(uuid, text, text, text, text) from public, anon;
grant execute on function public.register_madrasa_owner(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.register_parent(uuid, text, text, text, text) to authenticated;
