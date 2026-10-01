import type {
  AdminAuditEntry,
  AdminMadrasa,
  AdminOverview,
  MadrasaLifecycleInput,
  MadrasaStatus,
} from '@digital-madrasa/shared';
import { ApiError } from '../types';
import { supabase } from './client';
import { invokeFunction } from './functions';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/**
 * The platform admin's web console.
 *
 * Reads go through the admin_* functions (migration 0026), which refuse
 * anyone who is not a platform admin and return counts rather than pupil
 * records. The one write — changing a madrasa's status — goes through the
 * `madrasa-lifecycle` Edge Function, which audits it and, for a purge,
 * checks the typed-back name itself.
 */

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  if (error?.code === '42501') {
    throw new ApiError('forbidden', 'Platform administrators only.');
  }
  throw new ApiError('unknown', error?.message ?? fallback);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_platform_overview');
  if (error) fail(error, 'Could not load the platform overview.');
  const o = data as Row;
  const num = (v: unknown) => Number(v ?? 0);
  return {
    madrasas: {
      active: num(o.madrasas?.active),
      suspended: num(o.madrasas?.suspended),
      pending_deletion: num(o.madrasas?.pending_deletion),
      deleted: num(o.madrasas?.deleted),
    },
    people: {
      students: num(o.people?.students),
      teachers: num(o.people?.teachers),
      parents: num(o.people?.parents),
    },
    subscriptions: Object.fromEntries(
      Object.entries(o.subscriptions ?? {}).map(([k, v]) => [k, num(v)]),
    ) as AdminOverview['subscriptions'],
    revenue30d: {
      subscriptions: num(o.revenue30d?.subscriptions),
      feesCollected: num(o.revenue30d?.feesCollected),
      currency: o.revenue30d?.currency ?? 'KES',
    },
    delivery: {
      stalled: num(o.delivery?.stalled),
      emailFailed: num(o.delivery?.emailFailed),
      smsFailed: num(o.delivery?.smsFailed),
    },
    generatedAt: o.generatedAt ?? new Date().toISOString(),
  };
}

export async function listAdminMadrasas(): Promise<AdminMadrasa[]> {
  const { data, error } = await supabase.rpc('admin_madrasa_summaries');
  if (error) fail(error, 'Could not load madrasas.');
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    county: r.county,
    town: r.town,
    status: r.status,
    createdAt: r.created_at,
    suspendedAt: r.suspended_at ?? null,
    deletionScheduledAt: r.deletion_scheduled_at ?? null,
    deletionReason: r.deletion_reason ?? null,
    ownerName: r.owner_name ?? null,
    ownerEmail: r.owner_email ?? null,
    contactPhone: r.contact_phone,
    subscriptionStatus: r.subscription_status ?? null,
    trialEndsAt: r.trial_ends_at ?? null,
    currentPeriodEnd: r.current_period_end ?? null,
    students: Number(r.students ?? 0),
    teachers: Number(r.teachers ?? 0),
    parents: Number(r.parents ?? 0),
    feesOutstanding: Number(r.fees_outstanding ?? 0),
    lastActivityAt: r.last_activity_at ?? null,
  }));
}

export async function listAdminAudit(params: { madrasaId?: string }): Promise<AdminAuditEntry[]> {
  const { data, error } = await supabase.rpc('admin_audit_log', {
    p_madrasa_id: params.madrasaId ?? null,
    p_limit: 200,
  });
  if (error) fail(error, 'Could not load the audit log.');
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    actorName: r.actor_name,
    actorRole: r.actor_role ?? null,
    madrasaId: r.madrasa_id ?? null,
    madrasaName: r.madrasa_name ?? null,
    reason: r.reason ?? null,
  }));
}

export async function changeMadrasaStatus(
  input: MadrasaLifecycleInput,
): Promise<{ status: MadrasaStatus }> {
  return invokeFunction<{ status: MadrasaStatus }>('madrasa-lifecycle', {
    body: {
      madrasaId: input.madrasaId,
      action: input.action,
      reason: input.reason,
      confirmName: input.confirmName,
    },
  });
}
