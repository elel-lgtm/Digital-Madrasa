import { authenticate, requireActiveSubscription, requireOwner } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Adds a teacher to the madrasa.
 *
 * The staff screen has had an invite form since the beginning, but on the real
 * backend the call reported itself unported and nothing happened — a madrasa
 * could not take on a second teacher at all. This is the missing half.
 *
 * Owner only. That is not a new rule: the `teachers` table already carries an
 * INSERT policy called "teachers: owner invites" and an UPDATE policy called
 * "teachers: owner updates", so the database has always said staff records are
 * the owner's to manage. `requireOwner` existed for this and had no callers.
 *
 * There is no invitation email, because this project has no mail sender. The
 * `mail_outbox` table exists but nothing writes to it and no function reads
 * it. Inventing a delivery pipeline here would produce an invite that silently
 * never arrives, which is worse than none. Instead the account is created
 * against the teacher's own address with a password nobody knows, and they
 * take it over through the app's existing "forgot password" flow — which is
 * Supabase Auth's own mail, configured outside this repository. The response
 * says so explicitly so the owner knows what to tell them.
 */

interface Body {
  fullName?: string;
  email?: string;
  phone?: string | null;
  specialisation?: string | null;
  qiraahStyles?: string[];
}

const ALLOWED_STYLES = ['hafs', 'warsh', 'qaloon', 'duri', 'susi', 'shubah'];

/**
 * Allocates the next `EMP-nnn` for this madrasa.
 *
 * `teachers` is unique on (madrasa_id, employee_no) and nothing issues the
 * number, so two owners inviting at the same moment can pick the same one. The
 * insert is retried rather than serialised through a counter table: staff
 * invites happen a handful of times in a madrasa's life, and the unique index
 * is what actually guarantees correctness here — the retry only decides who
 * waits. Invoice numbers, which are issued in bulk and must be gapless, do get
 * a counter; this does not need one.
 */
async function nextEmployeeNo(admin: ReturnType<typeof Object>, madrasaId: string): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const client = admin as any;
  const { data } = await client
    .from('teachers')
    .select('employee_no')
    .eq('madrasa_id', madrasaId);

  let highest = 0;
  for (const row of (data ?? []) as { employee_no: string }[]) {
    const match = /^EMP-(\d+)$/.exec(row.employee_no ?? '');
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `EMP-${String(highest + 1).padStart(3, '0')}`;
}

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);
  const owner = await requireOwner(caller);
  const madrasaId = owner.madrasa_id as string;

  await rateLimit(caller.admin, `invite-teacher:${caller.userId}`, LIMITS.inviteTeacher);
  await requireActiveSubscription(caller, madrasaId);

  const body = await readJson<Body>(req);
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!fullName || fullName.length < 3) {
    throw new PublicError(400, 'validation', 'Enter the teacher’s full name.');
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new PublicError(400, 'validation', 'Enter a valid email address.');
  }

  const styles = (body.qiraahStyles ?? []).filter((s) => ALLOWED_STYLES.includes(s));
  if (!styles.length) {
    throw new PublicError(400, 'validation', 'Choose at least one qiraah.');
  }

  // An address that already has an account cannot be provisioned again, and
  // must not be reported in a way that reveals whether it belongs to this
  // madrasa or another one — the owner is told what they can act on and
  // nothing more.
  const { data: existingProfile } = await caller.admin
    .from('profiles')
    .select('id, madrasa_id, role')
    .eq('email', email)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.madrasa_id === madrasaId) {
      throw new PublicError(409, 'conflict', 'That address already has an account here.');
    }
    throw new PublicError(409, 'conflict', 'That address is already in use.');
  }

  // A password nobody is told, including the owner. The teacher takes the
  // account over through the password-reset flow; a shared or guessable
  // default would hand every new account to whoever knew the pattern.
  const tempPassword = `${crypto.randomUUID()}Aa1!`;

  const { data: created, error: authError } = await caller.admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !created.user) {
    // GoTrue is the authority on whether the address is free; its own
    // duplicate check is the one that matters if the profile lookup missed.
    const message = String(authError?.message ?? '');
    if (/already|exists|registered/i.test(message)) {
      throw new PublicError(409, 'conflict', 'That address is already in use.');
    }
    throw new PublicError(500, 'internal', 'Could not create the teacher’s login.');
  }

  const teacherUserId = created.user.id;

  try {
    const { error: profileError } = await caller.admin.from('profiles').insert({
      id: teacherUserId,
      role: 'teacher',
      madrasa_id: madrasaId,
      full_name: fullName,
      email,
      phone: body.phone ?? null,
      locale: 'en',
    });
    if (profileError) throw profileError;

    // Retried only on the unique violation the allocation can lose; any other
    // failure is a real error and is not swallowed.
    let teacher: Record<string, unknown> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5 && !teacher; attempt += 1) {
      const employeeNo = await nextEmployeeNo(caller.admin, madrasaId);
      const { data, error } = await caller.admin
        .from('teachers')
        .insert({
          profile_id: teacherUserId,
          madrasa_id: madrasaId,
          employee_no: employeeNo,
          specialisation: body.specialisation ?? null,
          qiraah_styles: styles,
          is_owner: false,
          // Not active until they have actually signed in. The status is what
          // the staff list reads to show an account as still pending.
          status: 'invited',
        })
        .select('id, employee_no, specialisation, qiraah_styles, is_owner, status')
        .single();

      if (!error) {
        teacher = data;
        break;
      }
      lastError = error;
      if ((error as { code?: string }).code !== '23505') throw error;
    }
    if (!teacher) throw lastError ?? new Error('could not allocate an employee number');

    await writeAudit(caller.admin, {
      actorId: caller.userId,
      actorRole: caller.role,
      madrasaId,
      action: 'teacher.invited',
      entityType: 'teacher',
      entityId: teacher.id as string,
      after: { full_name: fullName, email, employee_no: teacher.employee_no },
      req,
    });

    return json(
      {
        id: teacher.id,
        profileId: teacherUserId,
        madrasaId,
        fullName,
        email,
        phone: body.phone ?? null,
        avatarUrl: null,
        employeeNo: teacher.employee_no,
        specialisation: teacher.specialisation ?? null,
        qiraahStyles: teacher.qiraah_styles ?? styles,
        isOwner: false,
        status: teacher.status,
        classCount: 0,
        // Said plainly rather than implied: no message was sent by this
        // request, and the owner has to tell them to reset their password.
        deliveredByEmail: false,
      },
      201,
    );
  } catch (error) {
    // Roll the login back so a failed invite does not strand an auth user that
    // occupies the address and can never be signed into.
    await caller.admin.auth.admin.deleteUser(teacherUserId).catch(() => undefined);
    console.error('[invite-teacher]', error);
    throw new PublicError(500, 'internal', 'Could not add the teacher.');
  }
}));
