-- ============================================================================
-- Digital Madrasa — 0002: profiles, madrasas and the RLS helper functions
-- ============================================================================

create table public.madrasas (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(btrim(name)) between 3 and 120),
  slug                  text not null unique,
  county                text not null,
  town                  text not null,
  owner_id              uuid not null,
  logo_url              text,
  contact_email         text not null,
  contact_phone         text not null check (contact_phone ~ '^\+?254[17]\d{8}$'),
  timezone              text not null default 'Africa/Nairobi',
  status                public.madrasa_status not null default 'active',
  deletion_scheduled_at timestamptz,
  deletion_reason       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  role               public.user_role not null,
  madrasa_id         uuid references public.madrasas (id) on delete set null,
  full_name          text not null check (length(btrim(full_name)) between 2 and 120),
  email              text not null,
  phone              text check (phone ~ '^\+?254[17]\d{8}$'),
  avatar_url         text,
  locale             text not null default 'en' check (locale in ('en', 'sw', 'so', 'ar')),
  -- Granted out-of-band by SQL only. No signup path, API route, Edge Function
  -- or deep link may ever set this. See 0010 for the policy that enforces it.
  is_platform_admin  boolean not null default false,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

alter table public.madrasas
  add constraint madrasas_owner_fk
  foreign key (owner_id) references public.profiles (id) on delete restrict;

create index madrasas_owner_idx    on public.madrasas (owner_id);
create index madrasas_status_idx   on public.madrasas (status) where deleted_at is null;
create index profiles_madrasa_idx  on public.profiles (madrasa_id) where deleted_at is null;
create index profiles_role_idx     on public.profiles (role);
create unique index profiles_email_idx on public.profiles (lower(email));

create trigger trg_madrasas_updated_at
  before update on public.madrasas
  for each row execute function public.set_updated_at();

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- helper functions --
-- These are SECURITY DEFINER with a pinned search_path so policies can call
-- them without recursing back through the very policies being evaluated.

create or replace function public.current_madrasa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select madrasa_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid()),
    false
  )
$$;

-- A suspended or pending-deletion tenant fails every policy. The status check
-- belongs here, inside the database, not in the app.
create or replace function public.madrasa_is_active(p_madrasa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.madrasas m
    where m.id = p_madrasa_id
      and m.status = 'active'
      and m.deleted_at is null
  )
$$;

-- Convenience wrapper: the caller's own tenant, and that tenant is usable.
create or replace function public.can_access_madrasa(p_madrasa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or (p_madrasa_id = public.current_madrasa_id()
          and public.madrasa_is_active(p_madrasa_id))
$$;

comment on function public.can_access_madrasa is
  'True when the caller is the platform admin, or belongs to an active tenant.';

revoke execute on function public.current_madrasa_id()  from public;
revoke execute on function public.current_role_name()   from public;
revoke execute on function public.is_platform_admin()   from public;
revoke execute on function public.madrasa_is_active(uuid) from public;
revoke execute on function public.can_access_madrasa(uuid) from public;

grant execute on function public.current_madrasa_id()      to authenticated;
grant execute on function public.current_role_name()       to authenticated;
grant execute on function public.is_platform_admin()       to authenticated;
grant execute on function public.madrasa_is_active(uuid)   to authenticated;
grant execute on function public.can_access_madrasa(uuid)  to authenticated;

-- ------------------------------------------------- new user provisioning --
-- Mirrors role and tenant into auth.users.raw_app_meta_data, which is
-- server-writable only. Never user_metadata: that field is client-writable
-- and would let any account promote itself.

create or replace function public.sync_auth_claims()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'role', new.role::text,
            'madrasa_id', new.madrasa_id,
            'is_platform_admin', new.is_platform_admin
          )
   where id = new.id;
  return new;
end;
$$;

create trigger trg_profiles_sync_claims
  after insert or update of role, madrasa_id, is_platform_admin on public.profiles
  for each row execute function public.sync_auth_claims();
