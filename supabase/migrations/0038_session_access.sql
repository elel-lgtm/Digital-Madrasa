-- 0038: live sessions are for their own class.
--
-- A lesson carries the live session's meeting link, which a child taps. Until
-- now any member of the madrasa could read every lesson, so a pupil could see
-- another class's link. From here:
--
--   staff of the madrasa    every lesson in it
--   a pupil                 their own class's lessons
--   a parent                the lessons of their approved children's classes
--   platform admin          everything (support)
--
-- can_read_lesson() states that rule once. The lessons read policy and the
-- live reading room's admission (can_join_halaqa, 0037) both use it, so the
-- room and the link can never disagree about who belongs.
--
-- When a session is scheduled (a lesson with a time), the class's pupils and
-- their parents get an inbox notice; the meeting link itself stays on the
-- lesson, behind this rule.
--
-- Re-runnable.

-- The rule, on a lesson's madrasa and class. Takes the row's own columns so
-- the read policy can use it on a row being inserted (RETURNING), which a
-- lookup by id could not yet see.
create or replace function public.lesson_visible(p_madrasa_id uuid, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or (public.current_role_name() in ('teacher', 'admin') and public.can_access_madrasa(p_madrasa_id))
      or p_class_id = (select s.class_id from public.students s where s.id = public.current_student_id())
      or p_class_id in (
           select s.class_id from public.students s
            where s.id in (select public.approved_child_ids()) and s.class_id is not null
         );
$$;

create or replace function public.can_read_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson_id and l.deleted_at is null
       and public.lesson_visible(l.madrasa_id, l.class_id)
  );
$$;

revoke execute on function public.lesson_visible(uuid, uuid) from public, anon;
grant execute on function public.lesson_visible(uuid, uuid) to authenticated;
revoke execute on function public.can_read_lesson(uuid) from public, anon;
grant execute on function public.can_read_lesson(uuid) to authenticated;

drop policy if exists "lessons: tenant read" on public.lessons;
drop policy if exists "lessons: class read" on public.lessons;
create policy "lessons: class read" on public.lessons
  for select using (deleted_at is null and public.lesson_visible(madrasa_id, class_id));

-- The reading room admits exactly who may read the lesson.
create or replace function public.can_join_halaqa(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_topic ~ '^halaqa:[0-9a-f-]{36}$'
     and public.can_read_lesson(substring(p_topic from 8)::uuid);
$$;

-- ------------------------------------------------------ the class is told

create or replace function public.notify_live_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scheduled_for is null or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.scheduled_for is not distinct from new.scheduled_for
     and old.meeting_url is not distinct from new.meeting_url then
    return new;
  end if;

  insert into public.notifications (user_id, madrasa_id, type, title, body, payload, channel)
  select distinct r.profile_id, new.madrasa_id, 'live_session',
         'Live session: ' || new.title,
         format('%s at %s (East Africa Time). Open the app at that time to join.',
                to_char(new.scheduled_for at time zone 'Africa/Nairobi', 'Dy DD Mon'),
                to_char(new.scheduled_for at time zone 'Africa/Nairobi', 'HH24:MI')),
         jsonb_build_object('lesson_id', new.id),
         array['in_app', 'push']
    from (
      select s.profile_id from public.students s
       where s.class_id = new.class_id and s.deleted_at is null and s.enrollment_status = 'active'
      union
      select pa.profile_id from public.students s
        join public.parent_student_links l on l.student_id = s.id and l.status = 'approved' and l.deleted_at is null
        join public.parents pa on pa.id = l.parent_id
       where s.class_id = new.class_id and s.deleted_at is null
    ) r;
  return new;
end;
$$;

drop trigger if exists lessons_notify_live_session on public.lessons;
create trigger lessons_notify_live_session
  after insert or update of scheduled_for, meeting_url on public.lessons
  for each row execute function public.notify_live_session();
