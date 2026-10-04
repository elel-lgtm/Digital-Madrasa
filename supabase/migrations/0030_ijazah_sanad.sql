-- 0030_ijazah_sanad
--
-- An ijazah is the licence a teacher gives a student to recite and teach,
-- and its worth is its sanad: the unbroken chain of teachers back towards
-- the Prophet (peace be upon him). This records that chain.
--
--   teachers.sanad        the teacher's own chain: the sheikh who gave them
--                         ijazah first, then that sheikh's sheikh, and so on.
--                         Set only by the teacher, through set_my_sanad.
--
--   certificates.sanad    on an ijazah, a snapshot taken by the database at
--                         issue: the awarding teacher, then their chain. A
--                         later edit to the teacher's chain does not rewrite
--                         certificates already issued, and the client cannot
--                         supply a chain of its own.

alter table public.teachers
  add column sanad text[] not null default '{}';

alter table public.certificates
  add column sanad text[];

alter table public.certificates
  drop constraint if exists certificates_kind_check;
alter table public.certificates
  add constraint certificates_kind_check
  check (kind in ('juz_completion', 'quran_completion', 'tajweed_level', 'ijazah'));

/**
 * A teacher records their own chain. Names are trimmed, blanks dropped, and
 * the chain kept to a sane size; no one else can write it.
 */
create or replace function public.set_my_sanad(p_chain text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text[];
begin
  select coalesce(array_agg(btrim(n) order by i), '{}')
    into v_clean
    from unnest(coalesce(p_chain, '{}')) with ordinality as t(n, i)
   where btrim(n) <> '';

  if cardinality(v_clean) > 40 then
    raise exception 'A chain can list at most 40 teachers.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_clean) n where length(n) > 120) then
    raise exception 'Each name must be at most 120 characters.' using errcode = '22023';
  end if;

  update public.teachers
     set sanad = v_clean
   where profile_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'Only a teacher can record a chain of transmission.' using errcode = '42501';
  end if;
  return v_clean;
end;
$$;

revoke execute on function public.set_my_sanad(text[]) from public, anon;
grant execute on function public.set_my_sanad(text[]) to authenticated;

/** On an ijazah, the database writes the chain; on anything else, none. */
create or replace function public.snapshot_certificate_sanad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_chain text[];
begin
  if new.kind <> 'ijazah' then
    new.sanad := null;
    return new;
  end if;

  select p.full_name, t.sanad into v_name, v_chain
    from public.teachers t
    join public.profiles p on p.id = t.profile_id
   where t.profile_id = auth.uid()
     and t.madrasa_id = new.madrasa_id
     and t.deleted_at is null;

  if v_name is not null then
    new.sanad := array[v_name] || coalesce(v_chain, '{}');
  elsif auth.uid() is not null then
    -- A signed-in non-teacher cannot reach this (the insert policy is staff
    -- only), but never let a client-supplied chain through.
    new.sanad := null;
  end if;
  return new;
end;
$$;

create trigger trg_certificate_sanad
  before insert on public.certificates
  for each row execute function public.snapshot_certificate_sanad();

-- Freeze the chain with the rest of the certificate.
create or replace function public.freeze_certificate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.verification_code := old.verification_code;
  new.issued_at := old.issued_at;
  new.student_id := old.student_id;
  new.madrasa_id := old.madrasa_id;
  new.kind := old.kind;
  new.sanad := old.sanad;
  return new;
end
$$;

-- The public check also shows an ijazah's chain. A new output column means
-- the function is dropped and created again.
drop function if exists public.verify_certificate(text);
create function public.verify_certificate(p_code text)
returns table (
  title text,
  kind text,
  student_name text,
  madrasa_name text,
  issued_at timestamptz,
  valid boolean,
  sanad text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.title, c.kind, p.full_name, m.name, c.issued_at,
         (c.deleted_at is null and m.status = 'active') as valid,
         array_to_string(c.sanad, E'\n')
    from public.certificates c
    join public.students s on s.id = c.student_id
    join public.profiles p on p.id = s.profile_id
    join public.madrasas m on m.id = c.madrasa_id
   where c.verification_code = upper(btrim(p_code))
     and length(btrim(p_code)) = 10
   limit 1
$$;

revoke execute on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
