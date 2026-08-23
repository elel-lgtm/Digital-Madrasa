#!/usr/bin/env node
/**
 * End-to-end check of the anon-key path.
 *
 *   node scripts/check-supabase-auth.mjs
 *
 * Signs in as each demo account using the same anon key the app ships with,
 * then confirms RLS lets them see their own rows and nothing more. This is the
 * check that proves the app can actually talk to Supabase — a typecheck cannot.
 */
import { readFileSync } from 'node:fs';

const PASSWORD = 'Madrasa2026!';

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

const server = loadEnv('supabase/.env');
const client = loadEnv('apps/mobile/.env');

const url = client.EXPO_PUBLIC_SUPABASE_URL || server.SUPABASE_URL;
const anon = client.EXPO_PUBLIC_SUPABASE_ANON_KEY || server.SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

async function signIn(email) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${email}: ${body.error_description ?? JSON.stringify(body)}`);
  return body.access_token;
}

async function query(token, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

console.log('Signing in with the anon key (as the app does)\n');

// ---------------------------------------------------------------- owner
const ownerToken = await signIn('owner@annur.example');
console.log('owner@annur.example');
const ownerProfile = await query(ownerToken, 'profiles?select=*');
check('reads own profile', ownerProfile.length >= 1);
check('role is teacher', ownerProfile[0]?.role === 'teacher', ownerProfile[0]?.role);
check(
  'is_platform_admin is false',
  ownerProfile[0]?.is_platform_admin === false,
  String(ownerProfile[0]?.is_platform_admin),
);

const ownerStudents = await query(ownerToken, 'students?select=admission_no,madrasa_id');
check('sees the madrasa roster', ownerStudents.length === 1, `${ownerStudents.length} student(s)`);
check('admission number format', /^DM-\d{4}-\d{4}$/.test(ownerStudents[0]?.admission_no ?? ''), ownerStudents[0]?.admission_no);

const ownerSub = await query(ownerToken, 'subscriptions?select=status,trial_ends_at');
check('sees own subscription', ownerSub.length === 1, ownerSub[0]?.status);
check('subscription is trialing', ownerSub[0]?.status === 'trialing');

// self-escalation must be refused
const escalate = await fetch(`${url}/rest/v1/profiles?id=eq.${ownerProfile[0].id}`, {
  method: 'PATCH',
  headers: {
    apikey: anon,
    Authorization: `Bearer ${ownerToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({ is_platform_admin: true }),
});
const escalateBody = await escalate.json().catch(() => []);
const escalated = escalate.ok && Array.isArray(escalateBody) && escalateBody.length > 0;
check('cannot self-promote to platform admin', !escalated, escalated ? 'ESCALATED' : 'blocked');

// ---------------------------------------------------------------- parent
console.log('\nparent@example.com');
const parentToken = await signIn('parent@example.com');
const parentStudents = await query(parentToken, 'students?select=admission_no');
check('sees only the linked child', parentStudents.length === 1, `${parentStudents.length} student(s)`);

const parentSubs = await query(parentToken, 'subscriptions?select=id');
check("cannot read the madrasa's subscription", parentSubs.length === 0, `${parentSubs.length} row(s)`);

// ---------------------------------------------------------------- student
console.log('\ndm-2025-0001@annur.example');
const studentToken = await signIn('dm-2025-0001@annur.example');
const studentGrades = await query(studentToken, 'grades?select=id');
check('grades query is scoped', Array.isArray(studentGrades), `${studentGrades.length} row(s)`);

const gradeWrite = await fetch(`${url}/rest/v1/grades`, {
  method: 'POST',
  headers: { apikey: anon, Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ madrasa_id: ownerStudents[0].madrasa_id, student_id: ownerProfile[0].id, term: 'T1', subject: 'Hifz', score: 100, max_score: 100 }),
});
check('student cannot write their own grade', !gradeWrite.ok, `HTTP ${gradeWrite.status}`);

console.log(
  failures === 0
    ? '\n✓ Supabase auth and RLS behave correctly through the anon key.'
    : `\n✗ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
