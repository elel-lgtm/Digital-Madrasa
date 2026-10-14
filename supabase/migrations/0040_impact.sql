-- 0040: the impact dashboard.
--
-- What ILMORA has done for learning, in totals only (never a name):
-- pupils, surahs memorised, attendance, assessed recitations, certificates,
-- fees paid (and how much by M-Pesa), pupils sponsored, live readings, and a
-- six-month trend.
--
--   platform admin   -> every madrasa
--   madrasa staff    -> their own madrasa
--   anyone else      -> refused
--
-- Re-runnable.

create or replace function public.impact_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_all boolean := public.is_platform_admin();
  v_ma uuid := public.current_madrasa_id();
begin
  if not v_all and (public.current_role_name() is distinct from 'teacher' or v_ma is null) then
    raise exception 'Only madrasa staff and the platform admin can see impact.' using errcode = '42501';
  end if;

  return (
    with scope as (
      select m.id from public.madrasas m
       where m.deleted_at is null and (v_all or m.id = v_ma)
    ),
    pupils as (
      select s.id from public.students s
       where s.deleted_at is null and s.enrollment_status = 'active' and s.madrasa_id in (select id from scope)
    ),
    memorised as (
      select h.student_id, h.updated_at from public.hifz_progress h
       where h.deleted_at is null and h.status in ('memorised', 'mastered', 'revising')
         and h.student_id in (select id from pupils)
    ),
    att as (
      select a.session_date, a.status from public.attendance a
       where a.deleted_at is null and a.madrasa_id in (select id from scope)
         and a.session_date > current_date - 190
    ),
    pay as (
      select p.amount, p.method, p.sponsored, p.settled_at from public.payments p
       where p.status = 'success' and p.madrasa_id in (select id from scope)
    ),
    months as (
      select date_trunc('month', current_date) - (n || ' month')::interval as m
        from generate_series(0, 5) n
    )
    select jsonb_build_object(
      'scope', case when v_all then 'platform' else 'madrasa' end,
      'madrasas', (select count(*) from scope),
      'pupils', (select count(*) from pupils),
      'teachers', (select count(*) from public.teachers t where t.status = 'active' and t.madrasa_id in (select id from scope)),
      'surahsMemorised', (select count(*) from memorised),
      'pupilsMemorising', (select count(distinct student_id) from memorised),
      'attendanceRate30d', (
        select case when count(*) filter (where status <> 'excused') = 0 then null
                    else round(100.0 * count(*) filter (where status in ('present', 'late'))
                               / count(*) filter (where status <> 'excused')) end
          from att where session_date > current_date - 30),
      'recitationsAssessed', (
        select count(*) from public.tajweed_feedback f
         where f.deleted_at is null and f.assessment = 'assessed' and f.madrasa_id in (select id from scope)),
      'certificates', (
        select count(*) from public.certificates c where c.madrasa_id in (select id from scope) and c.kind <> 'ijazah'),
      'ijazahs', (
        select count(*) from public.certificates c where c.madrasa_id in (select id from scope) and c.kind = 'ijazah'),
      'feesCollected', (select coalesce(sum(amount), 0) from pay),
      'feesViaMpesa', (select coalesce(sum(amount), 0) from pay where method = 'mpesa'),
      'paymentsCount', (select count(*) from pay),
      'sponsoredAmount', (select coalesce(sum(amount), 0) from pay where sponsored),
      'pupilsSponsored', (
        select count(distinct i.student_id)
          from public.payments p
          join public.payment_allocations al on al.payment_id = p.id
          join public.invoices i on i.id = al.invoice_id
         where p.status = 'success' and p.sponsored and p.madrasa_id in (select id from scope)),
      'liveSessions', (
        select count(*) from public.lessons l
         where l.deleted_at is null and l.scheduled_for is not null and l.scheduled_for < now()
           and l.madrasa_id in (select id from scope)),
      'halaqaReadings', (select count(*) from public.halaqa_readings r where r.madrasa_id in (select id from scope)),
      'messages', (select count(*) from public.messages x where x.deleted_at is null and x.madrasa_id in (select id from scope)),
      'monthly', (
        select jsonb_agg(jsonb_build_object(
                 'month', to_char(mo.m, 'YYYY-MM'),
                 'surahsMemorised', (select count(*) from memorised where date_trunc('month', updated_at) = mo.m),
                 'attendanceRate', (
                    select case when count(*) filter (where status <> 'excused') = 0 then null
                                else round(100.0 * count(*) filter (where status in ('present', 'late'))
                                           / count(*) filter (where status <> 'excused')) end
                      from att where date_trunc('month', session_date) = mo.m),
                 'feesCollected', (select coalesce(sum(amount), 0) from pay where date_trunc('month', settled_at) = mo.m)
               ) order by mo.m)
          from months mo),
      'generatedAt', now()
    )
  );
end;
$$;

revoke execute on function public.impact_summary() from public, anon;
grant execute on function public.impact_summary() to authenticated;
