-- 0036: a madrasa's Qur'an video library.
--
-- Teachers choose YouTube videos (tajweed lessons, recitations) for a class
-- or for the whole madrasa; pupils watch them in the app. Only the video id
-- is stored, never an arbitrary URL, so a link shown to children can only
-- ever open YouTube's own player. There is no open search: what a child sees
-- is what their teacher chose.
--
-- Same rules as lessons: everyone in the madrasa reads, its teachers write.
--
-- Re-runnable.

create table if not exists public.class_videos (
  id          uuid primary key default gen_random_uuid(),
  madrasa_id  uuid not null references public.madrasas (id) on delete cascade,
  -- null = every class in the madrasa
  class_id    uuid references public.classes (id) on delete cascade,
  youtube_id  text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       text not null check (length(btrim(title)) between 3 and 140),
  note        text check (note is null or length(note) <= 300),
  added_by    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists class_videos_madrasa_idx on public.class_videos (madrasa_id) where deleted_at is null;

alter table public.class_videos enable row level security;

drop policy if exists "class_videos: tenant read" on public.class_videos;
create policy "class_videos: tenant read" on public.class_videos
  for select using (deleted_at is null and public.can_access_madrasa(madrasa_id));

drop policy if exists "class_videos: staff insert" on public.class_videos;
create policy "class_videos: staff insert" on public.class_videos
  for insert with check (
    public.can_access_madrasa(madrasa_id)
    and public.current_role_name() = 'teacher'
    and added_by = auth.uid()
    and (class_id is null or exists (
      select 1 from public.classes c where c.id = class_id and c.madrasa_id = class_videos.madrasa_id
    ))
  );

drop policy if exists "class_videos: staff update" on public.class_videos;
create policy "class_videos: staff update" on public.class_videos
  for update using (public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher')
  with check (public.can_access_madrasa(madrasa_id));

grant select, insert, update on public.class_videos to authenticated;

comment on table public.class_videos is 'Teacher-chosen YouTube videos; only the 11-character video id is stored.';
