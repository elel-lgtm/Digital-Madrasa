-- ===========================================================================
-- 0021 — Storage reads for recitations follow the same rule as the rows
-- ===========================================================================
--
-- Reading a recitation row and reading the audio it points at were governed by
-- two different rules.
--
--   the row     public.recitations       can_read_student(student_id)
--   the audio   storage.objects          storage_madrasa_id(name) = current_madrasa_id()
--
-- The first is student-scoped: a parent sees only approved children, a student
-- only themselves, a teacher only their own madrasa. The second is merely
-- tenant-scoped, so anyone in the madrasa could mint a signed URL for any
-- recitation in it. Live testing confirmed a parent with no approved link to a
-- pupil receiving HTTP 200 for that pupil's recording.
--
-- It was not reachable through the app, because the only way to learn an object
-- path is `getRecitation`, which is student-scoped. That makes it a
-- defence-in-depth gap rather than an open door — but the audio is a child
-- reciting, the weaker of two rules is the one that decides, and "you would
-- have to know the path" is not an authorization boundary.
--
-- The fix reuses `can_read_student` rather than restating its logic, so the two
-- rules cannot drift apart again. The object path is unchanged: the recitation
-- row already stores it in `audio_url`, so the student is reachable by join and
-- there is no need to rewrite paths or move existing objects.
--
-- What deliberately does NOT change:
--   * the bucket stays private
--   * no DELETE policy is introduced
--   * the INSERT policy keeps its tenant check — at upload time the row does
--     not exist yet, so a join would refuse every upload
--   * platform admins keep the access they had
-- ===========================================================================

-- A policy that runs per object needs this lookup to be cheap. `audio_url` is
-- the storage path and is effectively unique per recitation.
create index if not exists recitations_audio_url_idx
  on public.recitations (audio_url);

-- ---------------------------------------------------------------------------
-- Reads: the same question the row asks
-- ---------------------------------------------------------------------------

drop policy if exists "recitations: tenant read" on storage.objects;
drop policy if exists "recitations: scoped read" on storage.objects;

create policy "recitations: scoped read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recitations'
    and (
      public.is_platform_admin()
      or exists (
        select 1
        from public.recitations r
        where r.audio_url = storage.objects.name
          and r.deleted_at is null
          and public.can_read_student(r.student_id)
      )
    )
  );

comment on policy "recitations: scoped read" on storage.objects is
  'Audio is readable by exactly whoever may read its recitation row: the student, their approved parents, and staff of that madrasa. Joins through recitations.audio_url so the rule lives in can_read_student only.';

-- ---------------------------------------------------------------------------
-- Writes: unchanged, and restated here so the intent is on the record
-- ---------------------------------------------------------------------------
--
-- An upload happens before the recitation row exists — the client asks the
-- Edge Function for a signed URL, PUTs the audio, and only then does the
-- function create the row pointing at that path. A join-based check would
-- therefore refuse every upload. The tenant check is the right rule here
-- because the path is chosen by the server from the caller's own madrasa, so a
-- client cannot aim an upload at another tenant's folder.

drop policy if exists "recitations: tenant write" on storage.objects;
create policy "recitations: tenant write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recitations'
    and public.storage_madrasa_id(name) = public.current_madrasa_id()
    and public.madrasa_is_active(public.current_madrasa_id())
  );
