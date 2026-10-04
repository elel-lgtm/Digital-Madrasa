-- 0031: the tajweed mistake map.
--
-- Every assessed recitation stores its findings as
-- [{surahNo, ayahNo, wordIndex, rule, severity, note}]. A teacher wants the
-- other view: across the whole madrasa, which ayahs and which rules trip
-- pupils up most, so the next lesson can be aimed at them.
--
-- The function is SECURITY INVOKER: it reads through the same row-level
-- policies as everything else, so it can never show a teacher a recitation
-- they could not already open. It adds only a role check and the madrasa
-- filter, and leaves out:
--   * recitations that were not assessed (no consent, model unavailable),
--   * findings the teacher dismissed when reviewing,
--   * deleted recordings.
--
-- Re-runnable.

create or replace function public.tajweed_heatmap(p_days int default 90)
returns table (surah_no int, ayah_no int, rule text, mistakes int, students int)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if public.current_role_name() is distinct from 'teacher'
     and public.current_role_name() is distinct from 'admin' then
    raise exception 'Only madrasa staff can see the mistake map.' using errcode = '42501';
  end if;

  return query
  select (e.value ->> 'surahNo')::int,
         (e.value ->> 'ayahNo')::int,
         e.value ->> 'rule',
         count(*)::int,
         count(distinct r.student_id)::int
    from public.tajweed_feedback f
    join public.recitations r on r.id = f.recitation_id and r.deleted_at is null
    cross join lateral jsonb_array_elements(f.errors) with ordinality as e(value, idx)
   where f.deleted_at is null
     and f.assessment = 'assessed'
     and r.madrasa_id = public.current_madrasa_id()
     and f.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 3650)))
     -- dismissedErrorIndexes counts from 0; ordinality from 1.
     and not (coalesce(f.teacher_override -> 'dismissedErrorIndexes', '[]'::jsonb) @> to_jsonb(e.idx - 1))
     and (e.value ->> 'surahNo') ~ '^[0-9]{1,3}$'
     and (e.value ->> 'ayahNo') ~ '^[0-9]{1,3}$'
   group by 1, 2, 3;
end;
$$;

revoke execute on function public.tajweed_heatmap(int) from public, anon;
grant execute on function public.tajweed_heatmap(int) to authenticated;

comment on function public.tajweed_heatmap(int) is
  'Tajweed findings per ayah and rule across the caller''s madrasa, read through RLS. Staff only.';
