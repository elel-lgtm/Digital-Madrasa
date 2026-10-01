-- 0027_rls_set_based_reads.sql
--
-- The same read rule, evaluated once per query instead of once per row.
--
-- Every child-scoped table was guarded by `can_read_student(student_id)` in
-- its SELECT policy. That function is SECURITY DEFINER, which Postgres cannot
-- inline, so it ran for every row of the table — each call several index
-- lookups — before the row could be filtered out. A parent with three
-- children paid for every attendance row on the platform. `npm run perf:db`
-- found it: 28 ms for a parent's memorisation list on the seed, and a
-- statement timeout for a parent's attendance once a single school reached
-- 2,000 pupils.
--
-- `readable_student_ids()` returns, once per statement, exactly the set of
-- students for which `can_read_student()` is true, and the policies test
-- membership in that set: `student_id in (select readable_student_ids())`.
-- The planner evaluates the uncorrelated subquery once and hashes it.
--
-- Nothing about who may read what changes. `can_read_student()` is left as
-- it is and remains the rule of record — the storage policy for recording
-- files still calls it per object. The new function mirrors it branch for
-- branch, and supabase/tests/verify_rls_equivalence.sql fails if the two ever
-- disagree for any kind of caller. Change them together.
--
-- Re-runnable.

create or replace function public.readable_student_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    public.user_role := public.current_role_name();
  v_madrasa uuid;
begin
  -- Same branches, same order, same fall-through as can_read_student().
  if v_role = 'parent' then
    -- Parent: approved children (is_approved_child), wherever they study.
    return query select c from public.approved_child_ids() c;
  elsif v_role = 'student' then
    return query select s from public.current_student_id() s where s is not null;
  elsif v_role = 'teacher' then
    -- Teacher: every student of their madrasa, while it is active.
    v_madrasa := public.current_madrasa_id();
    if v_madrasa is not null and public.madrasa_is_active(v_madrasa) then
      return query select s.id from public.students s where s.madrasa_id = v_madrasa;
    end if;
  elsif public.is_platform_admin() then
    -- Anything else (no role, 'admin'): the platform admin sees everyone.
    return query select s.id from public.students s;
  end if;
end;
$$;

revoke execute on function public.readable_student_ids() from public;
grant execute on function public.readable_student_ids() to authenticated;

comment on function public.readable_student_ids() is
  'The set of students can_read_student() allows, computed once per statement for RLS. '
  'Must mirror can_read_student(); verify_rls_equivalence.sql enforces it.';
comment on function public.can_read_student(uuid) is
  'The rule of record for reading a child''s data. readable_student_ids() is its set-valued '
  'twin used by the table policies; change both together.';

-- ------------------------------------------------------------------ policies
-- Each keeps its name and every other condition; only the can_read_student()
-- term becomes a set membership test.

drop policy if exists "attendance: scoped read" on public.attendance;
create policy "attendance: scoped read" on public.attendance
  for select using (deleted_at is null and student_id in (select public.readable_student_ids()));

drop policy if exists "certificates: scoped read" on public.certificates;
create policy "certificates: scoped read" on public.certificates
  for select using (deleted_at is null and student_id in (select public.readable_student_ids()));

drop policy if exists "grades: scoped read" on public.grades;
create policy "grades: scoped read" on public.grades
  for select using (deleted_at is null and student_id in (select public.readable_student_ids()));

drop policy if exists "hifz: scoped read" on public.hifz_progress;
create policy "hifz: scoped read" on public.hifz_progress
  for select using (deleted_at is null and student_id in (select public.readable_student_ids()));

drop policy if exists "invoices: scoped read" on public.invoices;
create policy "invoices: scoped read" on public.invoices
  for select using (deleted_at is null and student_id in (select public.readable_student_ids()));

drop policy if exists "recitations: scoped read" on public.recitations;
create policy "recitations: scoped read" on public.recitations
  for select using (deleted_at is null and student_id in (select public.readable_student_ids()));

drop policy if exists "students: scoped read" on public.students;
create policy "students: scoped read" on public.students
  for select using (deleted_at is null and id in (select public.readable_student_ids()));

drop policy if exists "submissions: scoped read" on public.submissions;
create policy "submissions: scoped read" on public.submissions
  for select using (deleted_at is null and student_id in (select public.readable_student_ids()));

drop policy if exists "tajweed: scoped read" on public.tajweed_feedback;
create policy "tajweed: scoped read" on public.tajweed_feedback
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.recitations r
       where r.id = tajweed_feedback.recitation_id
         and r.student_id in (select public.readable_student_ids())
    )
  );
