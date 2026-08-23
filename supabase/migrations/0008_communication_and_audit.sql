-- ============================================================================
-- Digital Madrasa — 0008: messaging, mail outbox, notifications, audit log
-- ============================================================================

create table public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  madrasa_id      uuid not null references public.madrasas (id) on delete cascade,
  student_id      uuid references public.students (id) on delete set null,
  participant_a   uuid not null references public.profiles (id) on delete cascade,
  participant_b   uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  madrasa_id     uuid not null references public.madrasas (id) on delete cascade,
  thread_id      uuid not null references public.message_threads (id) on delete cascade,
  sender_id      uuid not null references public.profiles (id) on delete cascade,
  recipient_id   uuid not null references public.profiles (id) on delete cascade,
  -- HTML is stripped before insert by the shared Zod schema and again here.
  body           text not null check (length(btrim(body)) between 1 and 2000),
  attachment_url text,
  read_at        timestamptz,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  madrasa_id uuid not null references public.madrasas (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null,
  audience   text[] not null check (audience <@ array['students','parents','teachers']),
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  madrasa_id uuid references public.madrasas (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  payload    jsonb not null default '{}'::jsonb,
  channel    text[] not null default array['in_app'],
  read_at    timestamptz,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  -- {fees: {push, email, sms}, attendance: {...}, ...}. In-app is always on
  -- and deliberately has no switch.
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Durable queue for transactional mail. Nothing is fire-and-forget: every
-- send is a row, with attempts and the provider's error kept for retry.
create table public.mail_outbox (
  id           uuid primary key default gen_random_uuid(),
  madrasa_id   uuid references public.madrasas (id) on delete cascade,
  to_email     text not null,
  template     text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       public.mail_status not null default 'queued',
  attempts     int not null default 0,
  provider_id  text,
  error        text,
  scheduled_at timestamptz not null default now(),
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------ audit log ----
-- Append-only. No UPDATE or DELETE policy exists for anyone, including the
-- platform admin. Retained beyond tenant purge, in anonymised form.

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_role  public.user_role,
  madrasa_id  uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create table public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 1,
  unique (key, window_start)
);

create table public.feature_flags (
  madrasa_id     uuid primary key references public.madrasas (id) on delete cascade,
  ai_evaluation  boolean not null default true,
  payments       boolean not null default true,
  leaderboard    boolean not null default false,
  offline_mode   boolean not null default true,
  sms_fallback   boolean not null default true,
  updated_at     timestamptz not null default now()
);

create index threads_madrasa_idx   on public.message_threads (madrasa_id, last_message_at desc);
create index threads_a_idx         on public.message_threads (participant_a);
create index threads_b_idx         on public.message_threads (participant_b);
create index messages_thread_idx   on public.messages (thread_id, created_at);
create index messages_recipient_idx on public.messages (recipient_id) where read_at is null;
create index announcements_madrasa_idx on public.announcements (madrasa_id, publish_at desc)
  where deleted_at is null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index mail_outbox_status_idx on public.mail_outbox (status, scheduled_at)
  where status in ('queued', 'failed');
create index audit_madrasa_idx      on public.audit_log (madrasa_id, created_at desc);
create index audit_actor_idx        on public.audit_log (actor_id, created_at desc);
create index audit_entity_idx       on public.audit_log (entity_type, entity_id);
create index rate_limits_key_idx    on public.rate_limits (key, window_start desc);

create trigger trg_announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- audit triggers ----

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_madrasa uuid;
  v_row     jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_madrasa := nullif(v_row ->> 'madrasa_id', '')::uuid;

  insert into public.audit_log (
    actor_id, actor_role, madrasa_id, action, entity_type, entity_id, before, after
  )
  values (
    auth.uid(),
    public.current_role_name(),
    v_madrasa,
    lower(tg_table_name || '.' || tg_op),
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.write_audit();
create trigger trg_audit_madrasas
  after insert or update or delete on public.madrasas
  for each row execute function public.write_audit();
create trigger trg_audit_students
  after insert or update or delete on public.students
  for each row execute function public.write_audit();
create trigger trg_audit_teachers
  after insert or update or delete on public.teachers
  for each row execute function public.write_audit();
create trigger trg_audit_grades
  after insert or update or delete on public.grades
  for each row execute function public.write_audit();
create trigger trg_audit_invoices
  after insert or update or delete on public.invoices
  for each row execute function public.write_audit();
create trigger trg_audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.write_audit();
create trigger trg_audit_links
  after insert or update or delete on public.parent_student_links
  for each row execute function public.write_audit();
