#!/usr/bin/env node
/**
 * End-to-end check of the learning writes (migration 0023) through the real
 * API, signed in as the seeded owner, the student Aisha and a signed-out
 * caller:
 *
 *   memorisation update → written hand-in → teacher mark → certificate issue
 *   → public verification → withdrawal
 *
 * Everything this run creates is recorded by id and removed in `finally`
 * with the service-role key — never by name or by a wider predicate.
 *
 *   npm run check:learning
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const app = loadEnv('apps/mobile/.env');
const admin = loadEnv('supabase/.env');
const URL = app.EXPO_PUBLIC_SUPABASE_URL;
const ANON = app.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'Madrasa2026!';

const client = () => createClient(URL, ANON, { auth: { persistSession: false } });
async function as(email) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

async function adminDelete(table, column, value) {
  const res = await fetch(`${admin.SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`, {
    method: 'DELETE',
    headers: {
      apikey: admin.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${admin.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${table} ${res.status}`);
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const created = { hifz: null, submission: null, certificate: null };

try {
  const owner = await as('owner@annur.example');
  const aisha = await as('aisha.hassan@annur.example');
  const anon = client();

  const { data: student } = await aisha.from('students').select('id, madrasa_id, class_id').single();
  const { data: assignment } = await aisha
    .from('assignments')
    .select('id, title')
    .eq('assignment_type', 'written')
    .eq('class_id', student.class_id)
    .is('deleted_at', null)
    .limit(1)
    .single();

  console.log('\nmemorisation');
  // Al-Fatihah is not in the seed for this student, so the row is new and ours.
  const { data: existingFatihah } = await owner
    .from('hifz_progress').select('id').eq('student_id', student.id).eq('surah_no', 1).maybeSingle();
  check('fixture surah not already recorded', !existingFatihah);
  const { data: hifz, error: hifzError } = await owner
    .from('hifz_progress')
    .upsert({
      student_id: student.id, madrasa_id: student.madrasa_id, surah_no: 1, ayah_no: 7,
      juz_no: 1, status: 'memorised',
    }, { onConflict: 'student_id,surah_no' })
    .select('id, status').single();
  created.hifz = hifz?.id ?? null;
  check('teacher records memorisation', !hifzError && hifz?.status === 'memorised', hifzError?.message);
  const { error: studentHifz } = await aisha
    .from('hifz_progress')
    .insert({ student_id: student.id, madrasa_id: student.madrasa_id, surah_no: 2, ayah_no: 1, juz_no: 1, status: 'mastered' });
  check('student cannot record own memorisation', Boolean(studentHifz));

  console.log('\nsubmissions');
  const { data: prior } = await aisha
    .from('submissions').select('id').eq('assignment_id', assignment.id).eq('student_id', student.id).maybeSingle();
  check('fixture assignment not already handed in', !prior, assignment.title);
  const { data: sub, error: subError } = await aisha
    .from('submissions')
    .insert({ assignment_id: assignment.id, student_id: student.id, madrasa_id: student.madrasa_id,
              text_body: 'Izhar: ... (verification run)', status: 'graded', score: 100 })
    .select('id, status, score').single();
  created.submission = sub?.id ?? null;
  check('student hands in written work', !subError, subError?.message);
  check('status and score set by the server', sub?.status === 'pending' && sub?.score === null,
    `${sub?.status} / ${sub?.score}`);
  const { data: marked, error: markError } = await owner
    .from('submissions').update({ score: 85, status: 'graded' }).eq('id', sub?.id).select('score, status').single();
  check('teacher marks it', !markError && Number(marked?.score) === 85 && marked?.status === 'graded', markError?.message);
  const { data: afterEdit } = await aisha
    .from('submissions').update({ text_body: 'changed after marking' }).eq('id', sub?.id).select('id');
  check('marked work is locked for the student', (afterEdit ?? []).length === 0);

  console.log('\ncertificates');
  const { data: cert, error: certError } = await owner
    .from('certificates')
    .insert({ student_id: student.id, madrasa_id: student.madrasa_id, kind: 'tajweed_level',
              title: 'Tajweed Level 1 (verification run)', verification_code: 'AAAAAAAAAA' })
    .select('id, verification_code').single();
  created.certificate = cert?.id ?? null;
  check('teacher issues a certificate', !certError, certError?.message);
  check('code issued by the server', /^[A-HJ-NP-Z2-9]{10}$/.test(cert?.verification_code ?? '') &&
    cert?.verification_code !== 'AAAAAAAAAA', cert?.verification_code);
  const { data: seen } = await aisha.from('certificates').select('id').eq('id', cert?.id);
  check('student can see it', (seen ?? []).length === 1);
  const { data: notices } = await owner.rpc('can_read_student', { p_student_id: student.id });
  check('teacher still scoped to the student', notices === true);
  const { data: v1 } = await anon.rpc('verify_certificate', { p_code: cert?.verification_code?.toLowerCase() });
  check('verifies when signed out', v1?.[0]?.valid === true, v1?.[0]?.student_name);
  const { data: v2 } = await anon.rpc('verify_certificate', { p_code: 'ZZZZZZZZZZ' });
  check('unknown code returns nothing', (v2 ?? []).length === 0);
  const { error: editErr } = await owner.from('certificates').update({ title: 'Edited' }).eq('id', cert?.id).select('id');
  const { data: still } = await owner.from('certificates').select('title').eq('id', cert?.id).single();
  check('certificate cannot be edited after issue', still?.title === 'Tajweed Level 1 (verification run)', editErr?.message);
  const { error: sErr } = await aisha.rpc('withdraw_certificate', { p_certificate_id: cert?.id });
  check('student cannot withdraw it', Boolean(sErr));
  const { error: wErr } = await owner.rpc('withdraw_certificate', { p_certificate_id: cert?.id });
  check('teacher withdraws it', !wErr, wErr?.message);
  const { data: v3 } = await anon.rpc('verify_certificate', { p_code: cert?.verification_code });
  check('withdrawn certificate verifies as invalid', v3?.[0]?.valid === false);
} catch (error) {
  failures += 1;
  console.log(`  ✗ ${error.message}`);
} finally {
  const failed = [];
  const drop = async (table, column, id) => {
    if (!id) return;
    try { await adminDelete(table, column, id); } catch (e) { failed.push(`${table} ${id}: ${e.message}`); }
  };
  await drop('notifications', 'payload->>certificate_id', created.certificate);
  await drop('certificates', 'id', created.certificate);
  await drop('submissions', 'id', created.submission);
  await drop('hifz_progress', 'id', created.hifz);
  console.log(failed.length ? `\n! cleanup incomplete:\n  ${failed.join('\n  ')}` : '\n  cleaned up the rows this run created');
}

if (failures) {
  console.log(`\n✗ ${failures} learning check(s) failed.`);
  process.exit(1);
}
console.log('\n✓ Learning writes behave correctly end to end.');
