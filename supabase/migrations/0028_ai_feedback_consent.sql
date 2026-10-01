-- 0028_ai_feedback_consent
--
-- Recitation audio is sent to an outside AI service (Gemini) for feedback.
-- The recordings are of children, so that now needs consent, and a result
-- that was not produced from the audio must say so instead of showing a
-- made-up score.
--
--   students.ai_feedback_consent   off until an approved parent, or the
--                                  madrasa recording paper consent, turns it
--                                  on. Who and when are stamped by the
--                                  database; the change is audited by the
--                                  existing students trigger.
--
--   tajweed_feedback.assessment    'assessed'       scored from the audio
--                                  'not_consented'  no consent, nothing sent
--                                  'unavailable'    the AI could not be reached
--                                  A score exists exactly when assessed. The
--                                  teacher reviews every kind the same way.

-- ------------------------------------------------------------------ consent

alter table public.students
  add column ai_feedback_consent    boolean not null default false,
  -- Deliberately not a foreign key: a second students -> profiles reference
  -- makes every unqualified students(profiles(...)) embed ambiguous to
  -- PostgREST, which broke issue-invoices' read-back when it was tried.
  add column ai_feedback_consent_by uuid,
  add column ai_feedback_consent_at timestamptz;

comment on column public.students.ai_feedback_consent is
  'Recitations may be sent to the AI service for feedback. Set by an approved parent or madrasa staff.';

-- The client can never choose who consented or when.
create or replace function public.stamp_ai_feedback_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.ai_feedback_consent is distinct from old.ai_feedback_consent then
    if new.ai_feedback_consent then
      new.ai_feedback_consent_by := auth.uid();
      new.ai_feedback_consent_at := now();
    else
      new.ai_feedback_consent_by := case when tg_op = 'INSERT' then null else auth.uid() end;
      new.ai_feedback_consent_at := case when tg_op = 'INSERT' then null else now() end;
    end if;
  else
    new.ai_feedback_consent_by := old.ai_feedback_consent_by;
    new.ai_feedback_consent_at := old.ai_feedback_consent_at;
  end if;
  return new;
end;
$$;

create trigger trg_students_ai_feedback_consent
  before insert or update on public.students
  for each row execute function public.stamp_ai_feedback_consent();

/**
 * Turns AI feedback on or off for one pupil.
 *
 * Allowed for a parent with an APPROVED link to the pupil, and for staff of
 * the pupil's madrasa (recording consent given on paper). Nobody else: not
 * the pupil, not a pending or rejected parent, not another madrasa.
 */
create or replace function public.set_ai_feedback_consent(p_student_id uuid, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_madrasa uuid;
begin
  select madrasa_id into v_madrasa
    from public.students
   where id = p_student_id and deleted_at is null;
  if v_madrasa is null then
    raise exception 'Student not found.' using errcode = 'P0002';
  end if;

  if not (
    (public.current_role_name() = 'teacher'
       and v_madrasa = public.current_madrasa_id()
       and public.madrasa_is_active(v_madrasa))
    or public.is_approved_child(p_student_id)
  ) then
    raise exception 'Only the pupil''s madrasa or an approved parent can change this.'
      using errcode = '42501';
  end if;

  update public.students set ai_feedback_consent = p_allowed where id = p_student_id;
end;
$$;

revoke execute on function public.set_ai_feedback_consent(uuid, boolean) from public, anon;
grant execute on function public.set_ai_feedback_consent(uuid, boolean) to authenticated;

-- ------------------------------------------------------------ assessment

alter table public.tajweed_feedback
  alter column overall_score drop not null,
  add column assessment text not null default 'assessed'
    check (assessment in ('assessed', 'not_consented', 'unavailable'));

-- Existing rows all carry a score and stay 'assessed'.
alter table public.tajweed_feedback
  add constraint tajweed_feedback_score_matches_assessment
  check ((assessment = 'assessed') = (overall_score is not null));

comment on column public.tajweed_feedback.assessment is
  'assessed: scored from the audio. not_consented / unavailable: no score; awaiting the teacher.';
