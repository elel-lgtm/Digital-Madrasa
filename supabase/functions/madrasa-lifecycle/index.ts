import { authenticate } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';

/**
 * The platform admin's kill switch.
 *
 * Restricted to `is_platform_admin`, which no client session can grant itself
 * (migration 0013). Four actions, deliberately staged:
 *
 *   suspend   instant, reversible. Stops harm now.
 *   schedule  30-day window, reversible, export taken first.
 *   reinstate undoes either of the above.
 *   purge     irreversible. Requires the madrasa's exact name typed back, so
 *             it cannot be reached by a mis-click or a replayed request.
 *
 * Every action is audited with actor, reason, IP and user agent. The audit
 * table is append-only, so this record cannot later be tidied away — including
 * by the admin who made it.
 */

interface Body {
  madrasaId?: string;
  action?: 'suspend' | 'schedule_deletion' | 'reinstate' | 'purge';
  reason?: string;
  /** Purge only: the madrasa's exact name, typed by the admin. */
  confirmName?: string;
}

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);
  if (!caller.isPlatformAdmin) {
    throw new PublicError(403, 'forbidden', 'Platform administrators only.');
  }

  const body = await readJson<Body>(req);
  const { madrasaId, action } = body;

  if (!madrasaId) throw new PublicError(400, 'validation', 'Which madrasa?');
  if (!action || !['suspend', 'schedule_deletion', 'reinstate', 'purge'].includes(action)) {
    throw new PublicError(400, 'validation', 'Unknown action.');
  }
  if (action !== 'reinstate' && !body.reason?.trim()) {
    throw new PublicError(400, 'validation', 'A written reason is required.');
  }

  const { data: madrasa } = await caller.admin
    .from('madrasas')
    .select('id, name, status, owner_id, contact_email')
    .eq('id', madrasaId)
    .maybeSingle();

  if (!madrasa) throw new PublicError(404, 'not_found', 'Madrasa not found.');

  const before = { status: madrasa.status };

  if (action === 'purge') {
    // Typing the name is the only friction between an admin and permanent
    // deletion of a school's records. It is not a formality.
    if (body.confirmName?.trim() !== madrasa.name) {
      throw new PublicError(
        400,
        'confirm_mismatch',
        'Type the madrasa name exactly to confirm permanent deletion.',
      );
    }

    const { data: result, error } = await caller.admin.rpc('purge_madrasa', {
      p_madrasa_id: madrasaId,
      p_actor: caller.userId,
    });

    if (error) {
      console.error('[purge]', error);
      throw new PublicError(400, 'purge_failed', error.message);
    }

    await writeAudit(caller.admin, {
      actorId: caller.userId,
      actorRole: 'admin',
      madrasaId,
      action: 'madrasa.purged',
      entityType: 'madrasa',
      entityId: madrasaId,
      before,
      after: { ...(result as Record<string, unknown>), reason: body.reason },
      req,
    });

    return json({ status: 'deleted', result });
  }

  const statusFor = {
    suspend: 'suspended',
    schedule_deletion: 'pending_deletion',
    reinstate: 'active',
  } as const;

  const { error } = await caller.admin.rpc('set_madrasa_status', {
    p_madrasa_id: madrasaId,
    p_status: statusFor[action],
    p_actor: caller.userId,
    p_reason: body.reason ?? null,
  });

  if (error) {
    console.error('[madrasa-lifecycle]', error);
    throw new PublicError(500, 'internal', 'Could not change the madrasa status.');
  }

  // Suspension has to end the tenant's live sessions, or a signed-in teacher
  // keeps working until their token expires an hour later.
  if (action === 'suspend' || action === 'schedule_deletion') {
    const { data: profiles } = await caller.admin
      .from('profiles')
      .select('id')
      .eq('madrasa_id', madrasaId);

    for (const p of profiles ?? []) {
      await caller.admin.auth.admin.signOut(p.id, 'global').catch(() => undefined);
    }
  }

  if (madrasa.owner_id) {
    await caller.admin.from('notifications').insert({
      user_id: madrasa.owner_id,
      madrasa_id: madrasaId,
      type: 'madrasa_status',
      title:
        action === 'reinstate'
          ? 'Your madrasa has been reinstated'
          : action === 'suspend'
            ? 'Your madrasa has been suspended'
            : 'Your madrasa is scheduled for deletion',
      body: body.reason ?? 'Contact support for details.',
      channel: ['in_app', 'email'],
    });
  }

  await writeAudit(caller.admin, {
    actorId: caller.userId,
    actorRole: 'admin',
    madrasaId,
    action: `madrasa.${action}`,
    entityType: 'madrasa',
    entityId: madrasaId,
    before,
    after: { status: statusFor[action], reason: body.reason ?? null },
    req,
  });

  return json({ status: statusFor[action] });
}));
