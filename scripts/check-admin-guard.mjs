#!/usr/bin/env node
/**
 * Proves the platform-admin flag cannot be changed from a client session.
 *
 *   node scripts/check-admin-guard.mjs
 *
 * This is the highest-value security test in the project: the flag grants read
 * access to every madrasa's children. It is tested against the live database
 * through the anon key, exactly as an attacker would reach it.
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

/** The platform admin the checks sign in as, from supabase/.env (never committed). */
function adminCredentials() {
  const e = loadEnv('supabase/.env');
  if (!e.ADMIN_TEST_EMAIL || !e.ADMIN_TEST_PASSWORD) {
    throw new Error('supabase/.env is missing ADMIN_TEST_EMAIL or ADMIN_TEST_PASSWORD');
  }
  return { email: e.ADMIN_TEST_EMAIL, password: e.ADMIN_TEST_PASSWORD };
}

const client = loadEnv('apps/mobile/.env');
const url = client.EXPO_PUBLIC_SUPABASE_URL;
const anon = client.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const ADMIN = adminCredentials();
const OWNER = { email: 'owner@annur.example', password: 'Madrasa2026!' };

async function signIn({ email, password }) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${email}: ${body.error_description ?? JSON.stringify(body)}`);
  return body;
}

async function patchProfile(token, id, patch) {
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body) ? body.length : 0;
  return { ok: res.ok && rows > 0, status: res.status, rows };
}

async function readFlag(token, id) {
  const res = await fetch(`${url}/rest/v1/profiles?select=is_platform_admin&id=eq.${id}`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body[0]?.is_platform_admin ?? null;
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const admin = await signIn(ADMIN);
const owner = await signIn(OWNER);

console.log('platform admin');
const demote = await patchProfile(admin.access_token, admin.user.id, {
  is_platform_admin: false,
});
check('cannot demote self (lockout protection)', !demote.ok, `HTTP ${demote.status}`);
check('flag survived', (await readFlag(admin.access_token, admin.user.id)) === true);

const promote = await patchProfile(admin.access_token, owner.user.id, {
  is_platform_admin: true,
});
check('cannot promote another user', !promote.ok, `HTTP ${promote.status}`);

const roleChange = await patchProfile(admin.access_token, owner.user.id, { role: 'admin' });
check('cannot change another user\'s role', !roleChange.ok, `HTTP ${roleChange.status}`);

const deactivate = await patchProfile(admin.access_token, owner.user.id, { is_active: false });
check('CAN deactivate a user (legitimate)', deactivate.ok, `HTTP ${deactivate.status}`);
await patchProfile(admin.access_token, owner.user.id, { is_active: true });

console.log('\nmadrasa owner');
const selfPromote = await patchProfile(owner.access_token, owner.user.id, {
  is_platform_admin: true,
});
check('cannot self-promote', !selfPromote.ok, `HTTP ${selfPromote.status}`);

const ownName = await patchProfile(owner.access_token, owner.user.id, {
  full_name: 'Ustadh Abdirahman Hassan',
});
check('CAN edit own name (legitimate)', ownName.ok, `HTTP ${ownName.status}`);

console.log(
  failures === 0
    ? '\n✓ The admin flag is unreachable from any client session.'
    : `\n✗ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
