#!/usr/bin/env node
/**
 * Exercises the queries behind every screen, as every role.
 *
 *   npm run check:screens
 *
 * The app calls these through the Supabase client; this hits the same REST
 * endpoints with the same anon key and the same JWTs, so a 4xx here is a
 * screen that would show an error on the phone. Anything RLS legitimately
 * hides comes back as an empty list, not a failure — that distinction is the
 * whole point of the check.
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

const env = loadEnv('apps/mobile/.env');
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const ACCOUNTS = [
  ['owner', 'owner@annur.example', 'Madrasa2026!'],
  ['teacher', 'fatuma@annur.example', 'Madrasa2026!'],
  ['parent', 'parent@example.com', 'Madrasa2026!'],
  ['student', 'aisha.hassan@annur.example', 'Madrasa2026!'],
  ['admin', adminCredentials().email, adminCredentials().password],
];

/** table?query -> the screen that would break if it errored. */
const SCREENS = [
  ['Dashboard / Students', 'students?select=id,admission_no,profiles!students_profile_id_fkey(full_name),classes(name)&deleted_at=is.null'],
  ['Classes', 'classes?select=id,name,level,capacity,schedule,teachers(profiles!teachers_profile_id_fkey(full_name))&deleted_at=is.null'],
  ['Staff', 'teachers?select=id,employee_no,is_owner,profiles!teachers_profile_id_fkey(full_name,email)&deleted_at=is.null'],
  ['Lessons', 'lessons?select=id,title,meeting_url,classes(name,teacher_id)&deleted_at=is.null'],
  ['Attendance', 'attendance?select=id,status,session_date,students(profiles!students_profile_id_fkey(full_name))&limit=20'],
  ['Grades', 'grades?select=id,subject,score,max_score,students(profiles!students_profile_id_fkey(full_name))'],
  ['Progress (hifz)', 'hifz_progress?select=id,surah_no,status'],
  ['Assignments', 'assignments?select=id,title,due_at,classes(name)&deleted_at=is.null'],
  ['Fees / Invoices', 'invoices?select=id,invoice_no,amount_due,amount_paid,status,students(admission_no,profiles!students_profile_id_fkey(full_name))'],
  ['Fee structures', 'fee_structures?select=id,name,amount,applies_to&deleted_at=is.null'],
  ['Payments', 'payments?select=id,amount,status,payment_allocations(invoice_id)&limit=20'],
  ['Recitations', 'recitations?select=id,surah_no,students(admission_no,profiles!students_profile_id_fkey(full_name)),tajweed_feedback(overall_score)&limit=20'],
  ['Certificates', 'certificates?select=id,title,verification_code'],
  ['Announcements', 'announcements?select=id,title,audience&deleted_at=is.null'],
  ['Inbox / Notifications', 'notifications?select=id,type,title,read_at&limit=20'],
  ['Messages (threads)', 'message_threads?select=id,last_message_at'],
  ['Messages', 'messages?select=id,body,thread_id&limit=20'],
  ['Notification prefs', 'notification_preferences?select=user_id'],
  ['Parent link requests', 'parent_student_links?select=id,status,relationship'],
  ['Subscription', 'subscriptions?select=id,status,trial_ends_at,subscription_plans(name,amount)'],
  ['Subscription invoices', 'subscription_invoices?select=id,invoice_no,amount_due,status'],
  ['Saved cards', 'saved_cards?select=id,brand,last4&deleted_at=is.null'],
];

async function signIn(email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${email}: ${body.error_description ?? JSON.stringify(body)}`);
  return body.access_token;
}

let failures = 0;

for (const [role, email, password] of ACCOUNTS) {
  let token;
  try {
    token = await signIn(email, password);
  } catch (error) {
    console.log(`\n${role.toUpperCase()}  ✗ sign-in failed — ${error.message}`);
    failures += 1;
    continue;
  }

  const broken = [];
  const counts = [];

  for (const [screen, path] of SCREENS) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      broken.push(`${screen} → HTTP ${res.status} ${body.slice(0, 90)}`);
      continue;
    }
    const rows = await res.json();
    counts.push(`${screen}=${rows.length}`);
  }

  console.log(`\n${role.toUpperCase()} (${email})`);
  if (broken.length === 0) {
    console.log(`  ✓ all ${SCREENS.length} screen queries OK`);
    console.log(`    ${counts.join('  ')}`);
  } else {
    failures += broken.length;
    for (const b of broken) console.log(`  ✗ ${b}`);
  }
}

console.log(
  failures === 0
    ? '\n✓ Every screen query succeeds for every role.'
    : `\n✗ ${failures} failing query/queries.`,
);
process.exit(failures === 0 ? 0 : 1);
