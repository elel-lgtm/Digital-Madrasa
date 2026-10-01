-- ============================================================================
-- Digital Madrasa — 0023: learning writes (submissions, certificates)
--
-- Three things the product showed but could not do:
--   * a student could see an assignment but not hand anything in;
--   * certificates had a table and a read policy, but no way to be issued;
--   * a certificate's code printed "verifiable" with nowhere to verify it.
--
-- Everything here keeps the house rules: the database decides who may write,
-- identifiers the client must not choose are chosen here, and consequential
-- writes are audited.
-- ============================================================================

-- ----------------------------------------------------------- submissions --

-- May the calling student hand in work for this assignment? Only for an
-- assignment of their own class, in their own madrasa, that still exists.
create or replace function public.can_submit_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.assignments a
      join public.students s on s.id = public.current_student_id()
     where a.id = p_assignment_id
       and a.deleted_at is null
       and a.madrasa_id = s.madrasa_id
       and a.class_id = s.class_id
       and public.madrasa_is_active(a.madrasa_id)
  )
$$;

revoke execute on function public.can_submit_assignment(uuid) from public;
grant execute on function public.can_submit_assignment(uuid) to authenticated;

-- The original policy checked only student_id, so a student could file a row
-- against another madrasa's id or an assignment of a class they are not in.
drop policy if exists "submissions: student inserts own" on public.submissions;
create policy "submissions: student inserts own"
  on public.submissions for insert
  with check (
    student_id = public.current_student_id()
    and madrasa_id = public.current_madrasa_id()
    and public.can_submit_assignment(assignment_id)
  );

-- A student may revise their own work until it is marked, and again if the
-- teacher returns it for another attempt.
drop policy if exists "submissions: student revises pending" on public.submissions;
create policy "submissions: student revises pending"
  on public.submissions for update
  using (
    student_id = public.current_student_id()
    and status in ('pending', 'returned')
    and deleted_at is null
  )
  with check (student_id = public.current_student_id() and status = 'pending');

-- Students write the answer; staff write the mark. Whatever a student sends,
-- the score and status stay theirs to leave alone, and the row cannot be
-- moved to another assignment, student or madrasa.
create or replace function public.guard_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.current_role_name() = 'student' then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.score := null;
      new.submitted_at := now();
    else
      -- A revision is a fresh hand-in: back to pending, awaiting a mark.
      new.status := 'pending';
      new.score := old.score;
      new.assignment_id := old.assignment_id;
      new.student_id := old.student_id;
      new.madrasa_id := old.madrasa_id;
      new.submitted_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    -- Staff grade; they do not rewrite what the student handed in.
    new.text_body := old.text_body;
    new.audio_url := old.audio_url;
    new.assignment_id := old.assignment_id;
    new.student_id := old.student_id;
    new.madrasa_id := old.madrasa_id;
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_submission on public.submissions;
create trigger trg_guard_submission
  before insert or update on public.submissions
  for each row execute function public.guard_submission();

drop trigger if exists trg_audit_submissions on public.submissions;
create trigger trg_audit_submissions
  after insert or update or delete on public.submissions
  for each row execute function public.write_audit();

-- ---------------------------------------------------------- certificates --

-- The verification code is what a third party types in to check a
-- certificate, so it must be unguessable and never chosen by the client.
-- Ten characters from an alphabet without 0/O/1/I, drawn from pgcrypto.
create or replace function public.generate_certificate_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := extensions.gen_random_bytes(10);
    code := '';
    for i in 0..9 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.certificates where verification_code = code);
  end loop;
  new.verification_code := code;
  new.issued_at := now();
  return new;
end
$$;

drop trigger if exists trg_certificate_code on public.certificates;
create trigger trg_certificate_code
  before insert on public.certificates
  for each row execute function public.generate_certificate_code();

-- The code is fixed once issued; a certificate is withdrawn by soft deletion.
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
  return new;
end
$$;

drop trigger if exists trg_freeze_certificate on public.certificates;
create trigger trg_freeze_certificate
  before update on public.certificates
  for each row execute function public.freeze_certificate();

drop policy if exists "certificates: staff issue" on public.certificates;
create policy "certificates: staff issue"
  on public.certificates for insert
  with check (
    public.current_role_name() = 'teacher'
    and public.can_access_madrasa(madrasa_id)
    and exists (
      select 1 from public.students s
       where s.id = student_id and s.madrasa_id = certificates.madrasa_id and s.deleted_at is null
    )
  );

-- Withdrawal is a soft delete. Done through a policy, the API's RETURNING
-- would have to show the withdrawn row, which the read policy (rightly)
-- hides, so every withdrawal failed. A narrow function does exactly one
-- thing instead, and there is no general update policy at all: staff cannot
-- edit a certificate after issue, only withdraw it.
drop policy if exists "certificates: staff withdraw" on public.certificates;

create or replace function public.withdraw_certificate(p_certificate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role_name() is distinct from 'teacher' then
    raise exception 'only staff can withdraw a certificate' using errcode = '42501';
  end if;
  update public.certificates c
     set deleted_at = now()
   where c.id = p_certificate_id
     and c.deleted_at is null
     and public.can_access_madrasa(c.madrasa_id);
  if not found then
    raise exception 'certificate not found' using errcode = 'P0002';
  end if;
end
$$;

revoke execute on function public.withdraw_certificate(uuid) from public;
grant execute on function public.withdraw_certificate(uuid) to authenticated;

drop trigger if exists trg_audit_certificates on public.certificates;
create trigger trg_audit_certificates
  after insert or update or delete on public.certificates
  for each row execute function public.write_audit();

-- Tell the student and every approved parent. Written here rather than in the
-- app so a certificate can never be issued silently.
create or replace function public.notify_certificate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, madrasa_id, type, title, body, payload, channel)
  select recipient, new.madrasa_id, 'certificate_issued',
         'Certificate awarded', new.title,
         jsonb_build_object('certificate_id', new.id, 'student_id', new.student_id),
         array['in_app', 'push']
    from (
      select s.profile_id as recipient from public.students s where s.id = new.student_id
      union
      select p.profile_id
        from public.parent_student_links l
        join public.parents p on p.id = l.parent_id
       where l.student_id = new.student_id and l.status = 'approved' and l.deleted_at is null
    ) r;
  return new;
end
$$;

drop trigger if exists trg_notify_certificate on public.certificates;
create trigger trg_notify_certificate
  after insert on public.certificates
  for each row execute function public.notify_certificate();

-- Public verification: anyone holding a code can confirm it is genuine,
-- without signing in and without learning anything else. Exactly one row or
-- none; the student's name is on the certificate itself, so returning it
-- discloses nothing the holder did not choose to show.
create or replace function public.verify_certificate(p_code text)
returns table (
  title text,
  kind text,
  student_name text,
  madrasa_name text,
  issued_at timestamptz,
  valid boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.title, c.kind, p.full_name, m.name, c.issued_at,
         (c.deleted_at is null and m.status = 'active') as valid
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
