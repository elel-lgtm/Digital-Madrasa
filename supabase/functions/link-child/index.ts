import { authenticate } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * A parent requesting a link to their child.
 *
 * This is the one endpoint in the system a stranger has the most to gain from
 * abusing, so three things hold at once:
 *
 *   1. The parent never queries `students` directly. If they could, they could
 *      walk the admission-number space and enumerate every child on the
 *      platform — admission numbers are sequential and globally unique.
 *   2. Every failure returns the SAME message. "No such student", "already
 *      linked" and "wrong date of birth" are indistinguishable, so a miss
 *      leaks nothing about whether a number is real.
 *   3. Rate limited to 5 an hour and 20 a day, per section 10.4.
 *
 * A successful request creates a PENDING link. Nothing is visible to the
 * parent until a teacher or the owner approves it.
 */

interface Body {
  admissionNo?: string;
  relationship?: string;
  /** Optional second factor, when the madrasa requires it. */
  dateOfBirth?: string;
}

const GENERIC_FAILURE = 'We couldn\u2019t verify that admission number.';

export default handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);
  if (caller.role !== 'parent') {
    throw new PublicError(403, 'forbidden', 'Only parent accounts can link a child.');
  }

  await rateLimit(caller.admin, `link-child:h:${caller.userId}`, LIMITS.linkChildHourly);
  await rateLimit(caller.admin, `link-child:d:${caller.userId}`, LIMITS.linkChildDaily);

  const body = await readJson<Body>(req);
  const admissionNo = body.admissionNo?.trim().toUpperCase();
  const relationship = body.relationship ?? 'guardian';

  if (!admissionNo || !/^DM-\d{4}-\d{4}$/.test(admissionNo)) {
    throw new PublicError(400, 'validation', 'Admission numbers look like DM-2026-0042.');
  }
  if (!['father', 'mother', 'guardian'].includes(relationship)) {
    throw new PublicError(400, 'validation', 'Choose your relationship to the child.');
  }

  const { data: parent } = await caller.db
    .from('parents')
    .select('id')
    .eq('profile_id', caller.userId)
    .maybeSingle();
  if (!parent) throw new PublicError(403, 'forbidden', 'No parent record for this account.');

  // The lookup runs with the service key because a parent has no read access
  // to students they are not yet linked to — which is the whole point.
  const { data: student } = await caller.admin
    .from('students')
    .select('id, madrasa_id, date_of_birth, profiles!students_profile_id_fkey(full_name)')
    .eq('admission_no', admissionNo)
    .is('deleted_at', null)
    .maybeSingle();

  // Deliberately one branch, one message. Splitting these would turn the
  // endpoint into an oracle for which admission numbers exist.
  const alreadyLinked = student
    ? await caller.admin
        .from('parent_student_links')
        .select('id')
        .eq('parent_id', parent.id)
        .eq('student_id', student.id)
        .maybeSingle()
        .then((r) => Boolean(r.data))
    : false;

  const dobMismatch =
    student && body.dateOfBirth ? student.date_of_birth !== body.dateOfBirth : false;

  if (!student || alreadyLinked || dobMismatch) {
    await writeAudit(caller.admin, {
      actorId: caller.userId,
      actorRole: caller.role,
      madrasaId: null,
      action: 'parent_link.request_failed',
      entityType: 'parent_student_link',
      entityId: null,
      after: { admission_no: admissionNo },
      req,
    });
    throw new PublicError(404, 'link_failed', GENERIC_FAILURE);
  }

  const { data: link, error } = await caller.admin
    .from('parent_student_links')
    .insert({
      parent_id: parent.id,
      student_id: student.id,
      madrasa_id: student.madrasa_id,
      relationship,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[link-child]', error);
    throw new PublicError(404, 'link_failed', GENERIC_FAILURE);
  }

  await writeAudit(caller.admin, {
    actorId: caller.userId,
    actorRole: caller.role,
    madrasaId: student.madrasa_id,
    action: 'parent_link.requested',
    entityType: 'parent_student_link',
    entityId: link.id,
    after: { admission_no: admissionNo, relationship },
    req,
  });

  // Notify the madrasa's staff so the request does not sit unseen.
  const { data: staff } = await caller.admin
    .from('teachers')
    .select('profile_id')
    .eq('madrasa_id', student.madrasa_id);

  if (staff?.length) {
    await caller.admin.from('notifications').insert(
      staff.map((t) => ({
        user_id: t.profile_id,
        madrasa_id: student.madrasa_id,
        type: 'link_request',
        title: 'New parent link request',
        body: `${caller.fullName} has asked to link to a student. Review it in Link requests.`,
        channel: ['in_app'],
      })),
    );
  }

  // The madrasa name is safe to return: the parent proved they hold a valid
  // admission number, and it tells them the request reached the right school.
  const { data: madrasa } = await caller.admin
    .from('madrasas')
    .select('name')
    .eq('id', student.madrasa_id)
    .maybeSingle();

  return json({ madrasaName: madrasa?.name ?? '' }, 201);
});
