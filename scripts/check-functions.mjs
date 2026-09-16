#!/usr/bin/env node
/**
 * Exercises the deployed Edge Functions with real signed-in users.
 *
 *   npm run check:functions
 *
 * These are the endpoints that perform privileged work, so the checks are as
 * much about what they REFUSE as what they allow.
 */
import { readFileSync } from 'node:fs';

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

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const owner = await signIn('owner@annur.example');
const parent = await signIn('parent@example.com');
const student = await signIn('aisha.hassan@annur.example');
const admin = await signIn('mohammednursukyan98@gmail.com', 'Roman@4567');

console.log('create-student');
const made = await call('create-student', owner, {
  fullName: 'Function Test Pupil',
  dateOfBirth: '2015-04-02',
  gender: 'female',
});
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

console.log(
  failures === 0 ? '\n✓ Deployed functions behave correctly.' : `\n✗ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
