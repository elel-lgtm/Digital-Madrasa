import { authenticate, requireStaff } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';
import { signToken, verifyToken, WINDOW_SECONDS, windowNumber } from './token.ts';

/**
 * QR attendance.
 *
 * GET  ?classId=...  a teacher fetches the current token to display
 * POST { token }     a student scans and marks themselves present
 *
 * The token rotates every 30 seconds and is an HMAC over the class id and the
 * window number, keyed by a server secret. Two properties follow:
 *
 *   - It cannot be forged. A student cannot compute next window's token, so
 *     they cannot mark themselves present from home.
 *   - Nothing is stored. There is no table of live tokens to keep clean, and
 *     a token is verified by recomputation.
 *
 * A screenshot shared with an absent friend is worth at most 30 seconds, and
 * the previous window is accepted only to cover clock skew and slow cameras.
 */

// Falls back to the service key so a missing secret cannot silently make
// every token forgeable — it just ties tokens to a value only we hold.
const secret = () =>
  Deno.env.get('QR_SIGNING_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const sign = (classId: string, window: number) => signToken(secret(), classId, window);
const verify = (token: string) => verifyToken(secret(), token);

Deno.serve(handler(async (req) => {
  const caller = await authenticate(req);

  // ---------------------------------------------------------------- display
  if (req.method === 'GET') {
    await requireStaff(caller);
    const classId = new URL(req.url).searchParams.get('classId');
    if (!classId) throw new PublicError(400, 'validation', 'Which class?');

    // Visible to this teacher? RLS answers, not us.
    const { data: klass } = await caller.db
      .from('classes')
      .select('id')
      .eq('id', classId)
      .maybeSingle();
    if (!klass) throw new PublicError(404, 'not_found', 'That class was not found.');

    const window = windowNumber();
    return json({
      token: await sign(classId, window),
      expiresAt: new Date((window + 1) * WINDOW_SECONDS * 1000).toISOString(),
      windowSeconds: WINDOW_SECONDS,
    });
  }

  // ------------------------------------------------------------------- scan
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'GET or POST.');

  if (caller.role !== 'student') {
    throw new PublicError(403, 'forbidden', 'Only students can scan in.');
  }
  await rateLimit(caller.admin, `qr-scan:${caller.userId}`, LIMITS.qrScan);

  const { token } = await readJson<{ token?: string }>(req);
  if (!token) throw new PublicError(400, 'validation', 'No code scanned.');

  const classId = await verify(token);
  if (!classId) {
    throw new PublicError(400, 'expired_code', 'That code has expired. Ask for a fresh one.');
  }

  const { data: student } = await caller.db
    .from('students')
    .select('id, madrasa_id, class_id')
    .eq('profile_id', caller.userId)
    .maybeSingle();

  if (!student) throw new PublicError(403, 'forbidden', 'No student record for this account.');

  // A valid token for a class the student is not in must not mark them
  // present — otherwise one shared code marks in the whole madrasa.
  if (student.class_id !== classId) {
    throw new PublicError(403, 'wrong_class', 'That code is for a different class.');
  }

  const today = new Date().toISOString().slice(0, 10);

  const { error } = await caller.admin.from('attendance').upsert(
    {
      madrasa_id: student.madrasa_id,
      class_id: classId,
      student_id: student.id,
      session_date: today,
      status: 'present',
      method: 'qr',
      marked_by: caller.userId,
    },
    { onConflict: 'student_id,session_date' },
  );

  if (error) {
    console.error('[attendance-qr]', error);
    throw new PublicError(500, 'internal', 'Could not record your attendance.');
  }

  await writeAudit(caller.admin, {
    actorId: caller.userId,
    actorRole: caller.role,
    madrasaId: student.madrasa_id,
    action: 'attendance.qr_scan',
    entityType: 'attendance',
    entityId: student.id,
    after: { class_id: classId, session_date: today },
    req,
  });

  return json({ status: 'present', sessionDate: today, classId });
}));
