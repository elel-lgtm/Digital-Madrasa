-- ===========================================================================
-- 0014 — Live session links on lessons
-- ===========================================================================
--
-- The app has shipped a live-session feature since the LiveSessionCard work,
-- but the column it writes to was never created — the mock carried it and the
-- database did not. Adding it now, with the same host allowlist the client and
-- gateway enforce.
--
-- The CHECK is not decoration. A lesson's meeting link is rendered as a
-- tappable button in front of children, so an arbitrary URL there is a
-- phishing vector. Constraining it in the database means no code path — not a
-- future Edge Function, not a direct SQL fix — can quietly widen it.
-- ===========================================================================

alter table public.lessons
  add column if not exists meeting_url text;

alter table public.lessons
  drop constraint if exists lessons_meeting_url_allowlist;

alter table public.lessons
  add constraint lessons_meeting_url_allowlist check (
    meeting_url is null
    or meeting_url ~ '^https://meet\.google\.com/'
    or meeting_url ~ '^https://teams\.microsoft\.com/'
    or meeting_url ~ '^https://teams\.live\.com/'
    or meeting_url ~ '^https://([a-z0-9-]+\.)?zoom\.us/'
    or meeting_url ~ '^https://meet\.jit\.si/'
  );

comment on column public.lessons.meeting_url is
  'Google Meet / Teams / Zoom / Jitsi link. Host-allowlisted: this is shown to children as a tappable button.';

-- ------------------------------------------------------------------ policy
--
-- Only the class's own teacher or the madrasa owner may point a class at a
-- meeting room. Being staff in the tenant is not enough: replacing a link is
-- enough to redirect a class of children somewhere you control.

create or replace function public.can_manage_lesson_meeting(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.lessons l
      join public.classes c on c.id = l.class_id
      join public.teachers t on t.madrasa_id = l.madrasa_id
     where l.id = p_lesson_id
       and t.profile_id = auth.uid()
       and (t.is_owner or c.teacher_id = t.id)
  )
$$;

drop policy if exists "lessons: staff update" on public.lessons;
create policy "lessons: staff update" on public.lessons
  for update
  using (
    public.can_access_madrasa(madrasa_id)
    and public.current_role_name() = 'teacher'
  )
  with check (
    public.can_access_madrasa(madrasa_id)
    and public.current_role_name() = 'teacher'
    -- Any lesson edit is fine; changing where the class meets is not.
    and (meeting_url is null or public.can_manage_lesson_meeting(id))
  );
