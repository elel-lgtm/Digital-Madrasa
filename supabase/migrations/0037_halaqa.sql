-- 0037: the live halaqa (Qur'an reading circle).
--
-- During a live lesson everyone opens the same reading room: pupils raise
-- their hands, the teacher chooses who reads, every phone shows who is
-- reading and highlights the ayah, and the teacher marks each reading.
--
-- Two pieces live in the database:
--
-- 1. halaqa_readings: the teacher's mark for each reading, kept on the
--    pupil's record. Pupils and parents read their own (through
--    readable_student_ids(), the same rule as everything else); only the
--    madrasa's teachers write.
--
-- 2. Who may join a lesson's room. The room is a private Realtime channel
--    named 'halaqa:<lesson id>'. These policies on realtime.messages let a
--    signed-in user listen and speak on it only if they belong to that
--    lesson's madrasa, so a pupil's name and reading never reach outsiders.
--
-- Re-runnable.

create table if not exists public.halaqa_readings (
  id          uuid primary key default gen_random_uuid(),
  madrasa_id  uuid not null references public.madrasas (id) on delete cascade,
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  surah_no    int not null check (surah_no between 1 and 114),
  ayah_from   int not null check (ayah_from >= 1),
  ayah_to     int not null check (ayah_to >= ayah_from),
  mark        text not null check (mark in ('excellent', 'good', 'needs_work')),
  note        text check (note is null or length(note) <= 300),
  marked_by   uuid,
  created_at  timestamptz not null default now()
);

create index if not exists halaqa_readings_student_idx on public.halaqa_readings (student_id, created_at desc);

alter table public.halaqa_readings enable row level security;

drop policy if exists "halaqa: scoped read" on public.halaqa_readings;
create policy "halaqa: scoped read" on public.halaqa_readings
  for select using (student_id in (select public.readable_student_ids()));

drop policy if exists "halaqa: teacher marks" on public.halaqa_readings;
create policy "halaqa: teacher marks" on public.halaqa_readings
  for insert with check (
    public.current_role_name() = 'teacher'
    and public.can_access_madrasa(madrasa_id)
    and marked_by = auth.uid()
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.madrasa_id = halaqa_readings.madrasa_id and l.deleted_at is null)
    and exists (select 1 from public.students s where s.id = student_id and s.madrasa_id = halaqa_readings.madrasa_id and s.deleted_at is null)
  );

grant select, insert on public.halaqa_readings to authenticated;

-- ------------------------------------------------------- the live room

/** True when the caller belongs to the madrasa of the lesson a topic names. */
create or replace function public.can_join_halaqa(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_topic ~ '^halaqa:[0-9a-f-]{36}$'
     and exists (
       select 1 from public.lessons l
        where l.id = substring(p_topic from 8)::uuid
          and l.deleted_at is null
          and public.can_access_madrasa(l.madrasa_id)
     );
$$;

revoke execute on function public.can_join_halaqa(text) from public, anon;
grant execute on function public.can_join_halaqa(text) to authenticated;

drop policy if exists "halaqa room: members listen" on realtime.messages;
create policy "halaqa room: members listen" on realtime.messages
  for select to authenticated
  using (public.can_join_halaqa((select realtime.topic())));

drop policy if exists "halaqa room: members speak" on realtime.messages;
create policy "halaqa room: members speak" on realtime.messages
  for insert to authenticated
  with check (public.can_join_halaqa((select realtime.topic())));
