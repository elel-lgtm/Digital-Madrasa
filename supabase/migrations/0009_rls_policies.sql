-- ============================================================================
-- Digital Madrasa — 0009: Row Level Security
-- ============================================================================
-- RLS is the enforcement layer. Client-side `.eq('madrasa_id', ...)` filters
-- are an optimisation, never a boundary. Every table in `public` has RLS
-- enabled AND forced — a table without it is a production incident.
--
-- Policies are written per operation (select / insert / update / delete).
-- There is deliberately no blanket `for all` policy anywhere in this file.

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- ============================================================== madrasas ===

create policy "madrasas: read own or admin" on public.madrasas
  for select using (
    deleted_at is null
    and (public.is_platform_admin() or id = public.current_madrasa_id())
  );

-- Tenants are created by the signup Edge Function (service role), never by a
-- logged-in client, so there is no INSERT policy for `authenticated`.

create policy "madrasas: owner updates own" on public.madrasas
  for update using (
    owner_id = auth.uid() and status = 'active' and deleted_at is null
  )
  with check (
    owner_id = auth.uid()
    -- An owner may edit their details but never their own lifecycle state.
    and status = 'active'
    and deletion_scheduled_at is null
  );

create policy "madrasas: admin updates any" on public.madrasas
  for update using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ============================================================== profiles ===

create policy "profiles: read self, tenant peers or admin" on public.profiles
  for select using (
    deleted_at is null
    and (
      id = auth.uid()
      or public.is_platform_admin()
      or (madrasa_id is not null
          and madrasa_id = public.current_madrasa_id()
          and public.madrasa_is_active(madrasa_id))
    )
  );

-- The escalation guard. A user may edit their own name, phone, avatar and
-- locale — and nothing else. Role, tenant and the admin flag must come back
-- unchanged or the write is rejected.
create policy "profiles: users cannot escalate themselves" on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_platform_admin = (select p.is_platform_admin from public.profiles p where p.id = auth.uid())
    and role              = (select p.role              from public.profiles p where p.id = auth.uid())
    and madrasa_id is not distinct from
        (select p.madrasa_id from public.profiles p where p.id = auth.uid())
  );

create policy "profiles: admin updates any" on public.profiles
  for update using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ============================================================== teachers ===

create policy "teachers: tenant read" on public.teachers
  for select using (deleted_at is null and public.can_access_madrasa(madrasa_id));

create policy "teachers: owner invites" on public.teachers
  for insert with check (
    public.can_access_madrasa(madrasa_id)
    and exists (
      select 1 from public.teachers t
       where t.profile_id = auth.uid() and t.is_owner and t.madrasa_id = madrasa_id
    )
  );

create policy "teachers: owner updates" on public.teachers
  for update using (
    public.can_access_madrasa(madrasa_id)
    and exists (
      select 1 from public.teachers t
       where t.profile_id = auth.uid() and t.is_owner and t.madrasa_id = madrasa_id
    )
  )
  with check (public.can_access_madrasa(madrasa_id));

-- =============================================================== classes ===

create policy "classes: tenant read" on public.classes
  for select using (deleted_at is null and public.can_access_madrasa(madrasa_id));

create policy "classes: staff insert" on public.classes
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );

create policy "classes: staff update" on public.classes
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

-- ============================================================== students ===

create policy "students: scoped read" on public.students
  for select using (deleted_at is null and public.can_read_student(id));

-- Note the absence of admission_no from anything a client controls: it is set
-- by the BEFORE INSERT trigger and frozen by another.
create policy "students: staff insert" on public.students
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );

create policy "students: staff update" on public.students
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "enrollments: tenant read" on public.enrollments
  for select using (deleted_at is null and public.can_access_madrasa(madrasa_id));
create policy "enrollments: staff insert" on public.enrollments
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "enrollments: staff update" on public.enrollments
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

-- The counter table is never touched by a client: the trigger runs as
-- SECURITY DEFINER. No policy is granted, so every direct access is denied.

-- =============================================================== parents ===

create policy "parents: read self or tenant staff" on public.parents
  for select using (
    deleted_at is null
    and (
      profile_id = auth.uid()
      or public.is_platform_admin()
      or (madrasa_id is not null
          and madrasa_id = public.current_madrasa_id()
          and public.current_role_name() = 'teacher')
    )
  );

create policy "parents: create own row" on public.parents
  for insert with check (profile_id = auth.uid());

-- ------------------------------------------------- parent ↔ child links ---
-- A parent sees only their own requests. Link creation goes through a
-- rate-limited Edge Function so admission numbers cannot be enumerated, which
-- is why there is no INSERT policy for `authenticated` here.

create policy "links: parent reads own" on public.parent_student_links
  for select using (
    deleted_at is null
    and (
      parent_id = public.current_parent_id()
      or public.is_platform_admin()
      or (public.current_role_name() = 'teacher'
          and public.can_access_madrasa(madrasa_id))
    )
  );

create policy "links: staff decide" on public.parent_student_links
  for update using (
    public.current_role_name() = 'teacher' and public.can_access_madrasa(madrasa_id)
  )
  with check (public.can_access_madrasa(madrasa_id));

-- =============================================================== learning ==

create policy "lessons: tenant read" on public.lessons
  for select using (deleted_at is null and public.can_access_madrasa(madrasa_id));
create policy "lessons: staff insert" on public.lessons
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "lessons: staff update" on public.lessons
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "assignments: tenant read" on public.assignments
  for select using (deleted_at is null and public.can_access_madrasa(madrasa_id));
create policy "assignments: staff insert" on public.assignments
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "assignments: staff update" on public.assignments
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "submissions: scoped read" on public.submissions
  for select using (deleted_at is null and public.can_read_student(student_id));
create policy "submissions: student inserts own" on public.submissions
  for insert with check (student_id = public.current_student_id());
create policy "submissions: staff grade" on public.submissions
  for update using (
    public.current_role_name() = 'teacher' and public.can_access_madrasa(madrasa_id)
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "hifz: scoped read" on public.hifz_progress
  for select using (deleted_at is null and public.can_read_student(student_id));
create policy "hifz: staff insert" on public.hifz_progress
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "hifz: staff update" on public.hifz_progress
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "attendance: scoped read" on public.attendance
  for select using (deleted_at is null and public.can_read_student(student_id));
create policy "attendance: staff insert" on public.attendance
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "attendance: staff update" on public.attendance
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

-- Students and parents can read grades. Neither can write one: there is no
-- INSERT or UPDATE policy for them, so a student cannot edit their own mark.
create policy "grades: scoped read" on public.grades
  for select using (deleted_at is null and public.can_read_student(student_id));
create policy "grades: staff insert" on public.grades
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "grades: staff update" on public.grades
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

-- ============================================================ recitations ==

create policy "recitations: scoped read" on public.recitations
  for select using (deleted_at is null and public.can_read_student(student_id));
create policy "recitations: student inserts own" on public.recitations
  for insert with check (
    student_id = public.current_student_id() and public.can_access_madrasa(madrasa_id)
  );

create policy "tajweed: scoped read" on public.tajweed_feedback
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.recitations r
       where r.id = recitation_id and public.can_read_student(r.student_id)
    )
  );
-- Feedback rows are written by the evaluation Edge Function (service role).
-- Teachers may only add their override on top.
create policy "tajweed: staff override" on public.tajweed_feedback
  for update using (
    public.current_role_name() = 'teacher' and public.can_access_madrasa(madrasa_id)
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "certificates: scoped read" on public.certificates
  for select using (deleted_at is null and public.can_read_student(student_id));

-- =================================================================== fees ==

create policy "fee_structures: tenant read" on public.fee_structures
  for select using (deleted_at is null and public.can_access_madrasa(madrasa_id));
create policy "fee_structures: staff insert" on public.fee_structures
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "fee_structures: staff update" on public.fee_structures
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "invoices: scoped read" on public.invoices
  for select using (deleted_at is null and public.can_read_student(student_id));
create policy "invoices: staff insert" on public.invoices
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
-- Amounts change only through apply_payment(), which the callback function
-- calls as SECURITY DEFINER. Staff may still void or annotate an invoice.
create policy "invoices: staff update" on public.invoices
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

-- Money never changes state from a client. Payments are readable only.
create policy "payments: scoped read" on public.payments
  for select using (
    public.is_platform_admin()
    or (public.current_role_name() = 'teacher' and public.can_access_madrasa(madrasa_id))
    or parent_id = public.current_parent_id()
  );

create policy "allocations: scoped read" on public.payment_allocations
  for select using (
    public.can_access_madrasa(madrasa_id)
    or exists (
      select 1 from public.payments p
       where p.id = payment_id and p.parent_id = public.current_parent_id()
    )
  );

create policy "receipts: scoped read" on public.receipts
  for select using (
    public.can_access_madrasa(madrasa_id)
    or exists (
      select 1 from public.payments p
       where p.id = payment_id and p.parent_id = public.current_parent_id()
    )
  );

-- ========================================================== communication ==

create policy "threads: participants read" on public.message_threads
  for select using (
    deleted_at is null
    and (participant_a = auth.uid() or participant_b = auth.uid())
  );
create policy "threads: participants create" on public.message_threads
  for insert with check (
    (participant_a = auth.uid() or participant_b = auth.uid())
    and public.can_access_madrasa(madrasa_id)
  );
create policy "threads: participants update" on public.message_threads
  for update using (participant_a = auth.uid() or participant_b = auth.uid())
  with check (participant_a = auth.uid() or participant_b = auth.uid());

create policy "messages: participants read" on public.messages
  for select using (
    deleted_at is null and (sender_id = auth.uid() or recipient_id = auth.uid())
  );
create policy "messages: sender inserts" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.can_access_madrasa(madrasa_id)
  );
-- Only to stamp read_at on a message addressed to you.
create policy "messages: recipient marks read" on public.messages
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy "announcements: audience read" on public.announcements
  for select using (
    deleted_at is null
    and public.can_access_madrasa(madrasa_id)
    and publish_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      public.current_role_name()::text || 's' = any (audience)
      or (public.current_role_name() = 'teacher' and 'teachers' = any (audience))
    )
  );
create policy "announcements: staff insert" on public.announcements
  for insert with check (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  );
create policy "announcements: staff update" on public.announcements
  for update using (
    public.can_access_madrasa(madrasa_id) and public.current_role_name() = 'teacher'
  )
  with check (public.can_access_madrasa(madrasa_id));

create policy "notifications: own read" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications: own mark read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notification_prefs: own read" on public.notification_preferences
  for select using (user_id = auth.uid());
create policy "notification_prefs: own insert" on public.notification_preferences
  for insert with check (user_id = auth.uid());
create policy "notification_prefs: own update" on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "feature_flags: tenant read" on public.feature_flags
  for select using (public.can_access_madrasa(madrasa_id));

-- mail_outbox and rate_limits are service-role only. No policies are created
-- for them, so every request from `authenticated` is denied by default.

-- ============================================================== audit log ==
-- Readable by the tenant's staff and the platform admin. Append-only: there
-- is no INSERT policy (the trigger runs as SECURITY DEFINER), and no UPDATE
-- or DELETE policy exists for anyone at all.

create policy "audit: staff and admin read" on public.audit_log
  for select using (
    public.is_platform_admin()
    or (public.current_role_name() = 'teacher'
        and madrasa_id = public.current_madrasa_id())
  );
