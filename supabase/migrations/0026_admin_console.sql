-- 0026_admin_console.sql
--
-- What the platform admin's web console reads.
--
-- The console answers "how is the platform, and how is each school" — it has
-- no reason to hold a child's record, so these functions return counts and
-- totals, never rows about pupils. Every one refuses anyone who is not a
-- platform admin (`is_platform_admin()`, which no client can grant itself;
-- see 0002/0013), and none of them writes. Changing a madrasa's status stays
-- with the `madrasa-lifecycle` Edge Function, which audits each action and
-- demands the school's name typed back before a purge.
--
-- Re-runnable.

create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrators only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'madrasas', (
      select jsonb_build_object(
        'active',           count(*) filter (where status = 'active'),
        'suspended',        count(*) filter (where status = 'suspended'),
        'pending_deletion', count(*) filter (where status = 'pending_deletion'),
        'deleted',          count(*) filter (where status = 'deleted'))
        from public.madrasas),
    'people', jsonb_build_object(
      'students', (select count(*) from public.students where deleted_at is null),
      'teachers', (select count(*) from public.teachers where deleted_at is null),
      'parents',  (select count(*) from public.parents)),
    'subscriptions', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from public.subscriptions group by status) s),
    'revenue30d', jsonb_build_object(
      'subscriptions', (select coalesce(sum(amount), 0) from public.subscription_payments
                         where status = 'success' and settled_at > now() - interval '30 days'),
      'feesCollected', (select coalesce(sum(amount), 0) from public.payments
                         where status = 'success' and settled_at > now() - interval '30 days'),
      'currency', 'KES'),
    'delivery', jsonb_build_object(
      -- Notices that wanted push/email/SMS and have waited over 10 minutes:
      -- non-zero means the dispatcher is not running.
      'stalled', (select count(*) from public.notifications
                   where sent_at is null and channel && array['push', 'email', 'sms']
                     and created_at between now() - interval '2 days' and now() - interval '10 minutes'),
      'emailFailed', (select count(*) from public.mail_outbox where status = 'failed'),
      'smsFailed',   (select count(*) from public.sms_outbox where status = 'failed')),
    'generatedAt', now()
  );
end;
$$;

create or replace function public.admin_madrasa_summaries()
returns table (
  id                    uuid,
  name                  text,
  slug                  text,
  county                text,
  town                  text,
  status                public.madrasa_status,
  created_at            timestamptz,
  suspended_at          timestamptz,
  deletion_scheduled_at timestamptz,
  deletion_reason       text,
  owner_name            text,
  owner_email           text,
  contact_phone         text,
  subscription_status   public.subscription_status,
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  students              bigint,
  teachers              bigint,
  parents               bigint,
  fees_outstanding      numeric,
  last_activity_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrators only' using errcode = '42501';
  end if;

  return query
  select m.id, m.name, m.slug, m.county, m.town, m.status, m.created_at,
         m.suspended_at, m.deletion_scheduled_at, m.deletion_reason,
         op.full_name, op.email, m.contact_phone,
         s.status, s.trial_ends_at, s.current_period_end,
         (select count(*) from public.students st where st.madrasa_id = m.id and st.deleted_at is null),
         (select count(*) from public.teachers t where t.madrasa_id = m.id and t.deleted_at is null),
         (select count(distinct l.parent_id) from public.parent_student_links l
           where l.madrasa_id = m.id and l.status = 'approved'),
         (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i
           where i.madrasa_id = m.id and i.deleted_at is null
             and i.status in ('issued', 'partially_paid', 'overdue')),
         (select max(a.created_at) from public.audit_log a where a.madrasa_id = m.id)
    from public.madrasas m
    left join public.profiles op on op.id = m.owner_id
    left join public.subscriptions s on s.madrasa_id = m.id
   order by m.created_at desc;
end;
$$;

/**
 * The audit trail, newest first. Only who did what to which kind of record,
 * and the written reason where one was given — not the before/after row
 * images, which can carry personal data the console does not need.
 */
create or replace function public.admin_audit_log(p_madrasa_id uuid default null, p_limit int default 100)
returns table (
  id           uuid,
  created_at   timestamptz,
  action       text,
  entity_type  text,
  entity_id    uuid,
  actor_name   text,
  actor_role   text,
  madrasa_id   uuid,
  madrasa_name text,
  reason       text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrators only' using errcode = '42501';
  end if;

  return query
  select a.id, a.created_at, a.action, a.entity_type, a.entity_id,
         coalesce(p.full_name, 'System'), a.actor_role::text, a.madrasa_id, m.name,
         nullif(a.after ->> 'reason', '')
    from public.audit_log a
    left join public.profiles p on p.id = a.actor_id
    left join public.madrasas m on m.id = a.madrasa_id
   where p_madrasa_id is null or a.madrasa_id = p_madrasa_id
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke execute on function public.admin_platform_overview() from public, anon;
revoke execute on function public.admin_madrasa_summaries() from public, anon;
revoke execute on function public.admin_audit_log(uuid, int) from public, anon;
grant execute on function public.admin_platform_overview() to authenticated;
grant execute on function public.admin_madrasa_summaries() to authenticated;
grant execute on function public.admin_audit_log(uuid, int) to authenticated;
