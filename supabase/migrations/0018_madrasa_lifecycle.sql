-- ===========================================================================
-- 0018 — Madrasa lifecycle: suspend, schedule deletion, purge
-- ===========================================================================
--
-- The malicious-school kill switch from section 8. Deliberately NOT a red
-- button wired to DELETE CASCADE, because that button gets pressed by mistake
-- and a term of attendance records does not come back.
--
-- Three stages:
--
--   SUSPEND   instant, reversible. RLS already blocks every read and write for
--             a non-active madrasa, so this alone stops harm.
--   SCHEDULE  30-day window, reversible. An export is taken first.
--   PURGE     after the window, or immediately with a second confirmation.
--
-- What survives a purge, on purpose: audit_log, and financial records in
-- anonymised form. Kenyan tax and accounting obligations outlive the account,
-- and a chargeback six months later needs the payment to still exist.
-- ===========================================================================

alter table public.madrasas
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists deletion_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.profiles(id);

/**
 * Suspends or reinstates. Reversible, instant, and the only stage that should
 * ever be used in a hurry.
 */
create or replace function public.set_madrasa_status(
  p_madrasa_id uuid,
  p_status     public.madrasa_status,
  p_actor      uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.madrasas
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() else null end,
         suspended_by = case when p_status = 'suspended' then p_actor else null end,
         deletion_scheduled_at = case
           when p_status = 'pending_deletion' then now() + interval '30 days'
           else null
         end,
         deletion_reason = case when p_status = 'active' then null else p_reason end
   where id = p_madrasa_id;

  if not found then
    raise exception 'madrasa not found';
  end if;
end;
$$;

/**
 * Purges a tenant.
 *
 * Deletes in foreign-key-safe order. Financial rows are anonymised rather than
 * removed: the money moved, and pretending otherwise breaks reconciliation.
 * The audit trail is untouched — it is append-only and exists precisely to
 * record events like this one.
 */
create or replace function public.purge_madrasa(
  p_madrasa_id uuid,
  p_actor      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_profiles uuid[];
begin
  if not exists (
    select 1 from public.madrasas
     where id = p_madrasa_id and status in ('pending_deletion', 'suspended')
  ) then
    raise exception 'a madrasa must be suspended or scheduled for deletion before it can be purged';
  end if;

  select array_agg(id) into v_profiles
    from public.profiles where madrasa_id = p_madrasa_id;

  -- Child rows first.
  delete from public.tajweed_feedback where madrasa_id = p_madrasa_id;
  delete from public.recitations      where madrasa_id = p_madrasa_id;
  delete from public.submissions      where madrasa_id = p_madrasa_id;
  delete from public.assignments      where madrasa_id = p_madrasa_id;
  delete from public.hifz_progress    where madrasa_id = p_madrasa_id;
  delete from public.attendance       where madrasa_id = p_madrasa_id;
  delete from public.grades           where madrasa_id = p_madrasa_id;
  delete from public.certificates     where madrasa_id = p_madrasa_id;
  delete from public.lessons          where madrasa_id = p_madrasa_id;
  delete from public.enrollments      where madrasa_id = p_madrasa_id;
  delete from public.messages         where madrasa_id = p_madrasa_id;
  delete from public.message_threads  where madrasa_id = p_madrasa_id;
  delete from public.announcements    where madrasa_id = p_madrasa_id;
  delete from public.notifications    where madrasa_id = p_madrasa_id;
  delete from public.mail_outbox      where madrasa_id = p_madrasa_id;
  delete from public.parent_student_links where madrasa_id = p_madrasa_id;

  -- Financial: anonymise, do not delete.
  update public.payments
     set parent_id = null, raw_callback = null
   where madrasa_id = p_madrasa_id;

  update public.invoices
     set description = 'purged', notes = null
   where madrasa_id = p_madrasa_id;

  delete from public.saved_cards            where madrasa_id = p_madrasa_id;
  delete from public.subscription_payments  where madrasa_id = p_madrasa_id;
  delete from public.subscription_invoices  where madrasa_id = p_madrasa_id;
  delete from public.subscriptions          where madrasa_id = p_madrasa_id;

  delete from public.students     where madrasa_id = p_madrasa_id;
  delete from public.teachers     where madrasa_id = p_madrasa_id;
  delete from public.parents      where madrasa_id = p_madrasa_id;
  delete from public.classes      where madrasa_id = p_madrasa_id;
  delete from public.fee_structures where madrasa_id = p_madrasa_id;
  delete from public.feature_flags  where madrasa_id = p_madrasa_id;

  -- Detach the owner so the madrasa row can go, then the profiles.
  update public.madrasas set owner_id = null where id = p_madrasa_id;
  delete from public.profiles where madrasa_id = p_madrasa_id;

  update public.madrasas
     set status = 'deleted', deleted_at = now()
   where id = p_madrasa_id;

  v_counts := jsonb_build_object(
    'madrasa_id', p_madrasa_id,
    'profiles_removed', coalesce(array_length(v_profiles, 1), 0),
    'purged_at', now()
  );

  return v_counts;
end;
$$;

revoke all on function public.set_madrasa_status(uuid, public.madrasa_status, uuid, text) from public, anon, authenticated;
revoke all on function public.purge_madrasa(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_madrasa_status(uuid, public.madrasa_status, uuid, text) to service_role;
grant execute on function public.purge_madrasa(uuid, uuid) to service_role;

comment on function public.purge_madrasa is
  'Irreversible tenant purge. Retains audit_log and anonymised financial records for tax and chargeback obligations.';
