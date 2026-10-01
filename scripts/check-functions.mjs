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
const created = { authUsers: [], studentId: null, feeStructures: [], madrasas: [] };

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
 * Creates a second madrasa with one pupil in it, so the cross-tenant refusal
 * can be tested against a real foreign row rather than asserted in the
 * abstract. Without one, "another madrasa's pupil is refused" is a case that
 * silently never runs.
 *
 * The auth user is recorded for cleanup first; `profiles.id` cascades from
 * `auth.users` and `students.profile_id` from `profiles`, so removing the user
 * takes the pupil with it. The madrasa row is captured separately because
 * nothing cascades to it.
 */
async function createFixtureTenant() {
  const email = `fixture-tenant-${randomUUID().slice(0, 8)}@digital-madrasa.test`;
  const user = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: `Fx-${randomBytes(18).toString('base64url')}`,
      email_confirm: true,
      user_metadata: { signup_kind: 'parent', full_name: 'Fixture Tenant Head' },
    }),
  });
  if (!user || !user.id) throw new Error('fixture tenant user was not created');
  created.authUsers.unshift(user.id);

  const slug = `fixture-${randomUUID().slice(0, 8)}`;
  const madrasa = (await adminFetch('/rest/v1/madrasas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: 'Fixture Madrasa',
      slug,
      county: 'Wajir',
      town: 'Wajir',
      owner_id: user.id,
      contact_email: email,
      contact_phone: '+254700000199',
      status: 'active',
    }),
  }))[0];
  created.madrasas.push(madrasa.id);

  await adminFetch(`/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ madrasa_id: madrasa.id, role: 'student' }),
  });

  const pupil = (await adminFetch('/rest/v1/students', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      madrasa_id: madrasa.id,
      profile_id: user.id,
      date_of_birth: '2014-05-05',
      gender: 'male',
    }),
  }))[0];

  return { madrasaId: madrasa.id, studentId: pupil.id };
}

/**
 * A teacher created for this run alone, used for the invoice matrix.
 *
 * `issue-invoices` is rate limited at ten calls an hour keyed on the caller,
 * and the matrix spends most of that in one pass — so running it as the shared
 * owner account made the script safely re-runnable roughly once an hour, and a
 * limited run reports as a wall of failures indistinguishable at a glance from
 * a real regression. A fresh teacher has a fresh counter. The production
 * limiter is left exactly as it is; the test simply stops competing with
 * itself.
 */
async function createFixtureIssuer(madrasaId) {
  const email = `fixture-issuer-${randomUUID().slice(0, 8)}@digital-madrasa.test`;
  const password = `Fx-${randomBytes(18).toString('base64url')}`;

  const user = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { signup_kind: 'parent', full_name: 'Fixture Issuer' },
    }),
  });
  if (!user || !user.id) throw new Error('fixture issuer was not created');
  created.authUsers.unshift(user.id);

  await adminFetch(`/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ madrasa_id: madrasaId, role: 'teacher' }),
  });
  await adminFetch('/rest/v1/teachers', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: user.id,
      madrasa_id: madrasaId,
      employee_no: `FX-${randomUUID().slice(0, 6)}`,
      is_owner: false,
      status: 'active',
    }),
  });

  return { email, password };
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
  const failed = [];

  // Invoices first: they reference the structure. Both are removed by the ids
  // this run captured, so a verification fee that happened to share a name
  // with a real one could never take the real one with it.
  // Notices the functions sent about this run's fixtures go to standing staff
  // and parent accounts, so nothing cascades to them. Each notice carries the
  // id it is about in its payload; they are removed by those captured ids.
  const notices = [
    ...created.feeStructures.map((id) => `payload->>fee_structure_id=eq.${id}`),
    ...(created.studentId ? [`payload->>student_id=eq.${created.studentId}`] : []),
  ];
  for (const filter of notices) {
    try {
      // Delivery (migration 0025) queues email/SMS rows per notice. Their link
      // is nulled, not cascaded, when a notice goes, so they are removed first
      // by the notices' own ids.
      const rows = (await adminFetch(`/rest/v1/notifications?${filter}&select=id`)) ?? [];
      if (rows.length) {
        const ids = rows.map((r) => r.id).join(',');
        await adminFetch(`/rest/v1/mail_outbox?notification_id=in.(${ids})`, { method: 'DELETE' });
        await adminFetch(`/rest/v1/sms_outbox?notification_id=in.(${ids})`, { method: 'DELETE' });
      }
      await adminFetch(`/rest/v1/notifications?${filter}`, { method: 'DELETE' });
    } catch (error) {
      failed.push(`notifications ${filter}: ${String(error.message).slice(0, 160)}`);
    }
  }

  for (const id of created.feeStructures) {
    try {
      await adminFetch(`/rest/v1/invoices?fee_structure_id=eq.${id}`, { method: 'DELETE' });
      await adminFetch(`/rest/v1/fee_structures?id=eq.${id}`, { method: 'DELETE' });
    } catch (error) {
      failed.push(`fee structure ${id}: ${String(error.message).slice(0, 160)}`);
    }
  }

  // After the auth users, since a madrasa cannot go while rows still point at
  // it. Removed by captured id only.
  const dropMadrasas = async () => {
    for (const id of created.madrasas) {
      try {
        await adminFetch(`/rest/v1/madrasas?id=eq.${id}`, { method: 'DELETE' });
      } catch (error) {
        failed.push(`madrasa ${id}: ${String(error.message).slice(0, 160)}`);
      }
    }
  };

  // Before the auth users: `madrasas.owner_id` references a profile, and a
  // profile cannot go while a madrasa still points at it.
  await dropMadrasas();

  if (created.authUsers.length === 0) {
    if (created.feeStructures.length) {
      console.log(
        `\n  cleaned up ${created.feeStructures.length} fee structure(s) and their invoices`,
      );
    }
    failed.forEach((f) => console.log(`    ${f}`));
    return;
  }

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
  console.log(
    `\n  cleaned up ${created.authUsers.length} record(s) and `
      + `${created.feeStructures.length} fee structure(s) this run created`,
  );
}

try {
  // The parent is disposable so its rate-limit counters start clean; the other
  // three are read-only or refusal cases and consume no limited quota.
  const fixture = await createFixtureParent();
  console.log(`fixture parent: ${fixture.email}`);
  const tenant = await createFixtureTenant();

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

  // ------------------------------------------------------- QR scan matrix
  //
  // The generation side above proves a token is signed and scoped. This is the
  // other half: what the scan endpoint does with a token once a student
  // presents it. Every rejection below is the server's, not the client's.
  console.log('\nattendance-qr: scanning');

  const scanStudent = await adminFetch(
    '/rest/v1/students?select=id,class_id&profile_id=eq.' +
      (await adminFetch('/rest/v1/profiles?select=id&email=eq.aisha.hassan@annur.example'))[0].id,
  );
  const today = new Date().toISOString().slice(0, 10);

  // Today's row is restored afterwards so a passing run leaves attendance as
  // it found it.
  const priorRows = await adminFetch(
    '/rest/v1/attendance?select=status,method&student_id=eq.' +
      scanStudent[0].id + '&session_date=eq.' + today,
  );
  const prior = priorRows[0] ?? null;

  try {
    // A. own class, live token.
    //
    // The token is fetched as the teacher, because that is who is allowed to
    // fetch one — the display side is staff-only, and a student who could mint
    // their own code would not need to be in the room at all.
    const issued = await fetch(
      `${FN}/attendance-qr?classId=${scanStudent[0].class_id}`,
      { headers: { apikey: ANON, Authorization: `Bearer ${owner}` } },
    ).then((r) => r.json());
    const liveToken = issued.token;

    const good = await call('attendance-qr', student, { token: liveToken });
    check('A. valid code for own class accepted', good.status === 200, `HTTP ${good.status}`);
    check('   ...answers with the session it recorded', good.body.sessionDate === today,
          good.body.sessionDate);

    // B. the same code again — the upsert keys on (student, date), so this is
    // one row, not two.
    const again = await call('attendance-qr', student, { token: liveToken });
    check('B. duplicate scan accepted idempotently', again.status === 200, `HTTP ${again.status}`);
    const rows = await adminFetch(
      '/rest/v1/attendance?select=id&student_id=eq.' + scanStudent[0].id +
        '&session_date=eq.' + today,
    );
    check('   ...still exactly one attendance row', rows.length === 1, rows.length + ' row(s)');

    // C. expired: a token from a window that has rotated away
    const staleWindow = Math.floor(Date.now() / 30000) - 10;
    const stale = liveToken.replace(/\.[0-9]+\./, '.' + staleWindow + '.');
    const expired = await call('attendance-qr', student, { token: stale });
    check('C. expired code refused', expired.status === 400 && expired.body.code === 'expired_code',
          `HTTP ${expired.status} ${expired.body.code}`);

    // D. malformed
    const junk = await call('attendance-qr', student, { token: 'not-a-token' });
    check('D. malformed code refused', junk.status === 400, `HTTP ${junk.status} ${junk.body.code}`);
    const empty = await call('attendance-qr', student, {});
    check('   ...missing code refused', empty.status === 400, `HTTP ${empty.status}`);

    // E. a genuine, correctly signed token for a class this student is not in
    const otherClass = (await adminFetch(
      '/rest/v1/classes?select=id&id=neq.' + scanStudent[0].class_id + '&limit=1',
    ))[0];
    if (otherClass) {
      const otherToken = (await fetch(`${FN}/attendance-qr?classId=${otherClass.id}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${owner}` },
      }).then((r) => r.json())).token;
      const wrong = await call('attendance-qr', student, { token: otherToken });
      check('E. code for another class refused',
            wrong.status === 403 && wrong.body.code === 'wrong_class',
            `HTTP ${wrong.status} ${wrong.body.code}`);
    }

    // F. a non-student caller, which is also how a foreign tenant is turned
    // away: the token names a class, and the caller must be a student in it.
    const asTeacher = await call('attendance-qr', owner, { token: liveToken });
    check('F. non-student caller refused', asTeacher.status === 403, `HTTP ${asTeacher.status}`);
    const asParent = await call('attendance-qr', parent, { token: liveToken });
    check('   ...parent refused', asParent.status === 403, `HTTP ${asParent.status}`);

    // G. unauthenticated
    const anon = await fetch(`${FN}/attendance-qr`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: liveToken }),
    });
    check('G. unauthenticated refused', anon.status === 401, `HTTP ${anon.status}`);
  } finally {
    // Put today's attendance back exactly as it was.
    await adminFetch(
      '/rest/v1/attendance?student_id=eq.' + scanStudent[0].id + '&session_date=eq.' + today,
      { method: 'DELETE' },
    ).catch(() => {});
    if (prior) {
      await adminFetch('/rest/v1/attendance', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          madrasa_id: (await adminFetch('/rest/v1/madrasas?select=id'))[0].id,
          class_id: scanStudent[0].class_id,
          student_id: scanStudent[0].id,
          session_date: today,
          status: prior.status,
          method: prior.method,
        }),
      }).catch(() => {});
    }
    console.log('   attendance for ' + today + ' restored');
  }

  // -------------------------------------------------- invoice targeting
  //
  // The point of these is who gets billed. A fee structure scoped to one pupil
  // used to fall through the function's branching and invoice the entire
  // madrasa, and a request that named no target did the same, so the cases
  // below assert the size of the billed set and not merely that a call
  // succeeded.
  //
  // Every invoice raised here belongs to a fee structure this run created, so
  // cleanup removes them by that id — never by student, and never by name.
  console.log('\ninvoice targeting');

  const madrasa = (await adminFetch('/rest/v1/madrasas?select=id&slug=eq.madrasat-an-nur'))[0];
  const hifz = (await adminFetch(
    '/rest/v1/classes?select=id,name&madrasa_id=eq.' + madrasa.id + '&name=eq.Hifz%20Level%201',
  ))[0];
  const aisha = (await adminFetch(
    '/rest/v1/students?select=id,class_id&profile_id=eq.' +
      (await adminFetch('/rest/v1/profiles?select=id&email=eq.aisha.hassan@annur.example'))[0].id,
  ))[0];

  // Snapshot before anything is issued: test G compares against this.
  const before = await adminFetch(
    '/rest/v1/invoices?select=id,invoice_no,amount_due,student_id&madrasa_id=eq.' + madrasa.id,
  );

  const activeCount = (await adminFetch(
    '/rest/v1/students?select=id&madrasa_id=eq.' + madrasa.id +
      '&deleted_at=is.null&enrollment_status=eq.active',
  )).length;
  const hifzCount = (await adminFetch(
    '/rest/v1/students?select=id&class_id=eq.' + hifz.id +
      '&deleted_at=is.null&enrollment_status=eq.active',
  )).length;

  const mkStructure = async (name, appliesTo, extra) => {
    const row = (await adminFetch('/rest/v1/fee_structures', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        madrasa_id: madrasa.id,
        name,
        academic_year: new Date().getFullYear(),
        term: 'Verification',
        amount: 100,
        currency: 'KES',
        applies_to: appliesTo,
        ...extra,
      }),
    }))[0];
    created.feeStructures.push(row.id);
    return row.id;
  };

  // Every issuing call below is made as this account, not the shared owner.
  const issuerLogin = await createFixtureIssuer(madrasa.id);
  const issuer = await signIn(issuerLogin.email, issuerLogin.password);

  const perStudent = await mkStructure('VERIFY one pupil', 'student', { student_id: aisha.id });
  const perClass = await mkStructure('VERIFY one class', 'class', { class_id: hifz.id });
  const perAll = await mkStructure('VERIFY everyone', 'all', {});

  const invoicesFor = async (structureId) =>
    adminFetch(
      '/rest/v1/invoices?select=id,invoice_no,student_id&fee_structure_id=eq.' + structureId,
    );

  // A. one student
  const single = await call('issue-invoices', issuer, {
    feeStructureId: perStudent,
    scope: 'student',
    dueDate: '2026-12-01',
  });
  check('A. student-scoped fee accepted', single.status === 201, `HTTP ${single.status}`);
  const singleRows = await invoicesFor(perStudent);
  check('A. exactly one invoice raised', singleRows.length === 1, `${singleRows.length} row(s)`);
  check('A. and it is for that pupil', singleRows[0]?.student_id === aisha.id);
  check(
    'A. the number came from the server',
    /^INV-\d{4}-\d{4}$/.test(single.body.invoices?.[0]?.invoiceNo ?? ''),
    single.body.invoices?.[0]?.invoiceNo,
  );

  // H. nobody else was touched by that run
  check(
    'H. no other pupil was invoiced by it',
    singleRows.every((r) => r.student_id === aisha.id),
  );

  // B. one class
  const klass = await call('issue-invoices', issuer, {
    feeStructureId: perClass,
    scope: 'class',
    dueDate: '2026-12-01',
  });
  check('B. class-scoped fee accepted', klass.status === 201, `HTTP ${klass.status}`);
  const classRows = await invoicesFor(perClass);
  check(
    'B. one invoice per enrolled pupil in the class',
    classRows.length === hifzCount,
    `${classRows.length} of ${hifzCount}`,
  );
  const hifzIds = new Set(
    (await adminFetch('/rest/v1/students?select=id&class_id=eq.' + hifz.id)).map((r) => r.id),
  );
  check('B. and nobody outside it', classRows.every((r) => hifzIds.has(r.student_id)));

  // C. the whole madrasa, stated explicitly
  const preview = await call('issue-invoices', issuer, {
    feeStructureId: perAll,
    scope: 'madrasa',
    preview: true,
  });
  check(
    'C. preview counts the enrolled',
    preview.body.eligible === activeCount,
    `${preview.body.eligible} of ${activeCount}`,
  );
  check('C. preview writes nothing', (await invoicesFor(perAll)).length === 0);
  const all = await call('issue-invoices', issuer, {
    feeStructureId: perAll,
    scope: 'madrasa',
    dueDate: '2026-12-01',
  });
  const allRows = await invoicesFor(perAll);
  check(
    'C. madrasa run bills every enrolled pupil',
    allRows.length === activeCount,
    `${allRows.length} of ${activeCount}`,
  );
  check(
    'C. preview total matched what was issued',
    all.body.created === preview.body.toIssue,
    `${all.body.created} vs ${preview.body.toIssue}`,
  );

  // The rule that used to be missing: no target at all must not mean everyone.
  const untargeted = await call('issue-invoices', issuer, { feeStructureId: perAll });
  check(
    '   a request with no target is refused',
    untargeted.status === 400,
    `HTTP ${untargeted.status}`,
  );

  // A fee that belongs to one class cannot be widened into a madrasa run.
  const widened = await call('issue-invoices', issuer, {
    feeStructureId: perClass,
    scope: 'madrasa',
  });
  check(
    '   a class fee cannot be billed madrasa-wide',
    widened.status === 400,
    `HTTP ${widened.status} ${widened.body.code ?? ''}`,
  );

  // D. another madrasa's pupil and another madrasa's class
  const cross = await call('issue-invoices', issuer, {
    feeStructureId: perAll,
    scope: 'student',
    studentId: tenant.studentId,
  });
  check(
    'D. a pupil from another madrasa is refused',
    cross.status === 404,
    `HTTP ${cross.status}`,
  );
  check(
    'D. and no invoice was raised for them',
    (await adminFetch(
      '/rest/v1/invoices?select=id&student_id=eq.' + tenant.studentId,
    )).length === 0,
  );
  const foreignFee = (await adminFetch('/rest/v1/fee_structures', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      madrasa_id: tenant.madrasaId,
      name: 'VERIFY foreign fee',
      academic_year: new Date().getFullYear(),
      term: 'Verification',
      amount: 100,
      currency: 'KES',
      applies_to: 'all',
    }),
  }))[0];
  created.feeStructures.push(foreignFee.id);
  const crossFee = await call('issue-invoices', issuer, {
    feeStructureId: foreignFee.id,
    scope: 'madrasa',
  });
  check(
    "D. another madrasa's fee structure is invisible",
    crossFee.status === 404,
    `HTTP ${crossFee.status}`,
  );

  // E. callers who may not bill
  const byParent = await call('issue-invoices', parent, {
    feeStructureId: perAll,
    scope: 'madrasa',
  });
  check('E. a parent cannot issue invoices', byParent.status === 403, `HTTP ${byParent.status}`);
  const byStudent = await call('issue-invoices', student, {
    feeStructureId: perAll,
    scope: 'madrasa',
  });
  check('E. a student cannot issue invoices', byStudent.status === 403, `HTTP ${byStudent.status}`);

  // Re-running a batch must not double-bill.
  const rerun = await call('issue-invoices', issuer, {
    feeStructureId: perClass,
    scope: 'class',
    dueDate: '2026-12-01',
  });
  check('   a repeated run raises nothing', rerun.body.created === 0, `${rerun.body.created}`);
  check(
    '   and reports who was skipped',
    rerun.body.alreadyBilled === hifzCount,
    `${rerun.body.alreadyBilled}`,
  );
  check(
    '   leaving the invoice count unchanged',
    (await invoicesFor(perClass)).length === hifzCount,
  );

  // F. numbering
  const numbers = (await adminFetch(
    '/rest/v1/invoices?select=invoice_no&madrasa_id=eq.' + madrasa.id,
  )).map((r) => r.invoice_no);
  check(
    'F. every invoice number is unique',
    new Set(numbers).size === numbers.length,
    `${numbers.length} invoice(s)`,
  );
  check('F. all follow the per-madrasa format', numbers.every((n) => /^INV-\d{4}-\d{4}$/.test(n)));

  // G. nothing that existed before was altered
  const after = await adminFetch(
    '/rest/v1/invoices?select=id,invoice_no,amount_due,student_id&madrasa_id=eq.' + madrasa.id,
  );
  const byId = new Map(after.map((r) => [r.id, r]));
  check(
    'G. invoices that existed before are untouched',
    before.every((b) => {
      const now = byId.get(b.id);
      return (
        now &&
        now.invoice_no === b.invoice_no &&
        now.amount_due === b.amount_due &&
        now.student_id === b.student_id
      );
    }),
    `${before.length} pre-existing invoice(s) compared`,
  );

  // -------------------------------------------------- teacher management
  //
  // Adding a teacher creates a login, so the interesting question is who may
  // do it. `requireOwner` guards this endpoint and had no callers anywhere
  // before now, so its behaviour is asserted here rather than assumed — in
  // particular that an ordinary teacher is refused, which is the case that
  // separates it from `requireStaff`.
  console.log('\ninvite-teacher');

  const staffTeacher = await signIn('fatuma@annur.example');

  const inviteEmail = `fixture-teacher-${randomUUID().slice(0, 8)}@digital-madrasa.test`;
  const invitePayload = {
    fullName: 'Fixture Teacher',
    email: inviteEmail,
    specialisation: 'Tajweed',
    qiraahStyles: ['hafs'],
  };

  // G. unauthenticated
  const anon = await fetch(`${FN}/invite-teacher`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(invitePayload),
  });
  check('G. unauthenticated refused', anon.status === 401, `HTTP ${anon.status}`);

  // C / D. roles that are not staff at all
  const asParentInvite = await call('invite-teacher', parent, invitePayload);
  check('C. a parent cannot add staff', asParentInvite.status === 403,
        `HTTP ${asParentInvite.status}`);
  const asStudentInvite = await call('invite-teacher', student, invitePayload);
  check('D. a student cannot add staff', asStudentInvite.status === 403,
        `HTTP ${asStudentInvite.status}`);

  // E. staff, but not the owner — the distinction requireOwner exists for
  const asTeacherInvite = await call('invite-teacher', staffTeacher, invitePayload);
  check('E. an ordinary teacher cannot add staff', asTeacherInvite.status === 403,
        `HTTP ${asTeacherInvite.status}`);

  // F. the platform administrator is not madrasa staff and is refused too;
  // platform administration is a separate surface (madrasa-lifecycle).
  const asAdminInvite = await call('invite-teacher', admin, invitePayload);
  check('F. the platform admin is not madrasa staff', asAdminInvite.status === 403,
        `HTTP ${asAdminInvite.status}`);

  // validation
  const badEmail = await call('invite-teacher', owner, { ...invitePayload, email: 'nope' });
  check('   a malformed address is refused', badEmail.status === 400, `HTTP ${badEmail.status}`);
  const noStyle = await call('invite-teacher', owner, { ...invitePayload, qiraahStyles: [] });
  check('   a missing qiraah is refused', noStyle.status === 400, `HTTP ${noStyle.status}`);

  // A. the owner, in their own madrasa
  const invited = await call('invite-teacher', owner, {
    ...invitePayload,
    // Sent deliberately: the tenant must come from the caller's own staff
    // record, never from the request body.
    madrasaId: tenant.madrasaId,
  });
  check('A. the owner can add staff', invited.status === 201, `HTTP ${invited.status}`);
  if (invited.body.profileId) created.authUsers.unshift(invited.body.profileId);

  check('A. the account is pending until they sign in', invited.body.status === 'invited',
        invited.body.status);
  check('A. an employee number was allocated', /^EMP-\d{3}$/.test(invited.body.employeeNo ?? ''),
        invited.body.employeeNo);
  check('A. no invitation email is claimed', invited.body.deliveredByEmail === false,
        String(invited.body.deliveredByEmail));

  // B. the tenant is the caller's, not the one the body asked for
  check('B. the madrasa comes from the caller, not the request',
        invited.body.madrasaId === madrasa.id && invited.body.madrasaId !== tenant.madrasaId,
        invited.body.madrasaId);
  const storedTeacher = await adminFetch(
    '/rest/v1/teachers?select=madrasa_id,status,is_owner&profile_id=eq.' + invited.body.profileId,
  );
  check('B. and the stored row agrees', storedTeacher[0]?.madrasa_id === madrasa.id);
  check('B. the new teacher is not an owner', storedTeacher[0]?.is_owner === false);

  // duplicates
  const again = await call('invite-teacher', owner, invitePayload);
  check('   the same address twice is refused', again.status === 409, `HTTP ${again.status}`);
  const stillOne = await adminFetch('/rest/v1/profiles?select=id&email=eq.' + inviteEmail);
  check('   and no second account was created', stillOne.length === 1, `${stillOne.length}`);

  // The staff list the screen reads must show them, scoped to this madrasa.
  const listed = await adminFetch(
    '/rest/v1/teachers?select=id,employee_no&madrasa_id=eq.' + madrasa.id + '&deleted_at=is.null',
  );
  check('   the new teacher appears in the madrasa roster',
        listed.some((r) => r.id === invited.body.id), `${listed.length} on staff`);

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
