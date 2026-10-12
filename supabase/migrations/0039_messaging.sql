-- 0039: parent–teacher messaging that works from both sides.
--
-- my_threads()        the caller's conversations, with the other person's
--                     name and role, the pupil it is about, the last message
--                     and how many are unread. A thread stores two
--                     participants, so "the other person" depends on who
--                     asks; working it out here keeps the app simple.
-- message_contacts()  who the caller may write to:
--                       a parent  -> the class teacher and the owner of each
--                                    approved child's madrasa
--                       a teacher -> the approved parents of the pupils in
--                                    their madrasa
-- A trigger holds every new message to that list, so a message can only
-- reach someone the sender genuinely has a child (or a pupil) in common
-- with.
--
-- Re-runnable.

create or replace function public.message_contacts()
returns table (profile_id uuid, full_name text, role text, student_id uuid, student_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct tp.id, tp.full_name, 'teacher'::text, s.id, sp.full_name
    from public.students s
    join public.profiles sp on sp.id = s.profile_id
    join public.teachers t on t.madrasa_id = s.madrasa_id and t.status = 'active'
     and (t.is_owner or t.id = (select c.teacher_id from public.classes c where c.id = s.class_id))
    join public.profiles tp on tp.id = t.profile_id and tp.deleted_at is null
   where public.current_role_name() = 'parent'
     and s.id in (select public.approved_child_ids())
     and s.deleted_at is null
  union
  select distinct pp.id, pp.full_name, 'parent'::text, s.id, sp.full_name
    from public.students s
    join public.profiles sp on sp.id = s.profile_id
    join public.parent_student_links l on l.student_id = s.id and l.status = 'approved' and l.deleted_at is null
    join public.parents pa on pa.id = l.parent_id
    join public.profiles pp on pp.id = pa.profile_id and pp.deleted_at is null
   where public.current_role_name() = 'teacher'
     and s.madrasa_id = public.current_madrasa_id()
     and s.deleted_at is null;
$$;

revoke execute on function public.message_contacts() from public, anon;
grant execute on function public.message_contacts() to authenticated;

create or replace function public.my_threads()
returns table (
  id uuid, student_id uuid, student_name text,
  counterpart_id uuid, counterpart_name text, counterpart_role text,
  last_message text, last_message_at timestamptz, unread int
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.student_id, sp.full_name,
         cp.id, cp.full_name, cp.role::text,
         (select m.body from public.messages m
           where m.thread_id = t.id and m.deleted_at is null order by m.created_at desc limit 1),
         coalesce((select max(m.created_at) from public.messages m where m.thread_id = t.id and m.deleted_at is null),
                  t.last_message_at),
         (select count(*)::int from public.messages m
           where m.thread_id = t.id and m.recipient_id = auth.uid() and m.read_at is null and m.deleted_at is null)
    from public.message_threads t
    join public.profiles cp on cp.id = case when t.participant_a = auth.uid() then t.participant_b else t.participant_a end
    left join public.students s on s.id = t.student_id
    left join public.profiles sp on sp.id = s.profile_id
   where t.deleted_at is null
     and auth.uid() in (t.participant_a, t.participant_b)
   order by 8 desc;
$$;

revoke execute on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated;

-- Every message must go to one of the sender's contacts, inside a thread
-- the two of them share.
create or replace function public.check_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- service role (none today) is trusted
  end if;
  if not exists (select 1 from public.message_contacts() c where c.profile_id = new.recipient_id) then
    raise exception 'You can only message the teachers or parents of your own pupils.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.message_threads t
     where t.id = new.thread_id
       and ((t.participant_a = new.sender_id and t.participant_b = new.recipient_id)
         or (t.participant_b = new.sender_id and t.participant_a = new.recipient_id))
  ) then
    raise exception 'That conversation is not between you and this person.' using errcode = '42501';
  end if;
  update public.message_threads set last_message_at = now() where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_check_recipient on public.messages;
create trigger messages_check_recipient
  before insert on public.messages
  for each row execute function public.check_message_recipient();

-- A parent's profile belongs to no madrasa (they are linked through their
-- children), so the original "member of the madrasa" check shut parents out
-- of messaging entirely. They may write within a madrasa where they have an
-- approved child; the contact check above still decides to whom.
create or replace function public.can_message_in(p_madrasa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_madrasa(p_madrasa_id)
      or exists (
        select 1 from public.students s
         where s.id in (select public.approved_child_ids())
           and s.madrasa_id = p_madrasa_id and s.deleted_at is null
      );
$$;

revoke execute on function public.can_message_in(uuid) from public, anon;
grant execute on function public.can_message_in(uuid) to authenticated;

drop policy if exists "threads: participants create" on public.message_threads;
create policy "threads: participants create" on public.message_threads
  for insert with check (
    (participant_a = auth.uid() or participant_b = auth.uid())
    and public.can_message_in(madrasa_id)
  );

drop policy if exists "messages: sender inserts" on public.messages;
create policy "messages: sender inserts" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.can_message_in(madrasa_id)
  );
