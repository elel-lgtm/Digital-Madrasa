import { authenticate, requireStaff } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';

/**
 * A teacher or owner approving, rejecting or revoking a parent link.
 *
 * Approval is the moment a parent gains sight of a child's records, so it is
 * the single most consequential decision in the app. Three consequences follow
 * from one call and must not come apart:
 *
 *   - the link becomes `approved`
 *   - the parent's `madrasa_id` is set, if this is their first child
 *   - RLS immediately opens that child's rows to them
 *
 * Revocation is equally important and equally audited: a link removed after a
 * custody dispute has to leave a record of who removed it and when.
 */

interface Body {
  linkId?: string;
  decision?: 'approved' | 'rejected' | 'revoked';
  reason?: string;
}

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);
  await requireStaff(caller);

  const body = await readJson<Body>(req);
  const { linkId, decision } = body;

  if (!linkId) throw new PublicError(400, 'validation', 'Which request?');
  if (!decision || !['approved', 'rejected', 'revoked'].includes(decision)) {
    throw new PublicError(400, 'validation', 'Choose approve, reject or revoke.');
  }

  // Read through the caller's own client. A link belonging to another madrasa
  // is simply not visible, so cross-tenant approval fails as "not found"
  // without a tenancy check written here.
  const { data: link } = await caller.db
    .from('parent_student_links')
    .select('id, parent_id, student_id, madrasa_id, status')
    .eq('id', linkId)
    .maybeSingle();

  if (!link) throw new PublicError(404, 'not_found', 'That request was not found.');

  if (link.status === decision) {
    throw new PublicError(409, 'conflict', 'That request has already been decided.');
  }

  const { error } = await caller.admin
    .from('parent_student_links')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: caller.userId,
    })
    .eq('id', linkId);

  if (error) {
    console.error('[decide-link]', error);
    throw new PublicError(500, 'internal', 'Could not save that decision.');
  }

  // First approved child sets the parent's tenant. Without it the parent has
  // no madrasa_id and several policies will not match.
  if (decision === 'approved') {
    const { data: parent } = await caller.admin
      .from('parents')
      .select('id, profile_id, madrasa_id')
      .eq('id', link.parent_id)
      .maybeSingle();

    if (parent && !parent.madrasa_id) {
      await caller.admin
        .from('parents')
        .update({ madrasa_id: link.madrasa_id })
        .eq('id', parent.id);
      await caller.admin
        .from('profiles')
        .update({ madrasa_id: link.madrasa_id })
        .eq('id', parent.profile_id);
    }

    if (parent) {
      await caller.admin.from('notifications').insert({
        user_id: parent.profile_id,
        madrasa_id: link.madrasa_id,
        type: 'link_approved',
        title: 'Your child has been linked',
        body: 'You can now see their progress, attendance and fees.',
        payload: { link_id: link.id, student_id: link.student_id },
        channel: ['in_app', 'push'],
      });
    }
  }

  await writeAudit(caller.admin, {
    actorId: caller.userId,
    actorRole: caller.role,
    madrasaId: link.madrasa_id,
    action: `parent_link.${decision}`,
    entityType: 'parent_student_link',
    entityId: linkId,
    before: { status: link.status },
    after: { status: decision, reason: body.reason ?? null },
    req,
  });

  return json({ id: linkId, status: decision });
}));
