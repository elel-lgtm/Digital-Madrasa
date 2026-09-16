import { authenticate, requireActiveSubscription, requireStaff } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Enrols a student.
 *
 * This exists as an Edge Function for one reason the client cannot work
 * around: creating the child's login requires the Auth admin API, which needs
 * the service-role key. Everything else here could be done from the app, and
 * is still written so that the database — not this code — decides tenancy.
 *
 * The admission number is never accepted from the caller. It is issued by the
 * BEFORE INSERT trigger in migration 0003, which also rejects any attempt to
 * supply one.
 */

interface Body {
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  classId?: string | null;
  guardianNotes?: string | null;
  admissionYear?: number;
}

/** A login derived from the child's name; most have no email of their own. */
function derivedEmail(fullName: string, madrasaSlug: string): string {
  const handle = fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${handle}.${suffix}@${madrasaSlug}.students.local`;
}

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);
  const teacher = await requireStaff(caller);
  const madrasaId = teacher.madrasa_id as string;

  await rateLimit(caller.admin, `create-student:${caller.userId}`, LIMITS.createStudent);
  await requireActiveSubscription(caller, madrasaId);

  const body = await readJson<Body>(req);
  const fullName = body.fullName?.trim();
  if (!fullName || fullName.length < 3) {
    throw new PublicError(400, 'validation', 'Enter the student\u2019s full name.');
  }
  if (!body.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth)) {
    throw new PublicError(400, 'validation', 'Enter a valid date of birth.');
  }
  if (!body.gender || !['male', 'female'].includes(body.gender)) {
    throw new PublicError(400, 'validation', 'Select a gender.');
  }

  // Read through the caller's own client: if the class is not theirs, RLS
  // returns nothing and the check fails without us writing a tenancy rule.
  if (body.classId) {
    const { data: klass } = await caller.db
      .from('classes')
      .select('id')
      .eq('id', body.classId)
      .maybeSingle();
    if (!klass) throw new PublicError(404, 'not_found', 'That class was not found.');
  }

  const { data: madrasa } = await caller.db
    .from('madrasas')
    .select('slug')
    .eq('id', madrasaId)
    .maybeSingle();

  const email = derivedEmail(fullName, madrasa?.slug ?? 'madrasa');

  // A random initial password. The child never uses it: staff hand out a
  // reset, or the parent completes setup. Storing a guessable default would
  // be worse than any inconvenience this causes.
  const tempPassword = `${crypto.randomUUID()}Aa1!`;

  const { data: created, error: authError } = await caller.admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !created.user) {
    throw new PublicError(500, 'internal', 'Could not create the student\u2019s login.');
  }

  const studentUserId = created.user.id;

  try {
    const { error: profileError } = await caller.admin.from('profiles').insert({
      id: studentUserId,
      role: 'student',
      madrasa_id: madrasaId,
      full_name: fullName,
      email,
      locale: 'en',
    });
    if (profileError) throw profileError;

    const { data: student, error: studentError } = await caller.admin
      .from('students')
      .insert({
        profile_id: studentUserId,
        madrasa_id: madrasaId,
        admission_year: body.admissionYear ?? new Date().getFullYear(),
        date_of_birth: body.dateOfBirth,
        gender: body.gender,
        class_id: body.classId ?? null,
        guardian_notes: body.guardianNotes ?? null,
      })
      .select('id, admission_no, class_id, enrollment_status, created_at')
      .single();
    if (studentError) throw studentError;

    await writeAudit(caller.admin, {
      actorId: caller.userId,
      actorRole: caller.role,
      madrasaId,
      action: 'student.created',
      entityType: 'student',
      entityId: student.id,
      after: { admission_no: student.admission_no, full_name: fullName },
      req,
    });

    return json({
      id: student.id,
      profileId: studentUserId,
      madrasaId,
      fullName,
      admissionNo: student.admission_no,
      admissionYear: body.admissionYear ?? new Date().getFullYear(),
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      classId: student.class_id,
      className: null,
      enrollmentStatus: student.enrollment_status,
      guardianNotes: body.guardianNotes ?? null,
      avatarUrl: null,
      createdAt: student.created_at,
      signInEmail: email,
    }, 201);
  } catch (error) {
    // Roll back the login so a failed enrolment does not strand an auth user
    // that blocks the derived address and can never be reached.
    await caller.admin.auth.admin.deleteUser(studentUserId).catch(() => undefined);
    console.error('[create-student]', error);
    throw new PublicError(500, 'internal', 'Could not enrol the student.');
  }
}));
