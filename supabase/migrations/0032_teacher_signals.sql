-- 0032: the signals behind the teacher's weekly insights.
--
-- One row per active pupil in the caller's madrasa with the few numbers a
-- teacher would otherwise have to dig for: attendance this fortnight against
-- the one before, the surah being learned and when it last moved, revision
-- that is overdue, and recitation scores now against earlier. Turning these
-- into "Amina has not moved past Al-Mulk 12 in three weeks" is done in the
-- app (packages/shared/src/insights.ts), so the wording can be translated
-- and the rules are unit-tested.
--
-- SECURITY INVOKER: everything is read through the existing row-level
-- policies, so no teacher learns anything they could not already open.
--
-- Re-runnable.

create or replace function public.teacher_signals()
returns table (
  student_id         uuid,
  full_name          text,
  class_name         text,
  present_recent     int,
  sessions_recent    int,
  present_prev       int,
  sessions_prev      int,
  learning_surah     int,
  learning_ayah      int,
  learning_moved_at  timestamptz,
  overdue_reviews    int,
  memorised_week     int,
  last_recitation_at timestamptz,
  score_recent       numeric,
  score_prev         numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if public.current_role_name() is distinct from 'teacher'
     and public.current_role_name() is distinct from 'admin' then
    raise exception 'Only madrasa staff can see class insights.' using errcode = '42501';
  end if;

  return query
  with pupils as (
    select s.id, p.full_name, c.name as class_name
      from public.students s
      join public.profiles p on p.id = s.profile_id
      left join public.classes c on c.id = s.class_id
     where s.deleted_at is null
       and s.enrollment_status = 'active'
       and s.madrasa_id = public.current_madrasa_id()
  ),
  att as (
    select a.student_id,
           count(*) filter (where a.session_date > current_date - 14 and a.status in ('present', 'late'))::int as present_recent,
           count(*) filter (where a.session_date > current_date - 14 and a.status <> 'excused')::int as sessions_recent,
           count(*) filter (where a.session_date <= current_date - 14 and a.status in ('present', 'late'))::int as present_prev,
           count(*) filter (where a.session_date <= current_date - 14 and a.status <> 'excused')::int as sessions_prev
      from public.attendance a
     where a.deleted_at is null and a.session_date > current_date - 28
     group by a.student_id
  ),
  hifz as (
    select h.student_id,
           (array_agg(h.surah_no order by h.updated_at desc) filter (where h.status = 'learning'))[1] as learning_surah,
           (array_agg(h.ayah_no order by h.updated_at desc) filter (where h.status = 'learning'))[1] as learning_ayah,
           max(h.updated_at) filter (where h.status = 'learning') as learning_moved_at,
           count(*) filter (where h.status in ('memorised', 'mastered') and h.next_review_at < now() - interval '3 days')::int as overdue_reviews,
           count(*) filter (where h.status in ('memorised', 'mastered') and h.updated_at > now() - interval '7 days')::int as memorised_week
      from public.hifz_progress h
     where h.deleted_at is null
     group by h.student_id
  ),
  rec as (
    select r.student_id,
           max(r.created_at) as last_recitation_at,
           avg(coalesce((f.teacher_override ->> 'overallScore')::numeric, f.overall_score))
             filter (where r.created_at > now() - interval '14 days') as score_recent,
           avg(coalesce((f.teacher_override ->> 'overallScore')::numeric, f.overall_score))
             filter (where r.created_at <= now() - interval '14 days' and r.created_at > now() - interval '42 days') as score_prev
      from public.recitations r
      left join public.tajweed_feedback f
        on f.recitation_id = r.id and f.deleted_at is null and f.assessment = 'assessed'
     where r.deleted_at is null
     group by r.student_id
  )
  select p.id, p.full_name, p.class_name,
         coalesce(att.present_recent, 0), coalesce(att.sessions_recent, 0),
         coalesce(att.present_prev, 0), coalesce(att.sessions_prev, 0),
         hifz.learning_surah, hifz.learning_ayah, hifz.learning_moved_at,
         coalesce(hifz.overdue_reviews, 0), coalesce(hifz.memorised_week, 0),
         rec.last_recitation_at, round(rec.score_recent, 1), round(rec.score_prev, 1)
    from pupils p
    left join att on att.student_id = p.id
    left join hifz on hifz.student_id = p.id
    left join rec on rec.student_id = p.id;
end;
$$;

revoke execute on function public.teacher_signals() from public, anon;
grant execute on function public.teacher_signals() to authenticated;

comment on function public.teacher_signals() is
  'Per-pupil attendance, memorisation and recitation signals for the caller''s madrasa, read through RLS. Staff only.';
