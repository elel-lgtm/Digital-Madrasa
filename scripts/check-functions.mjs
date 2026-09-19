#!/usr/bin/env node
/**
 * Exercises the deployed Edge Functions with real signed-in users.
 *
 *   npm run check:functions
 *
 * These are the endpoints that perform privileged work, so the checks are as
 * much about what they REFUSE as what they allow.
 *
 * The checks write real rows — enrolling a pupil and raising a link request is
 * the only honest way to test `create-student` and `link-child` — so the run
 * removes exactly what it created, in a `finally` that also runs when a check
 * fails or throws. Earlier revisions exited on the first failure and left the
 * rows behind; several runs deposited stray pupils and pending link requests
 * in the real database, which then showed up on the teacher's dashboard.
 *
 * Cleanup deletes by the ids this run captured, never by name. That matters:
 * the pupil created here is called "Function Test Pupil", and standing
 * verification records from earlier phases share that name. Deleting by name
 * would take them too.
 *
 * The parent side runs as a throwaway account created per run rather than the
 * shared parent@example.com. `link-child` is rate limited at five calls an
 * hour keyed on the caller's user id, and each run spends two of them, so
 * using the shared account made this script safely re-runnable only twice an
 * hour — and a rate-limited run reports as a failure, which is indistinguishable
 * at a glance from a real regression. A fresh user has a fresh counter, so the
 * production limiter is left exactly as it is and the test simply stops
 * competing with itself.
 */
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv('apps/mobile/.env');
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const FN = `${URL_BASE}/functions/v1`;

async function signIn(email, password = 'Madrasa2026!') {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${email}: ${JSON.stringify(body).slice(0, 120)}`);
  return body.access_token;
}

async function call(fn, token, body, method = 'POST') {
  const res = await fetch(`${FN}/${fn}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/**
 * Admin calls for this run's throwaway fixture, made with the service-role key.
 *
 * Deliberately not the Management API: that needs a personal access token,
 * which expires. When it did, this script could no longer create a fixture and
 * failed before running a single check — an expired credential looked exactly
 * like a broken backend. The service-role key belongs to the project and does
 * not expire that way.
 *
 * These touch nothing the tests assert on: they create the fixture parent and
 * remove it again.
 */
function adminAuth() {
  const admin = loadEnv('supabase/.env');
  if (!admin.SUPABASE_URL || !admin.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('supabase/.env is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return {
    url: admin.SUPABASE_URL,
    headers: {
      apikey: admin.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${admin.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  };
}

async function adminFetch(path, init) {
  const { url, headers } = adminAuth();
  const res = await fetch(url + path, { ...init, headers: { ...headers, ...(init && init.headers) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

/**
 * Auth user ids created by this run, newest first. Only these are ever
 * deleted, and only by primary key — there is no predicate here that could
 * widen to someone else's row.
 */
const created = { authUsers: [], studentId: null };

/**
 * Creates a throwaway parent and returns credentials for it.
 *
 * The row goes in with `signup_kind: 'parent'`, which is the same metadata the
 * app's signup sends, so the existing `handle_new_auth_user` trigger provisions
 * the profile and `parents` row exactly as it would for a real registration.
 * Writing the auth row directly rather than calling the signup endpoint keeps
 * the fixture independent of whether email confirmation happens to be enabled.
 *
 * The address uses the reserved `.test` TLD (RFC 2606) so it can never collide
 * with, or deliver to, a real inbox. The password is generated per run and is
 * never written to disk or logged.
 */
async function createFixtureParent() {
  const email = `fixture-parent-${randomUUID().slice(0, 8)}@digital-madrasa.test`;
  const password = `Fx-${randomBytes(18).toString('base64url')}`;

  // The admin create-user endpoint writes the auth row properly — GoTrue fills
  // in the token columns and password hash itself, which a hand-written INSERT
  // has to get exactly right or sign-in fails with an opaque schema error.
  // `signup_kind` in the user metadata is what the app's own signup sends, so
  // the existing handle_new_auth_user trigger provisions the profile and
  // `parents` row exactly as it would for a real registration.
  const user = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { signup_kind: 'parent', full_name: 'Fixture Parent' },
    }),
  });

  const id = user && user.id;
  if (!id) throw new Error('fixture parent was not created');

  // Recorded before anything can fail, so cleanup always has the id.
  created.authUsers.unshift(id);
  return { id, email, password };
}

/**
 * Removes every auth user this run created, one primary-key delete each.
 *
 * Deleting the auth user is enough to take the whole subtree with it:
 * `profiles.id` cascades from `auth.users`, then `students.profile_id` and
 * `parents.profile_id` cascade from `profiles`, and the link request,
 * attendance and invoices cascade from those. One id in, one subtree out.
 *
 * A failure here is reported against the specific id and nothing else is
 * attempted for it. Widening the predicate to "clean up anything that looks
 * like test data" is precisely how a cleanup routine ends up deleting the
 * standing verification records, so it is not done.
 */
async function cleanup() {
  if (created.authUsers.length === 0) return;

  const failed = [];
  for (const id of created.authUsers) {
    try {
      await adminFetch(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
    } catch (error) {
      failed.push(`${id}: ${String(error.message).slice(0, 160)}`);
    }

    // `rate_limits` has no foreign key to `auth.users`, so removing the user
    // leaves its counters behind. They are harmless but they accumulate, one
    // pair per run forever. Matching on the captured uuid as a suffix rather
    // than listing the two key shapes keeps this correct if the limiter ever
    // adds a third key for the same caller; a uuid generated this run cannot
    // appear at the end of anyone else's key.
    try {
      await adminFetch(`/rest/v1/rate_limits?key=like.*${id}`, { method: 'DELETE' });
    } catch (error) {
      failed.push(`rate_limits for ${id}: ${String(error.message).slice(0, 160)}`);
    }
  }

  if (failed.length) {
    console.log(`\n! Cleanup incomplete — these rows remain and need removing by hand:`);
    failed.forEach((f) => console.log(`    ${f}`));
    return;
  }
  console.log(`\n  cleaned up ${created.authUsers.length} record(s) this run created`);
}

try {
  // The parent is disposable so its rate-limit counters start clean; the other
  // three are read-only or refusal cases and consume no limited quota.
  const fixture = await createFixtureParent();
  console.log(`fixture parent: ${fixture.email}`);

  const owner = await signIn('owner@annur.example');
  const parent = await signIn(fixture.email, fixture.password);
  const student = await signIn('aisha.hassan@annur.example');
  const admin = await signIn('mohammednursukyan98@gmail.com', 'Roman@4567');

  console.log('create-student');
  const made = await call('create-student', owner, {
    fullName: 'Function Test Pupil',
    dateOfBirth: '2015-04-02',
    gender: 'female',
  });
  if (made.body.profileId) created.authUsers.unshift(made.body.profileId);
  created.studentId = made.body.id ?? null;
  check('owner can enrol', made.status === 201, `HTTP ${made.status}`);
  check(
    'admission number issued by trigger',
    /^DM-\d{4}-\d{4}$/.test(made.body.admissionNo ?? ''),
    made.body.admissionNo,
  );
  const asParent = await call('create-student', parent, {
    fullName: 'Nope',
    dateOfBirth: '2015-01-01',
    gender: 'male',
  });
  check('parent cannot enrol', asParent.status === 403, `HTTP ${asParent.status}`);

  console.log('\nlink-child');
  const badLink = await call('link-child', parent, {
    admissionNo: 'DM-2099-9999',
    relationship: 'mother',
  });
  check('unknown admission number refused', badLink.status === 404, `HTTP ${badLink.status}`);
  check(
    'failure message is generic (no enumeration)',
    /couldn.t verify/i.test(badLink.body.error ?? ''),
    (badLink.body.error ?? '').slice(0, 44),
  );
  const realNo = made.body.admissionNo;
  const goodLink = await call('link-child', parent, {
    admissionNo: realNo,
    relationship: 'mother',
  });
  check('valid admission number accepted', goodLink.status === 201, `HTTP ${goodLink.status}`);
  check('returns madrasa name', Boolean(goodLink.body.madrasaName), goodLink.body.madrasaName);

  console.log('\nattendance-qr');
  const classes = await fetch(`${URL_BASE}/rest/v1/classes?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${owner}` },
  }).then((r) => r.json());

  const qrRes = await fetch(`${FN}/attendance-qr?classId=${classes[0].id}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${owner}` },
  });
  const qr = { status: qrRes.status, body: await qrRes.json().catch(() => ({})) };
  check('teacher gets a rotating token', qr.status === 200, `HTTP ${qr.status}`);
  check(
    'token is signed for that class',
    (qr.body.token ?? '').startsWith(classes[0].id + '.'),
    (qr.body.token ?? '').slice(0, 44),
  );
  check('token carries an expiry', Boolean(qr.body.expiresAt), qr.body.expiresAt);
  const forged = await call('attendance-qr', student, { token: 'fake.123.deadbeef' });
  check('forged token refused', forged.status === 400, `HTTP ${forged.status}`);

  console.log('\nmadrasa-lifecycle');
  const notAdmin = await call('madrasa-lifecycle', owner, {
    madrasaId: '00000000-0000-0000-0000-000000000000',
    action: 'suspend',
    reason: 'test',
  });
  check('non-admin refused', notAdmin.status === 403, `HTTP ${notAdmin.status}`);
  const noReason = await call('madrasa-lifecycle', admin, {
    madrasaId: '00000000-0000-0000-0000-000000000000',
    action: 'suspend',
  });
  check('reason is required', noReason.status === 400, `HTTP ${noReason.status}`);

  console.log('\nevaluate-recitation');
  const uploadUrl = await call('evaluate-recitation', student, {
    action: 'upload-url',
    contentType: 'audio/m4a',
  });
  check('student gets a signed upload URL', uploadUrl.status === 200, `HTTP ${uploadUrl.status}`);
  check(
    'upload path is tenant scoped',
    (uploadUrl.body.path ?? '').startsWith('madrasa/'),
    (uploadUrl.body.path ?? '').slice(0, 44),
  );
  const badFormat = await call('evaluate-recitation', student, {
    action: 'upload-url',
    contentType: 'application/x-msdownload',
  });
  check('disallowed MIME type refused', badFormat.status === 400, `HTTP ${badFormat.status}`);
} finally {
  // Runs on a failed assertion and on an unexpected throw alike, so the
  // database is left as the run found it either way.
  await cleanup();
}

console.log(
  failures === 0 ? '\n✓ Deployed functions behave correctly.' : `\n✗ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
