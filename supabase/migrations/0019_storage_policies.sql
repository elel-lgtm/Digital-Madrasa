-- ===========================================================================
-- 0019 — Storage access policies
-- ===========================================================================
--
-- Buckets are private, so nothing is reachable without a signed URL. These
-- policies decide who may ask for one, and who may upload.
--
-- Paths are `madrasa/{madrasa_id}/{entity}/{uuid}`, which lets a policy read
-- the tenant straight out of the object name — storage.foldername() splits it
-- and element 2 is the madrasa id. Without that convention every check would
-- need a join back through whatever row references the file, which storage
-- policies cannot do cheaply.
--
-- Note what is NOT granted: nobody may DELETE. A recitation is evidence of a
-- child's progress and part of the record; removal is an admin operation
-- through the purge path, not something a teacher can do by mistake.
-- ===========================================================================

create or replace function public.storage_madrasa_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(object_name))[1] = 'madrasa'
     and (storage.foldername(object_name))[2] ~ '^[0-9a-f-]{36}$'
    then ((storage.foldername(object_name))[2])::uuid
    else null
  end
$$;

-- ------------------------------------------------------------- recitations

drop policy if exists "recitations: tenant read" on storage.objects;
create policy "recitations: tenant read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recitations'
    and (
      public.is_platform_admin()
      or public.storage_madrasa_id(name) = public.current_madrasa_id()
    )
  );

-- Students upload their own; staff upload on their behalf during a lesson.
drop policy if exists "recitations: tenant write" on storage.objects;
create policy "recitations: tenant write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recitations'
    and public.storage_madrasa_id(name) = public.current_madrasa_id()
    and public.madrasa_is_active(public.current_madrasa_id())
  );

-- ----------------------------------------------------------------- avatars

drop policy if exists "avatars: tenant read" on storage.objects;
create policy "avatars: tenant read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_platform_admin()
      or public.storage_madrasa_id(name) = public.current_madrasa_id()
    )
  );

drop policy if exists "avatars: tenant write" on storage.objects;
create policy "avatars: tenant write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.storage_madrasa_id(name) = public.current_madrasa_id()
  );

drop policy if exists "avatars: replace own" on storage.objects;
create policy "avatars: replace own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.storage_madrasa_id(name) = public.current_madrasa_id()
  )
  with check (
    bucket_id = 'avatars'
    and public.storage_madrasa_id(name) = public.current_madrasa_id()
  );

-- --------------------------------------------------------------- documents
-- Receipts, report cards and certificates. Generated server-side only, so
-- there is no client INSERT policy at all.

drop policy if exists "documents: tenant read" on storage.objects;
create policy "documents: tenant read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_platform_admin()
      or public.storage_madrasa_id(name) = public.current_madrasa_id()
    )
  );

comment on function public.storage_madrasa_id is
  'Extracts the tenant id from a madrasa/{id}/... storage path, so object policies can scope by tenant without a join.';
