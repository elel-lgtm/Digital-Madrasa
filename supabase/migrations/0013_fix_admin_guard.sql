-- ===========================================================================
-- 0013 — Correct the privileged-column guard from 0012
-- ===========================================================================
--
-- 0012 added the right trigger with the wrong test. It was declared
-- SECURITY DEFINER and then branched on `current_user` — but inside a
-- SECURITY DEFINER function `current_user` is the function's OWNER, not the
-- caller. It evaluated to 'postgres' for everyone, so the guard opened the
-- gate it was meant to close and a client session could still change
-- is_platform_admin.
--
-- The reliable signal is the request's JWT, which PostgREST sets per request
-- and which direct SQL does not have at all:
--
--   no claims          -> psql / migration / management API  -> allow
--   role=service_role  -> an Edge Function                   -> allow
--   anything else      -> a signed-in user                   -> block
--
-- That leaves SQL and Edge Functions as the only grant paths, which is what
-- section 3.2 requires.
-- ===========================================================================

create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
-- Deliberately NOT security definer: this function must see the caller's own
-- context, not the owner's.
set search_path = public
as $$
declare
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_role   text;
begin
  -- No JWT means no client session: direct SQL, a migration, or the
  -- management API. scripts/grant-admin.mjs is the sanctioned path.
  if v_claims = '' then
    return new;
  end if;

  begin
    v_role := v_claims::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;

  -- Edge Functions run with the service role and are server-side code we wrote.
  if v_role = 'service_role' then
    return new;
  end if;

  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'is_platform_admin cannot be changed from a client session'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    raise exception 'role cannot be changed from a client session'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_privileged_profile_columns is
  'Blocks role / is_platform_admin changes from any request carrying a user JWT. Grants happen via SQL or an Edge Function only.';
