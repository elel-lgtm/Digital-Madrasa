-- Ties the "only the owner manages staff" rule to the madrasa being managed.
--
-- The two policies in 0009 read:
--
--   exists (select 1 from public.teachers t
--            where t.profile_id = auth.uid() and t.is_owner
--              and t.madrasa_id = madrasa_id)
--
-- The intent is plainly "…and that owner row belongs to the same madrasa as
-- the row being written". But inside the subquery the unqualified `madrasa_id`
-- resolves to the subquery's own `t.madrasa_id`, not to the outer row, so the
-- condition is `t.madrasa_id = t.madrasa_id` — always true. Postgres prints
-- the policy back that way, which is how it was found. The clause therefore
-- asks only "is the caller an owner of *something*".
--
-- What that costs: `can_access_madrasa(madrasa_id)` still pins the row to the
-- caller's own `profiles.madrasa_id`, so a stranger cannot reach in. The gap
-- opens where one person belongs to two madrasas — `teachers` is unique on
-- (madrasa_id, profile_id) and so permits a profile to hold a row in several.
-- Somebody who owns madrasa A and is an ordinary teacher in madrasa B, with
-- their profile pointing at B, satisfies both halves for B's staff rows and
-- can add or alter staff in a madrasa they do not own. In a product whose
-- whole premise is many madrasas on one database, that is worth closing.
--
-- The fix is to say which `madrasa_id` is meant. `teachers.madrasa_id` is
-- unambiguous: it names the outer table, and the alias `t` covers the inner
-- one. The rule is otherwise unchanged — this neither widens nor narrows who
-- may manage staff in their own madrasa.

drop policy if exists "teachers: owner invites" on public.teachers;
create policy "teachers: owner invites" on public.teachers
  for insert with check (
    public.can_access_madrasa(madrasa_id)
    and exists (
      select 1 from public.teachers t
       where t.profile_id = auth.uid()
         and t.is_owner
         and t.deleted_at is null
         and t.madrasa_id = teachers.madrasa_id
    )
  );

drop policy if exists "teachers: owner updates" on public.teachers;
create policy "teachers: owner updates" on public.teachers
  for update using (
    public.can_access_madrasa(madrasa_id)
    and exists (
      select 1 from public.teachers t
       where t.profile_id = auth.uid()
         and t.is_owner
         and t.deleted_at is null
         and t.madrasa_id = teachers.madrasa_id
    )
  )
  with check (public.can_access_madrasa(madrasa_id));

comment on table public.teachers is
  'Madrasa staff. Insert and update are the owner''s alone, scoped to the '
  'madrasa the row belongs to; see migration 0022.';
