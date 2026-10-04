-- 0033: what a parent hears on a feature phone (USSD, e.g. *384*123#).
--
-- Africa's Talking calls the `ussd` Edge Function with the number that
-- dialled. That function holds no user session, so it cannot read through
-- RLS as the parent would. This function bridges the gap without widening
-- anything:
--
--   1. it finds the one active parent registered with that number (two
--      accounts sharing a number get nothing: there is no telling whose
--      children to show);
--   2. it then acts as that parent for the rest of the transaction, and
--      each child is shown only if can_read_student() says so, the same rule
--      the app's screens and policies use. An unapproved or revoked link
--      shows nothing.
--
-- Only the service role may call it; the Edge Function checks a shared
-- secret before it does.
--
-- Re-runnable.

create or replace function public.ussd_children(p_phone text)
returns table (
  student_id     uuid,
  first_name     text,
  attended       int,
  sessions       int,
  memorised      int,
  learning_surah int,
  learning_ayah  int,
  balance        numeric,
  last_score     numeric,
  remark         text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone  text;
  v_parent uuid;
  v_count  int;
begin
  if length(v_digits) < 9 then
    return;
  end if;
  -- 0712…, 254712… and +254712… are all the same subscriber.
  v_phone := '+254' || right(v_digits, 9);

  select count(*), (array_agg(p.id))[1] into v_count, v_parent
    from public.profiles p
   where p.role = 'parent'
     and p.is_active
     and p.deleted_at is null
     and p.phone in (v_phone, substr(v_phone, 2));
  if v_count <> 1 then
    return;
  end if;

  -- From here on this transaction is that parent, so can_read_student()
  -- answers exactly as it does in the app.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parent::text, 'role', 'authenticated')::text, true);

  return query
  select s.id,
         split_part(pr.full_name, ' ', 1),
         (select count(*)::int from public.attendance a
           where a.student_id = s.id and a.deleted_at is null
             and a.session_date > current_date - 30 and a.status in ('present', 'late')),
         (select count(*)::int from public.attendance a
           where a.student_id = s.id and a.deleted_at is null
             and a.session_date > current_date - 30 and a.status <> 'excused'),
         (select count(*)::int from public.hifz_progress h
           where h.student_id = s.id and h.deleted_at is null
             and h.status in ('memorised', 'mastered', 'revising')),
         l.surah_no,
         l.ayah_no,
         (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i
           where i.student_id = s.id and i.deleted_at is null),
         f.score,
         f.remark
    from public.students s
    join public.profiles pr on pr.id = s.profile_id
    left join lateral (
      select h.surah_no, h.ayah_no from public.hifz_progress h
       where h.student_id = s.id and h.deleted_at is null and h.status = 'learning'
       order by h.updated_at desc limit 1
    ) l on true
    left join lateral (
      select coalesce((t.teacher_override ->> 'overallScore')::numeric, t.overall_score) as score,
             nullif(trim(t.teacher_override ->> 'remarks'), '') as remark
        from public.recitations r
        join public.tajweed_feedback t on t.recitation_id = r.id and t.deleted_at is null
       where r.student_id = s.id and r.deleted_at is null
         and (t.assessment = 'assessed' or t.teacher_override is not null)
       order by r.created_at desc limit 1
    ) f on true
   where s.deleted_at is null
     and public.can_read_student(s.id)
   order by pr.full_name;
end;
$$;

revoke execute on function public.ussd_children(text) from public, anon, authenticated;
grant execute on function public.ussd_children(text) to service_role;

comment on function public.ussd_children(text) is
  'USSD: the children the parent registered with this phone may see, via can_read_student(). Service role only.';
