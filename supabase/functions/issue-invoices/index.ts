import { authenticate, requireActiveSubscription, requireStaff } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Issues invoices for a fee structure.
 *
 * This is server-side for one reason: invoice numbers must be unique and
 * gapless per madrasa. A client computing `count + 1` races with every other
 * client doing the same, and duplicate invoice numbers are the kind of thing
 * that surfaces months later during a reconciliation nobody can complete.
 * The allocation happens in a single statement holding a row lock.
 *
 * Amounts come from the fee structure, never from the request — a tampered
 * payload cannot issue a child a one-shilling invoice.
 */

interface Body {
  feeStructureId?: string;
  classId?: string | null;
  studentIds?: string[];
  dueDate?: string;
}

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);
  const teacher = await requireStaff(caller);
  const madrasaId = teacher.madrasa_id as string;

  await rateLimit(caller.admin, `issue-invoices:${caller.userId}`, LIMITS.issueInvoices);
  await requireActiveSubscription(caller, madrasaId);

  const body = await readJson<Body>(req);
  if (!body.feeStructureId) {
    throw new PublicError(400, 'validation', 'Choose a fee structure.');
  }

  // Read the structure as the caller: another madrasa's is invisible.
  const { data: structure } = await caller.db
    .from('fee_structures')
    .select('id, name, amount, currency, applies_to, class_id, term, academic_year')
    .eq('id', body.feeStructureId)
    .maybeSingle();

  if (!structure) throw new PublicError(404, 'not_found', 'That fee structure was not found.');

  // Work out who is billed, again through the caller's client so the roster
  // is exactly what they are allowed to see.
  let query = caller.db.from('students').select('id').is('deleted_at', null);

  if (body.studentIds?.length) {
    query = query.in('id', body.studentIds);
  } else if (structure.applies_to === 'class' && structure.class_id) {
    query = query.eq('class_id', structure.class_id);
  } else if (body.classId) {
    query = query.eq('class_id', body.classId);
  }

  const { data: students } = await query;
  if (!students?.length) {
    throw new PublicError(400, 'validation', 'No students match that selection.');
  }

  const dueDate = body.dueDate ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const { data: created, error } = await caller.admin.rpc('issue_invoices_for_students', {
    p_madrasa_id: madrasaId,
    p_fee_structure_id: structure.id,
    p_student_ids: students.map((s) => s.id),
    p_due_date: dueDate,
    p_description: `${structure.name} — ${structure.term} ${structure.academic_year}`,
  });

  if (error) {
    console.error('[issue-invoices]', error);
    throw new PublicError(500, 'internal', 'Could not issue the invoices.');
  }

  await writeAudit(caller.admin, {
    actorId: caller.userId,
    actorRole: caller.role,
    madrasaId,
    action: 'invoices.issued',
    entityType: 'fee_structure',
    entityId: structure.id,
    after: { count: created, amount: structure.amount, due_date: dueDate },
    req,
  });

  // Tell each child's linked parents there is something to pay.
  const { data: links } = await caller.admin
    .from('parent_student_links')
    .select('parent_id, parents(profile_id)')
    .in('student_id', students.map((s) => s.id))
    .eq('status', 'approved');

  const parentProfiles = [
    ...new Set(
      (links ?? [])
        .map((l) => (l as { parents?: { profile_id?: string } }).parents?.profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (parentProfiles.length) {
    await caller.admin.from('notifications').insert(
      parentProfiles.map((profileId) => ({
        user_id: profileId,
        madrasa_id: madrasaId,
        type: 'fee_due',
        title: 'New invoice issued',
        body: `${structure.name} is now due. You can pay in the app.`,
        channel: ['in_app', 'push', 'email'],
      })),
    );
  }

  return json({ created: created ?? 0 }, 201);
}));
