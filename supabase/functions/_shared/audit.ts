import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Appends to `audit_log`.
 *
 * The log is append-only — no policy grants UPDATE or DELETE to anyone,
 * including the platform admin — so this is write-and-forget. A failure here
 * must never fail the operation being audited; it is logged instead.
 *
 * Never pass passwords, tokens, OTPs or raw audio through `before`/`after`.
 */
export async function writeAudit(
  admin: SupabaseClient,
  entry: {
    actorId: string;
    actorRole: string;
    madrasaId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    req?: Request;
  },
): Promise<void> {
  try {
    await admin.from('audit_log').insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      madrasa_id: entry.madrasaId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: entry.req?.headers.get('user-agent') ?? null,
    });
  } catch (error) {
    console.error('[audit]', entry.action, error);
  }
}
