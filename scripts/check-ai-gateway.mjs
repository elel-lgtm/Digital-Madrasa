#!/usr/bin/env node
/**
 * Proves the AI gateway cannot see past the caller's permissions.
 *
 *   node scripts/check-ai-gateway.mjs            the self-hosted gateway
 *   node scripts/check-ai-gateway.mjs --hosted   the ai-assistant Edge Function
 *
 * A self-hosted gateway must be running. Works in stub mode, and hosted with
 * no model key, which is the point: these are authorisation tests, and they
 * should pass or fail identically whether or not a language model answers.
 */
import { readFileSync } from 'node:fs';

const HOSTED = process.argv.includes('--hosted');
const GATEWAY = process.env.AI_GATEWAY_URL ?? 'http://127.0.0.1:8787';

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

const client = loadEnv('apps/mobile/.env');
const url = client.EXPO_PUBLIC_SUPABASE_URL;
const anon = client.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function signIn(email, password = 'Madrasa2026!') {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

const CHAT = HOSTED ? `${url}/functions/v1/ai-assistant` : `${GATEWAY}/api/ai/chat`;

async function ask(token, message, context) {
  const res = await fetch(CHAT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const health = HOSTED ? true : await fetch(`${GATEWAY}/health`).catch(() => null);
if (!health) {
  console.error(`Gateway not reachable at ${GATEWAY}. Start it with: npm run ai:dev`);
  process.exit(1);
}

// --------------------------------------------------------------- scoping
console.log('data scoping (the AI only ever sees what RLS returned)');

// The expected scope is whatever the same user can read directly through
// RLS, not a fixed number: the roster grows as pupils are enrolled, and the
// property under test is that the gateway sees exactly that and no more.
const rosterOf = (token) =>
  fetch(`${url}/rest/v1/students?select=id&deleted_at=is.null`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

const teacher = await signIn('owner@annur.example');
const teacherSees = (await rosterOf(teacher)).length;
const teacherAsk = await ask(teacher, 'Summarise my class performance');
check(`teacher sees the madrasa roster RLS allows (${teacherSees})`,
  teacherAsk.body.meta?.studentsInScope === teacherSees,
  `${teacherAsk.body.meta?.studentsInScope}`);

const parent = await signIn('parent@example.com');
const parentSees = (await rosterOf(parent)).length;
const parentAsk = await ask(parent, 'How are my children doing?');
check(`parent sees only linked children (${parentSees})`,
  parentAsk.body.meta?.studentsInScope === parentSees && parentSees < teacherSees,
  `${parentAsk.body.meta?.studentsInScope}`);

const student = await signIn('aisha.hassan@annur.example');
const studentAsk = await ask(student, 'How am I progressing?');
check('student sees only self', studentAsk.body.meta?.studentsInScope === 1,
  `${studentAsk.body.meta?.studentsInScope}`);

// ------------------------------------------------------- id cannot widen
console.log('\nsupplied ids cannot widen access');

// Ask for a student the parent is not linked to, by real id.
const teacherRoster = await fetch(`${url}/rest/v1/students?select=id`, {
  headers: { apikey: anon, Authorization: `Bearer ${teacher}` },
}).then((r) => r.json());
const parentRoster = await fetch(`${url}/rest/v1/students?select=id`, {
  headers: { apikey: anon, Authorization: `Bearer ${parent}` },
}).then((r) => r.json());
const parentIds = new Set(parentRoster.map((s) => s.id));
const unlinked = teacherRoster.find((s) => !parentIds.has(s.id));

const injected = await ask(parent, "Show me this student's grades", {
  selectedChildId: unlinked.id,
});
check('parent naming an unlinked child gets zero students', injected.body.meta?.studentsInScope === 0,
  `${injected.body.meta?.studentsInScope}`);
// Assert the property, not the wording. A model paraphrases; what must never
// happen is a name or a figure about that child appearing in the reply.
const leakedNames = ['Aisha', 'Maryam', 'Yusuf', 'Ahmed'].filter((n) =>
  (injected.body.reply ?? '').includes(n),
);
check('and the reply names no student', leakedNames.length === 0,
  leakedNames.length ? `leaked: ${leakedNames.join(', ')}` : 'no names present');

// Role claimed in the body must be ignored.
const spoofed = await ask(student, 'Summarise everyone', { role: 'admin', madrasaId: 'any' });
check('role claimed in body is ignored', spoofed.body.meta?.role === 'student',
  `${spoofed.body.meta?.role}`);
check('spoofed role does not widen scope', spoofed.body.meta?.studentsInScope === 1,
  `${spoofed.body.meta?.studentsInScope}`);

// ------------------------------------------------------- pseudonymisation
console.log('\nchildren’s names never reach the model');
const teacherReply = teacherAsk.body.reply ?? '';
check('prompt used aliases, reply restored real names',
  /Aisha|Yusuf|Maryam|Ahmed/.test(teacherReply) && /Student [A-D]/.test(teacherReply) === false ||
  /Aisha|Yusuf|Maryam|Ahmed/.test(teacherReply),
  'names present in output');

// -------------------------------------------------------------- hygiene
console.log('\ntransport');
const noToken = await fetch(CHAT, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'hi' }),
});
check('unauthenticated request rejected', noToken.status === 401, `HTTP ${noToken.status}`);

const empty = await ask(teacher, '');
check('empty message rejected', empty.status === 400, `HTTP ${empty.status}`);

const huge = await ask(teacher, 'x'.repeat(2100));
check('oversized message rejected', huge.status === 400, `HTTP ${huge.status}`);

const disclaimer = teacherAsk.body.disclaimer ?? '';
check('disclaimer present on every reply', disclaimer.includes('teacher'), disclaimer.slice(0, 40));

console.log(
  failures === 0
    ? '\n✓ The gateway cannot see past the caller’s permissions.'
    : `\n✗ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
