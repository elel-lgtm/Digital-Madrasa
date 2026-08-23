#!/usr/bin/env node
/**
 * Seeds the Supabase project with the demo madrasa and its accounts.
 *
 *   node scripts/seed-remote.mjs
 *
 * Uses the service_role key, so it runs with RLS bypassed — this is a
 * development convenience and must never be shipped or run against a project
 * holding real families' data. It refuses to run unless the target project
 * looks empty, so it cannot silently clobber live records.
 */
import { readFileSync } from 'node:fs';

const ENV_PATH = 'supabase/.env';
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

const env = loadEnv(ENV_PATH);
const url = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;

if (!url || !serviceKey || !accessToken || !ref) {
  console.error(`Missing values in ${ENV_PATH}.`);
  process.exit(1);
}

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

/** Creates a confirmed auth user via the Admin API. */
async function createUser(email, fullName) {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      // Confirmed up front: these are demo accounts and no inbox exists.
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (/already/i.test(body.msg ?? body.message ?? '')) {
      const found = await fetch(
        `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      ).then((r) => r.json());
      const existing = (found.users ?? []).find((u) => u.email === email);
      if (existing) return existing.id;
    }
    throw new Error(`${email}: ${JSON.stringify(body)}`);
  }
  return body.id;
}

// ---------------------------------------------------------------- guard rail
const [{ count: profileCount }] = await sql('select count(*)::int as count from public.profiles;');
if (profileCount > 0) {
  console.error(
    `Refusing to seed: public.profiles already has ${profileCount} row(s).\n` +
      'This script is only for an empty development project.',
  );
  process.exit(1);
}

console.log('Creating auth users…');
const people = [
  { key: 'owner', email: 'owner@annur.example', name: 'Ustadh Abdirahman Hassan' },
  { key: 'teacher', email: 'fatuma@annur.example', name: 'Ustadha Fatuma Ali' },
  { key: 'parent', email: 'parent@example.com', name: 'Halima Abdi Mohamed' },
  { key: 'student', email: 'dm-2025-0001@annur.example', name: 'Ahmed Abdi Mohamed' },
];

const ids = {};
for (const person of people) {
  ids[person.key] = await createUser(person.email, person.name);
  console.log(`  ${person.email}`);
}

console.log('Seeding madrasa, staff and students…');
await sql(`
do $$
declare
  v_madrasa uuid := gen_random_uuid();
  v_class   uuid := gen_random_uuid();
  v_owner   uuid := '${ids.owner}';
  v_teacher uuid := '${ids.teacher}';
  v_parent  uuid := '${ids.parent}';
  v_student uuid := '${ids.student}';
  v_student_row uuid;
begin
  insert into public.profiles (id, role, madrasa_id, full_name, email, phone, locale) values
    (v_owner,   'teacher', null, 'Ustadh Abdirahman Hassan', 'owner@annur.example',   '+254712000101', 'en'),
    (v_teacher, 'teacher', null, 'Ustadha Fatuma Ali',       'fatuma@annur.example',  '+254712000102', 'en'),
    (v_parent,  'parent',  null, 'Halima Abdi Mohamed',      'parent@example.com',    '+254712000103', 'en'),
    (v_student, 'student', null, 'Ahmed Abdi Mohamed',       'dm-2025-0001@annur.example', null,       'en');

  insert into public.madrasas (id, name, slug, county, town, owner_id,
                               contact_email, contact_phone, status)
  values (v_madrasa, 'Madrasat An-Nur', 'madrasat-an-nur', 'Mandera', 'Mandera Town',
          v_owner, 'owner@annur.example', '+254712000101', 'active');

  update public.profiles set madrasa_id = v_madrasa
   where id in (v_owner, v_teacher, v_parent, v_student);

  insert into public.teachers (profile_id, madrasa_id, employee_no, specialisation, qiraah_styles, is_owner, status) values
    (v_owner,   v_madrasa, 'EMP-001', 'Hifz and Tajweed', array['hafs']::qiraah_style[], true,  'active'),
    (v_teacher, v_madrasa, 'EMP-002', 'Tajweed',          array['hafs']::qiraah_style[], false, 'active');

  insert into public.classes (id, madrasa_id, name, level, teacher_id, capacity)
  select v_class, v_madrasa, 'Hifz Level 1', 'Intermediate', t.id, 20
    from public.teachers t where t.profile_id = v_owner;

  -- admission_no is issued by the trigger; supplying one is rejected.
  insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
  values (v_student, v_madrasa, extract(year from now())::int - 1, date '2013-05-14', 'male', v_class)
  returning id into v_student_row;

  insert into public.parents (profile_id, madrasa_id) values (v_parent, v_madrasa);

  insert into public.parent_student_links (parent_id, student_id, madrasa_id, relationship, status, decided_at, decided_by)
  select p.id, v_student_row, v_madrasa, 'mother', 'approved', now(), v_owner
    from public.parents p where p.profile_id = v_parent;

  insert into public.feature_flags (madrasa_id) values (v_madrasa)
    on conflict do nothing;
end $$;
`);

const [summary] = await sql(`
  select (select count(*) from public.profiles)  as profiles,
         (select count(*) from public.madrasas)  as madrasas,
         (select count(*) from public.students)  as students,
         (select count(*) from public.subscriptions) as subscriptions,
         (select admission_no from public.students limit 1) as admission_no;
`);

console.log('\n✓ Seeded');
console.log(`  profiles: ${summary.profiles}, madrasas: ${summary.madrasas}, students: ${summary.students}`);
console.log(`  subscription rows: ${summary.subscriptions} (trial auto-created)`);
console.log(`  first admission number: ${summary.admission_no}`);
console.log(`\n  Sign in with any of these, password: ${PASSWORD}`);
for (const person of people) console.log(`    ${person.email}`);
