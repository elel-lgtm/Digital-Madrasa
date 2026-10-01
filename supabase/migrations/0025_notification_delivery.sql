-- 0025_notification_delivery.sql
--
-- Getting notifications off the database and onto phones and into inboxes.
--
-- Until now a notification was only a row: the app showed it in the inbox,
-- but its `channel` list ('push', 'email', 'sms') was a wish nobody acted on.
-- This migration adds what delivery needs; the `dispatch-notifications` Edge
-- Function does the sending.
--
--   push_tokens        a device's Expo push token, managed only through
--                      register_push_token / unregister_push_token
--   sms_outbox         the SMS twin of mail_outbox (0008): one row per send,
--                      with attempts and the provider's error, retried
--   claim_*            hand out work with FOR UPDATE SKIP LOCKED, so the
--                      trigger and the sweep can never send the same thing
--                      twice
--   dispatch kick      a statement trigger on notifications asks pg_net to
--                      call the dispatcher; pg_cron sweeps every 5 minutes
--                      for retries and anything the kick missed
--
-- It also closes two gaps where nothing was notified at all: publishing an
-- announcement, and receiving a direct message.
--
-- The dispatcher's URL and shared key are read from Vault
-- (`project_url`, `dispatch_secret`). They are set out of band and are not
-- in this file. Until they exist the kick does nothing, harmlessly.
--
-- Re-runnable.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- --------------------------------------------------------------- push tokens

create table if not exists public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  token           text not null unique
                  check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$'),
  platform        text not null check (platform in ('android', 'ios')),
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  -- Set when Expo reports the device gone (uninstalled, token rotated).
  disabled_at     timestamptz,
  disabled_reason text
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id)
  where disabled_at is null;

alter table public.push_tokens enable row level security;
alter table public.push_tokens force row level security;

drop policy if exists "push_tokens: own read" on public.push_tokens;
create policy "push_tokens: own read" on public.push_tokens
  for select using (user_id = auth.uid());
-- No insert/update/delete policies: the two functions below are the only way
-- in, so nobody can attach a token to someone else's account.

/**
 * Registers this device for the signed-in user. A token that was another
 * account's moves to this one: it is the same phone, now signed in as
 * somebody else, and the previous account must stop receiving on it.
 */
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update
    set user_id = auth.uid(),
        platform = excluded.platform,
        last_seen_at = now(),
        disabled_at = null,
        disabled_reason = null;
end;
$$;

/** Signing out stops this device receiving for this account. */
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid()
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ------------------------------------------------------------------ outboxes

create table if not exists public.sms_outbox (
  id              uuid primary key default gen_random_uuid(),
  madrasa_id      uuid references public.madrasas (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  to_phone        text not null check (to_phone ~ '^\+254[17]\d{8}$'),
  body            text not null check (length(body) between 1 and 480),
  status          public.mail_status not null default 'queued',
  attempts        int not null default 0,
  provider_id     text,
  error           text,
  scheduled_at    timestamptz not null default now(),
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Service role only, like mail_outbox: RLS on, no policies.
alter table public.sms_outbox enable row level security;
alter table public.sms_outbox force row level security;

alter table public.mail_outbox
  add column if not exists notification_id uuid references public.notifications (id) on delete set null;

-- One email and one SMS per notification, however often it is dispatched.
-- Not partial: NULLs never collide in a unique index anyway, and ON CONFLICT
-- (which the dispatcher's upsert uses) cannot target a partial one.
drop index if exists public.mail_outbox_notification_key;
drop index if exists public.sms_outbox_notification_key;
create unique index mail_outbox_notification_key on public.mail_outbox (notification_id);
create unique index sms_outbox_notification_key on public.sms_outbox (notification_id);
create index if not exists mail_outbox_due_idx on public.mail_outbox (scheduled_at) where status = 'queued';
create index if not exists sms_outbox_due_idx on public.sms_outbox (scheduled_at) where status = 'queued';
create index if not exists notifications_undispatched_idx on public.notifications (created_at)
  where sent_at is null;

-- -------------------------------------------------------------------- claims

/**
 * Hands the dispatcher notifications that want push, email or SMS and have
 * not been dispatched. `sent_at` is stamped as they are claimed, so a second
 * dispatcher running at the same moment gets different rows. Anything older
 * than two days is left alone: a stale "fee due" push helps nobody.
 */
create or replace function public.claim_notifications(p_limit int default 50)
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  update public.notifications n
     set sent_at = now()
   where n.id in (
     select id from public.notifications
      where sent_at is null
        and created_at > now() - interval '2 days'
        and channel && array['push', 'email', 'sms']
      order by created_at
      limit greatest(1, least(p_limit, 200))
      for update skip locked
   )
  returning n.*
$$;

/**
 * Hands out queued email or SMS rows that are due. Each claim counts as an
 * attempt and pushes the next try back exponentially (2, 4, 8, 16 minutes),
 * so a provider outage is retried without hammering it. After five attempts
 * the row is left `failed` by the dispatcher.
 */
create or replace function public.claim_mail(p_limit int default 50)
returns setof public.mail_outbox
language sql
security definer
set search_path = public
as $$
  update public.mail_outbox m
     set attempts = m.attempts + 1,
         scheduled_at = now() + make_interval(mins => (2 ^ (m.attempts + 1))::int)
   where m.id in (
     select id from public.mail_outbox
      where status = 'queued' and scheduled_at <= now() and attempts < 5
      order by scheduled_at
      limit greatest(1, least(p_limit, 200))
      for update skip locked
   )
  returning m.*
$$;

create or replace function public.claim_sms(p_limit int default 50)
returns setof public.sms_outbox
language sql
security definer
set search_path = public
as $$
  update public.sms_outbox s
     set attempts = s.attempts + 1,
         scheduled_at = now() + make_interval(mins => (2 ^ (s.attempts + 1))::int)
   where s.id in (
     select id from public.sms_outbox
      where status = 'queued' and scheduled_at <= now() and attempts < 5
      order by scheduled_at
      limit greatest(1, least(p_limit, 200))
      for update skip locked
   )
  returning s.*
$$;

revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.claim_mail(int) from public, anon, authenticated;
revoke execute on function public.claim_sms(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.claim_mail(int) to service_role;
grant execute on function public.claim_sms(int) to service_role;

-- ---------------------------------------------------------------- the kick

/**
 * Asks the dispatcher to run. pg_net queues the request inside this
 * transaction and sends it after commit, so a rolled-back insert sends
 * nothing and the insert itself never waits on the network.
 */
create or replace function public.request_notification_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'dispatch_secret';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/dispatch-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-key', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  -- Delivery is never allowed to break the write that caused it. The sweep
  -- will pick the notification up.
  raise warning 'notification dispatch kick failed: %', sqlerrm;
end;
$$;

revoke execute on function public.request_notification_dispatch() from public, anon, authenticated;

create or replace function public.kick_notification_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from inserted where channel && array['push', 'email', 'sms']) then
    perform public.request_notification_dispatch();
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_dispatch on public.notifications;
create trigger trg_notifications_dispatch
  after insert on public.notifications
  referencing new table as inserted
  for each statement execute function public.kick_notification_dispatch();

-- The sweep: retries, and anything whose kick was lost.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'dispatch-notifications';
  perform cron.schedule('dispatch-notifications', '*/5 * * * *',
                        'select public.request_notification_dispatch()');
end;
$$;

-- ------------------------------------------------------ announcements, messages

-- Staff read every announcement of their own madrasa, whatever its audience.
-- Without this an announcement for parents only could not be read back by
-- the teacher who wrote it, and PostgREST checks the row it returns against
-- the read policy — so posting to parents or students alone failed outright.
-- It grants nothing new in practice: "announcements: staff update" already
-- lets staff act on every announcement in their madrasa.
drop policy if exists "announcements: staff read own madrasa" on public.announcements;
create policy "announcements: staff read own madrasa" on public.announcements
  for select using (
    public.can_access_madrasa(madrasa_id)
    and public.current_role_name() = 'teacher'
  );

/**
 * Publishing an announcement tells its audience. Parents are those with an
 * approved link to a child in the madrasa — the same rule that lets them
 * read anything else of the school's.
 */
create or replace function public.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  insert into public.notifications (user_id, madrasa_id, type, title, body, payload, channel)
  select distinct recipient, new.madrasa_id, 'announcement', new.title, left(new.body, 500),
         jsonb_build_object('announcement_id', new.id),
         array['in_app', 'push']
    from (
      select s.profile_id as recipient
        from public.students s
       where 'students' = any (new.audience)
         and s.madrasa_id = new.madrasa_id and s.deleted_at is null
      union
      select pa.profile_id
        from public.parent_student_links l
        join public.parents pa on pa.id = l.parent_id
       where 'parents' = any (new.audience)
         and l.madrasa_id = new.madrasa_id and l.status = 'approved'
      union
      select t.profile_id
        from public.teachers t
       where 'teachers' = any (new.audience)
         and t.madrasa_id = new.madrasa_id and t.deleted_at is null
    ) audience
   where recipient is not null and recipient <> new.author_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_announcement on public.announcements;
create trigger trg_notify_announcement
  after insert on public.announcements
  for each row execute function public.notify_announcement();

/**
 * A direct message pushes to its recipient. The text itself stays out of the
 * notification — it would otherwise sit on a lock screen — so only the
 * sender's name goes, and the app opens the conversation.
 */
create or replace function public.notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, madrasa_id, type, title, body, payload, channel)
  select new.recipient_id, new.madrasa_id, 'message',
         'New message',
         coalesce(p.full_name, 'Someone') || ' sent you a message.',
         jsonb_build_object('thread_id', new.thread_id, 'message_id', new.id),
         array['push']
    from public.profiles p
   where p.id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message
  after insert on public.messages
  for each row execute function public.notify_message();
