#!/usr/bin/env node
/**
 * Adds a term's worth of realistic learning data to the demo madrasa.
 *
 *   node scripts/seed-learning-data.mjs
 *
 * The AI assistant can only summarise what actually exists in Postgres. With
 * one student and no grades, every question answers "there is no data yet",
 * which tells you nothing about whether the assistant is any good.
 *
 * The data is deliberately uneven — one child doing well, one struggling, one
 * with poor attendance — because a summariser that only ever sees good news is
 * untested. Idempotent: re-running tops up rather than duplicating.
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

async function createUser(email, fullName) {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: 'Madrasa2026!',
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  const body = await res.json();
  if (res.ok) return body.id;

  const found = await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).then((r) => r.json());
  const existing = (found.users ?? []).find((u) => u.email === email);
  if (existing) return existing.id;
  throw new Error(`${email}: ${JSON.stringify(body)}`);
}

// ------------------------------------------------------------------ context
const [madrasa] = await sql(`
  select m.id, m.name,
         (select id from public.classes where madrasa_id = m.id order by created_at limit 1) as class_id,
         (select id from public.teachers where madrasa_id = m.id and is_owner limit 1) as owner_teacher_id,
         -- grades.issued_by references profiles, not teachers.
         (select profile_id from public.teachers where madrasa_id = m.id and is_owner limit 1) as owner_profile_id,
         (select id from public.teachers where madrasa_id = m.id and not is_owner limit 1) as staff_teacher_id,
         (select id from public.parents where madrasa_id = m.id limit 1) as parent_id
    from public.madrasas m
   order by m.created_at limit 1;
`);

if (!madrasa) {
  console.error('No madrasa found. Run `npm run db:seed` first.');
  process.exit(1);
}
console.log(`Madrasa: ${madrasa.name}`);

// -------------------------------------------------------- second class
await sql(`
  insert into public.classes (madrasa_id, name, level, teacher_id, capacity)
  select '${madrasa.id}', 'Tajweed Foundation', 'Beginner', '${madrasa.staff_teacher_id}', 25
  where not exists (
    select 1 from public.classes where madrasa_id = '${madrasa.id}' and name = 'Tajweed Foundation'
  );
`);
const [classes] = await sql(`
  select (select id from public.classes where madrasa_id='${madrasa.id}' and name='Hifz Level 1') as hifz,
         (select id from public.classes where madrasa_id='${madrasa.id}' and name='Tajweed Foundation') as tajweed;
`);

// ---------------------------------------------------------------- students
/**
 * Three profiles the summariser has to tell apart:
 *   Aisha  — strong, consistent
 *   Yusuf  — struggling on tajweed, slipping attendance
 *   Maryam — good work, poor attendance (a different problem to Yusuf's)
 */
const newStudents = [
  { email: 'aisha.hassan@annur.example', name: 'Aisha Hassan Omar', dob: '2014-02-11', gender: 'female' },
  { email: 'yusuf.ibrahim@annur.example', name: 'Yusuf Ibrahim Sheikh', dob: '2013-09-03', gender: 'male' },
  { email: 'maryam.noor@annur.example', name: 'Maryam Abdullahi Noor', dob: '2014-06-27', gender: 'female' },
];

console.log('Creating students…');
const studentIds = {};
for (const s of newStudents) {
  const userId = await createUser(s.email, s.name);
  await sql(`
    insert into public.profiles (id, role, madrasa_id, full_name, email, locale)
    values ('${userId}', 'student', '${madrasa.id}', '${s.name}', '${s.email}', 'en')
    on conflict (id) do nothing;
  `);
  // admission_no comes from the trigger; supplying one is rejected by design.
  await sql(`
    insert into public.students (profile_id, madrasa_id, admission_year, date_of_birth, gender, class_id)
    select '${userId}', '${madrasa.id}', extract(year from now())::int, date '${s.dob}', '${s.gender}', '${classes.hifz}'
    where not exists (select 1 from public.students where profile_id = '${userId}');
  `);
  const [row] = await sql(
    `select id, admission_no from public.students where profile_id = '${userId}';`,
  );
  studentIds[s.name] = row.id;
  console.log(`  ${s.name} — ${row.admission_no}`);
}

const [existing] = await sql(`
  select id from public.students where madrasa_id='${madrasa.id}'
   and profile_id in (select id from public.profiles where email='dm-2025-0001@annur.example');
`);
const ahmedId = existing?.id;

const roster = {
  ahmed: ahmedId,
  aisha: studentIds['Aisha Hassan Omar'],
  yusuf: studentIds['Yusuf Ibrahim Sheikh'],
  maryam: studentIds['Maryam Abdullahi Noor'],
};

// --------------------------------------------------- link the second child
// The parent already has Ahmed. Giving them Yusuf too exercises the
// multi-child switcher and the "which child are you asking about?" path.
await sql(`
  insert into public.parent_student_links
    (parent_id, student_id, madrasa_id, relationship, status, decided_at)
  select '${madrasa.parent_id}', '${roster.yusuf}', '${madrasa.id}', 'mother', 'approved', now()
  where not exists (
    select 1 from public.parent_student_links
     where parent_id = '${madrasa.parent_id}' and student_id = '${roster.yusuf}'
  );
`);
console.log('Linked Yusuf to the demo parent (two children now)');

// ----------------------------------------------------------------- lessons
console.log('Seeding lessons, attendance, grades, hifz…');
await sql(`
insert into public.lessons (madrasa_id, class_id, title, surah_from, ayah_from, surah_to, ayah_to, qiraah_style, scheduled_for, notes)
select * from (values
  ('${madrasa.id}'::uuid, '${classes.hifz}'::uuid, 'Surah Al-Mulk 1-15', 67, 1, 67, 15, 'hafs'::qiraah_style, now() - interval '21 days', 'Focus on the madd in ayah 3.'),
  ('${madrasa.id}'::uuid, '${classes.hifz}'::uuid, 'Surah Al-Mulk 16-30', 67, 16, 67, 30, 'hafs'::qiraah_style, now() - interval '14 days', null),
  ('${madrasa.id}'::uuid, '${classes.hifz}'::uuid, 'Surah An-Naba revision', 78, 1, 78, 40, 'hafs'::qiraah_style, now() - interval '7 days', 'Whole surah from memory.'),
  ('${madrasa.id}'::uuid, '${classes.tajweed}'::uuid, 'Rules of Noon Sakinah', 78, 1, 78, 20, 'hafs'::qiraah_style, now() - interval '10 days', 'Izhar, idgham, iqlab, ikhfa.')
) as v
where not exists (select 1 from public.lessons where madrasa_id='${madrasa.id}' and title='Surah Al-Mulk 1-15');
`);

// -------------------------------------------------------------- attendance
/**
 * Six weeks of Mon/Wed/Sat sessions. Rates are chosen so the summariser has
 * something to actually notice: Maryam and Yusuf are the ones to flag.
 */
const rates = { ahmed: 0.95, aisha: 0.97, yusuf: 0.78, maryam: 0.62 };
const attendanceRows = [];
for (let week = 6; week >= 1; week -= 1) {
  for (const dayOffset of [0, 2, 5]) {
    const date = new Date();
    date.setDate(date.getDate() - week * 7 + dayOffset);
    const iso = date.toISOString().slice(0, 10);
    for (const [name, id] of Object.entries(roster)) {
      if (!id) continue;
      const roll = Math.random();
      const rate = rates[name];
      const status = roll < rate ? 'present' : roll < rate + 0.08 ? 'late' : 'absent';
      attendanceRows.push(
        `('${madrasa.id}','${classes.hifz}','${id}',date '${iso}','${status}'::attendance_status,'manual'::attendance_method)`,
      );
    }
  }
}
await sql(`
  insert into public.attendance (madrasa_id, class_id, student_id, session_date, status, method)
  values ${attendanceRows.join(',')}
  on conflict do nothing;
`);

// ------------------------------------------------------------------ grades
const gradeRows = [];
const subjects = [
  ['Hifz', { ahmed: 82, aisha: 91, yusuf: 64, maryam: 79 }],
  ['Tajweed', { ahmed: 76, aisha: 88, yusuf: 52, maryam: 81 }],
  ['Arabic', { ahmed: 71, aisha: 85, yusuf: 68, maryam: 74 }],
  ['Fiqh', { ahmed: 80, aisha: 90, yusuf: 70, maryam: 77 }],
];
for (const [subject, scores] of subjects) {
  for (const [name, id] of Object.entries(roster)) {
    if (!id) continue;
    gradeRows.push(
      `('${madrasa.id}','${id}','${classes.hifz}','Term 1','${subject}',${scores[name]},100,'${madrasa.owner_profile_id}')`,
    );
  }
}
await sql(`
  insert into public.grades (madrasa_id, student_id, class_id, term, subject, score, max_score, issued_by)
  values ${gradeRows.join(',')}
  on conflict do nothing;
`);

// ------------------------------------------------------------------- hifz
const hifzRows = [];
const juzProgress = { ahmed: 22, aisha: 30, yusuf: 12, maryam: 18 };
for (const [name, id] of Object.entries(roster)) {
  if (!id) continue;
  // Juz 30 counts down from Surah 114, so surah numbers track memorisation.
  for (let i = 0; i < juzProgress[name]; i += 1) {
    const surah = 114 - i;
    const status = i < juzProgress[name] - 4 ? 'mastered' : i < juzProgress[name] - 1 ? 'revising' : 'learning';
    hifzRows.push(
      `('${id}','${madrasa.id}',${surah},1,30,'${status}'::hifz_status,${(0.6 + Math.random() * 0.4).toFixed(2)},now() - interval '${i} days')`,
    );
  }
}
await sql(`
  insert into public.hifz_progress (student_id, madrasa_id, surah_no, ayah_no, juz_no, status, confidence_score, last_revised_at)
  values ${hifzRows.join(',')}
  on conflict do nothing;
`);

const [summary] = await sql(`
  select (select count(*) from public.students where madrasa_id='${madrasa.id}') as students,
         (select count(*) from public.attendance where madrasa_id='${madrasa.id}') as attendance,
         (select count(*) from public.grades where madrasa_id='${madrasa.id}') as grades,
         (select count(*) from public.hifz_progress where madrasa_id='${madrasa.id}') as hifz,
         (select count(*) from public.lessons where madrasa_id='${madrasa.id}') as lessons,
         (select count(*) from public.parent_student_links where madrasa_id='${madrasa.id}' and status='approved') as links;
`);

console.log('\n✓ Learning data seeded');
console.log(`  students ${summary.students} · attendance ${summary.attendance} · grades ${summary.grades}`);
console.log(`  hifz ${summary.hifz} · lessons ${summary.lessons} · approved parent links ${summary.links}`);
