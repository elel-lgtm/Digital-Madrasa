-- ===========================================================================
-- 0015 — Provision accounts from a trigger, not a client RPC
-- ===========================================================================
--
-- 0011 had the client call register_madrasa_owner() straight after signUp.
-- That cannot work while email confirmation is enabled: Supabase issues no
-- session until the address is confirmed, so the call arrives as `anon` and
-- is refused — "permission denied for function register_madrasa_owner".
--
-- Granting anon EXECUTE would be the wrong fix. It would let anyone create
-- madrasas and profiles without proving they control an email address.
--
-- Instead the work moves to a trigger on auth.users. It runs as part of the
-- signup transaction, needs no session, and cannot be called directly by
-- anyone. Role and madrasa_id are still set here, by the server; nothing the
-- client sends can influence them, and there is still no path that sets
-- is_platform_admin.
--
-- The user's own details (name, phone, madrasa name, county, town) ride in
-- raw_user_meta_data. That field is client-writable, which is fine — these are
-- the person's own particulars, not privileges.
-- ===========================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_kind       text  := meta ->> 'signup_kind';
  v_full_name  text  := coalesce(nullif(meta ->> 'full_name', ''), 'New user');
  v_phone      text  := nullif(meta ->> 'phone', '');
  v_locale     text  := coalesce(nullif(meta ->> 'locale', ''), 'en');
  v_madrasa_id uuid  := gen_random_uuid();
  v_slug       text;
  v_suffix     int   := 0;
begin
  -- Only accounts created through the app's two public signup paths are
  -- provisioned. Anything else (admin API, SQL seed) is left alone so this
  -- cannot interfere with out-of-band provisioning.
  if v_kind is null then
    return new;
  end if;

  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  if v_kind = 'madrasa_owner' then
    v_slug := trim(both '-' from regexp_replace(
      lower(coalesce(nullif(meta ->> 'madrasa_name', ''), 'madrasa')),
      '[^a-z0-9]+', '-', 'g'));
    if v_slug = '' then v_slug := 'madrasa'; end if;

    while exists (select 1 from public.madrasas where slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := v_slug || '-' || v_suffix::text;
    end loop;

    insert into public.profiles (id, role, madrasa_id, full_name, email, phone, locale)
    values (new.id, 'teacher', null, v_full_name, new.email, v_phone, v_locale);

    insert into public.madrasas (id, name, slug, county, town, owner_id,
                                 contact_email, contact_phone, status)
    values (
      v_madrasa_id,
      coalesce(nullif(meta ->> 'madrasa_name', ''), 'My Madrasa'),
      v_slug,
      coalesce(nullif(meta ->> 'county', ''), 'Nairobi'),
      coalesce(nullif(meta ->> 'town', ''), 'Unknown'),
      new.id,
      new.email,
      coalesce(v_phone, '+254700000000'),
      'active'
    );

    update public.profiles set madrasa_id = v_madrasa_id where id = new.id;

    insert into public.teachers (profile_id, madrasa_id, employee_no, is_owner, status)
    values (new.id, v_madrasa_id, 'EMP-001', true, 'active');

  elsif v_kind = 'parent' then
    -- A parent starts with no tenant. madrasa_id is set when their first
    -- child link is approved, which is what opens that child's records.
    insert into public.profiles (id, role, madrasa_id, full_name, email, phone, locale)
    values (new.id, 'parent', null, v_full_name, new.email, v_phone, v_locale);

    insert into public.parents (profile_id, madrasa_id)
    values (new.id, null);
  end if;

  return new;
exception
  when others then
    -- A failure here must not abort the signup itself: an auth user with no
    -- profile can be repaired, but a half-failed signup leaves an address
    -- that can never be registered again.
    raise warning 'handle_new_auth_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;

create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- The client no longer calls these; the trigger does the work. Revoking
-- EXECUTE removes a callable surface that no longer has a caller.
revoke execute on function public.register_madrasa_owner(uuid, text, text, text, text, text, text, text) from authenticated;
revoke execute on function public.register_parent(uuid, text, text, text, text) from authenticated;

comment on function public.handle_new_auth_user is
  'Provisions profile/madrasa/parent rows at signup. Runs without a session, so it works with email confirmation enabled.';
