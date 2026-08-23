-- ============================================================================
-- Digital Madrasa — 0004: parents and the parent ↔ child link
-- ============================================================================

create table public.parents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  -- Null until the first link is approved; derived from that child's madrasa.
  madrasa_id uuid references public.madrasas (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.parent_student_links (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.parents (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  madrasa_id   uuid not null references public.madrasas (id) on delete cascade,
  relationship public.relationship_type not null,
  status       public.link_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles (id) on delete set null,
  reason       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (parent_id, student_id)
);

create index parents_madrasa_idx on public.parents (madrasa_id);
create index psl_parent_idx  on public.parent_student_links (parent_id, status);
create index psl_student_idx on public.parent_student_links (student_id, status);
create index psl_madrasa_idx on public.parent_student_links (madrasa_id, requested_at desc)
  where deleted_at is null;

create trigger trg_parents_updated_at before update on public.parents
  for each row execute function public.set_updated_at();
create trigger trg_psl_updated_at before update on public.parent_student_links
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- helper functions --

create or replace function public.current_parent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.parents where profile_id = auth.uid()
$$;

-- The single source of truth for parent scope. Every parent-facing policy
-- joins through this, so a parent can only ever reach an approved child.
create or replace function public.approved_child_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.student_id
    from public.parent_student_links l
    join public.parents p on p.id = l.parent_id
   where p.profile_id = auth.uid()
     and l.status = 'approved'
     and l.deleted_at is null
$$;

create or replace function public.is_approved_child(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.approved_child_ids() c where c = p_student_id)
$$;

-- A student's own record, for the student role.
create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.students where profile_id = auth.uid() and deleted_at is null
$$;

revoke execute on function public.current_parent_id()          from public;
revoke execute on function public.approved_child_ids()         from public;
revoke execute on function public.is_approved_child(uuid)      from public;
revoke execute on function public.current_student_id()         from public;

grant execute on function public.current_parent_id()      to authenticated;
grant execute on function public.approved_child_ids()     to authenticated;
grant execute on function public.is_approved_child(uuid)  to authenticated;
grant execute on function public.current_student_id()     to authenticated;

-- Whether the caller may read a given student at all, in any role.
create or replace function public.can_read_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_role_name()
    when 'parent'  then public.is_approved_child(p_student_id)
    when 'student' then p_student_id = public.current_student_id()
    when 'teacher' then exists (
      select 1 from public.students s
       where s.id = p_student_id
         and s.madrasa_id = public.current_madrasa_id()
         and public.madrasa_is_active(s.madrasa_id)
    )
    else public.is_platform_admin()
  end
$$;

revoke execute on function public.can_read_student(uuid) from public;
grant execute on function public.can_read_student(uuid) to authenticated;

-- On approval, the parent inherits the child's tenant (first link only).
create or replace function public.apply_link_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.parents
       set madrasa_id = coalesce(madrasa_id, new.madrasa_id)
     where id = new.parent_id;

    update public.profiles p
       set madrasa_id = coalesce(p.madrasa_id, new.madrasa_id)
      from public.parents pa
     where pa.id = new.parent_id
       and p.id = pa.profile_id;
  end if;
  return new;
end;
$$;

create trigger trg_psl_apply_approval
  after update on public.parent_student_links
  for each row execute function public.apply_link_approval();
