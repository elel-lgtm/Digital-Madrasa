#!/usr/bin/env node
/**
 * Provisions the platform administrator.
 *
 *   node scripts/grant-admin.mjs <email> <password>
 *
 * This is the ONLY way a platform admin comes into existence. There is no
 * signup route, no API endpoint and no Edge Function that can create one —
 * `is_platform_admin` is written here, out of band, and RLS forbids any user
 * from changing their own. That is deliberate: the flag grants read access to
 * every madrasa's children on the platform.
 *
 * Requires the service_role key from supabase/.env, so it can only be run by
 * someone who already has full project access.
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

const env = loadEnv('supabase/.env');
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = env;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/grant-admin.mjs <email> <password>');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters (project policy).');
  process.exit(1);
}

const adminHeaders = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
}

async function findUser(address) {
  const res = await fetch(
    `${url}/auth/v1/admin/users?filter=${encodeURIComponent(address)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const body = await res.json();
  return (body.users ?? []).find((u) => u.email?.toLowerCase() === address.toLowerCase()) ?? null;
}

let user = await findUser(email);

if (user) {
  // Re-running resets the password rather than failing, so this doubles as
  // the recovery path if the admin credential is ever lost.
  const res = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(await res.text());
  console.log(`Existing account found — password reset for ${email}`);
} else {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email,
      password,
      // No inbox round-trip: the operator running this already controls the
      // project, so requiring confirmation adds nothing.
      email_confirm: true,
      user_metadata: { full_name: 'Platform Administrator' },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  user = body;
  console.log(`Created auth user for ${email}`);
}

// The profile carries the admin role and, crucially, no madrasa_id — a
// platform admin belongs to no tenant and is scoped by the flag alone.
await sql(`
  insert into public.profiles (id, role, madrasa_id, full_name, email, is_platform_admin, is_active)
  values ('${user.id}', 'admin', null, 'Platform Administrator',
          '${email.replace(/'/g, "''")}', true, true)
  on conflict (id) do update
    set role = 'admin',
        madrasa_id = null,
        is_platform_admin = true,
        is_active = true;
`);

const [row] = await sql(`
  select role::text as role, is_platform_admin, madrasa_id, email
    from public.profiles where id = '${user.id}';
`);

console.log('\nPlatform administrator provisioned:');
console.log(`  email               ${row.email}`);
console.log(`  role                ${row.role}`);
console.log(`  is_platform_admin   ${row.is_platform_admin}`);
console.log(`  madrasa_id          ${row.madrasa_id ?? 'null (belongs to no tenant)'}`);

if (row.is_platform_admin !== true) {
  console.error('\n✗ Flag was not set. Investigate before relying on this account.');
  process.exit(1);
}
console.log('\n✓ Done. Enable TOTP on this account before real data exists.');
