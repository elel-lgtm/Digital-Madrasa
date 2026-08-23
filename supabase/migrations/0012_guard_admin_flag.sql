-- ===========================================================================
-- 0012 — Close the admin-escalation path on profiles
-- ===========================================================================
--
-- 0009 created two UPDATE policies on public.profiles:
--
--   "profiles: users cannot escalate themselves"  (the intended guard)
--   "profiles: admin updates any"                 (using/with check is_platform_admin())
--
-- Postgres combines permissive policies with OR, so the second one satisfies
-- the check on its own and the first never binds for an admin. The practical
-- effect is that a platform admin could:
--
--   * set is_platform_admin = false on their own row and lock themselves out;
--   * set is_platform_admin = true on ANY other user.
--
-- The second is precisely the "elevate to admin" path section 22 forbids. It
-- turns one compromised admin session into permanent, self-replicating access.
--
-- Policies alone cannot express "this column may not change" cleanly, because
-- WITH CHECK sees only the new row. A trigger can compare OLD to NEW, so the
-- rule is enforced there and holds for every policy, present and future.
--
-- Admins keep the ability to edit other profile fields — deactivating a user,
-- correcting a name. Only `role` and `is_platform_admin` become untouchable
-- from a client session, which leaves SQL as the sole grant path, exactly as
-- section 3.2 requires.
-- ===========================================================================

create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Out-of-band provisioning runs as the database owner or the service role,
  -- neither of which is reachable from a client session. scripts/grant-admin.mjs
  -- is the sanctioned path.
  if current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') then
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

  -- Moving a user between tenants is a re-assignment, not a profile edit.
  if new.madrasa_id is distinct from old.madrasa_id
     and not public.is_platform_admin() then
    raise exception 'madrasa_id cannot be changed from a client session'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_privileged_profile_columns on public.profiles;

create trigger trg_guard_privileged_profile_columns
  before update on public.profiles
  for each row execute function public.guard_privileged_profile_columns();

comment on function public.guard_privileged_profile_columns is
  'Blocks role / is_platform_admin changes from client sessions. The only grant path is SQL run with the service role.';
