-- 0034: Sponsor a Student (sadaqah towards a pupil's fees).
--
-- A teacher may open a pupil to sponsorship, and only after confirming that
-- the guardian agreed. Sponsors, who are signed-in users with a parent
-- account, see an anonymous card: madrasa, town, class, how much is memorised
-- and what is owed. They never see a name, photo or admission number. A
-- sponsorship pays the pupil's oldest open invoice through the ordinary
-- payment path (payments Edge Function, settle_fee_payment), so money is
-- applied exactly as when a parent pays.
--
-- Re-runnable.

alter table public.students
  add column if not exists sponsorship_open      boolean not null default false,
  add column if not exists sponsorship_note      text,
  add column if not exists sponsorship_agreed_by uuid,
  add column if not exists sponsorship_agreed_at timestamptz;

-- No foreign key on sponsorship_agreed_by, as with ai_feedback_consent_by
-- (0028): a second students -> profiles key makes every unqualified
-- `students(profiles(...))` embed ambiguous, and PostgREST answers those
-- with an error instead of rows.
alter table public.students drop constraint if exists students_sponsorship_agreed_by_fkey;

alter table public.students drop constraint if exists students_sponsorship_note_len;
alter table public.students add constraint students_sponsorship_note_len
  check (sponsorship_note is null or char_length(sponsorship_note) <= 200);

-- No pupil is ever listed without a recorded guardian agreement, however the
-- row was written.
alter table public.students drop constraint if exists students_sponsorship_agreed;
alter table public.students add constraint students_sponsorship_agreed
  check (not sponsorship_open or sponsorship_agreed_at is not null);

alter table public.payments
  add column if not exists sponsored boolean not null default false;

-- ------------------------------------------------------------ teacher side

create or replace function public.set_sponsorship(
  p_student_id uuid, p_open boolean, p_note text, p_guardian_agreed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role_name() is distinct from 'teacher' or not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.deleted_at is null
       and s.madrasa_id = public.current_madrasa_id()
  ) then
    raise exception 'Only this pupil''s madrasa can do that.' using errcode = '42501';
  end if;
  if p_open and not coalesce(p_guardian_agreed, false) then
    raise exception 'The guardian must agree before a pupil is listed.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 200 then
    raise exception 'Keep the note under 200 characters.' using errcode = '22023';
  end if;

  update public.students
     set sponsorship_open = p_open,
         sponsorship_note = case when p_open then nullif(trim(p_note), '') end,
         sponsorship_agreed_by = case when p_open then auth.uid() end,
         sponsorship_agreed_at = case when p_open then now() end,
         updated_at = now()
   where id = p_student_id;
end;
$$;

revoke execute on function public.set_sponsorship(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.set_sponsorship(uuid, boolean, text, boolean) to authenticated;

-- ------------------------------------------------------------ sponsor side

create or replace function public.sponsorable_students()
returns table (
  student_id   uuid,
  madrasa_name text,
  town         text,
  class_name   text,
  gender       text,
  memorised    int,
  needed       numeric,
  invoice_id   uuid,
  invoice_owed numeric,
  note         text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         m.name,
         m.town,
         c.name,
         s.gender,
         (select count(*)::int from public.hifz_progress h
           where h.student_id = s.id and h.deleted_at is null
             and h.status in ('memorised', 'mastered', 'revising')),
         o.needed,
         o.first_id,
         o.first_owed,
         s.sponsorship_note
    from public.students s
    join public.madrasas m on m.id = s.madrasa_id and m.status = 'active' and m.deleted_at is null
    left join public.classes c on c.id = s.class_id
    cross join lateral (
      select sum(i.amount_due - i.amount_paid) as needed,
             (array_agg(i.id order by i.due_date, i.created_at))[1] as first_id,
             (array_agg(i.amount_due - i.amount_paid order by i.due_date, i.created_at))[1] as first_owed
        from public.invoices i
       where i.student_id = s.id and i.deleted_at is null
         and i.status in ('issued', 'partially_paid', 'overdue')
         and i.amount_due > i.amount_paid
    ) o
   where auth.uid() is not null
     and s.sponsorship_open
     and s.deleted_at is null
     and s.enrollment_status = 'active'
     and o.needed > 0
   order by o.needed desc, s.id;
$$;

revoke execute on function public.sponsorable_students() from public, anon;
grant execute on function public.sponsorable_students() to authenticated;

comment on function public.sponsorable_students() is
  'Pupils open to sponsorship, anonymised: no name, photo or admission number.';

-- ------------------------------------------------------- the family is told

-- When a sponsorship settles, the pupil's approved parents hear about it
-- (without being told who gave).
create or replace function public.notify_sponsored_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sponsored and new.status = 'success' and old.status is distinct from 'success' then
    insert into public.notifications (user_id, madrasa_id, type, title, body, payload, channel)
    select distinct pa.profile_id, new.madrasa_id, 'payment_receipt',
           'A sponsor paid towards fees',
           format('A sponsor paid KES %s towards %s''s fees. May Allah reward them.',
                  to_char(al.amount, 'FM999,999,990'), split_part(pr.full_name, ' ', 1)),
           jsonb_build_object('payment_id', new.id, 'sponsored', true),
           array['in_app', 'push']
      from public.payment_allocations al
      join public.invoices i on i.id = al.invoice_id
      join public.students s on s.id = i.student_id
      join public.profiles pr on pr.id = s.profile_id
      join public.parent_student_links l on l.student_id = s.id and l.status = 'approved' and l.deleted_at is null
      join public.parents pa on pa.id = l.parent_id
     where al.payment_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_notify_sponsored_family on public.payments;
create trigger payments_notify_sponsored_family
  after update of status on public.payments
  for each row execute function public.notify_sponsored_family();
