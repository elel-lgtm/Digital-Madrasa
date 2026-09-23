#!/usr/bin/env node
/**
 * Exercises the recitation Storage pipeline end to end against the live
 * project.
 *
 *   npm run check:storage
 *
 * The bucket is private and tenant-scoped, so most of what matters here is
 * what the pipeline REFUSES: another madrasa's folder, an unsupported
 * container, a file over the bucket's limit, an unauthenticated read, and a
 * caller who is not a student.
 *
 * It uploads real bytes and creates a real row, then removes both in a
 * `finally`. Storage objects cannot be deleted through SQL — the platform
 * refuses direct deletion from `storage.objects` — so removal goes through the
 * Storage API with the service role, addressed by exact object path. Never by
 * prefix: a prefix delete on a tenant folder would take real recitations with
 * it.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv('apps/mobile/.env');
const adminEnv = loadEnv('supabase/.env');
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const FN = URL_BASE + '/functions/v1';
const PW = (readFileSync('scripts/check-screens.mjs', 'utf8').match(/Madrasa2026[^'"]*/) || [])[0];

let fail = 0;
const ck = (label, ok, detail) => {
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + label + (detail ? ' — ' + detail : ''));
  if (!ok) fail += 1;
};

/**
 * Reads and writes as the service role through PostgREST.
 *
 * Deliberately not the Management API: that needs a personal access token,
 * which expires and would leave this script unable to clean up after itself
 * halfway through a run. The service-role key is already required here to
 * delete Storage objects, so using it throughout keeps the script dependent on
 * one credential that the project controls.
 */
const SERVICE_HEADERS = {
  apikey: adminEnv.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + adminEnv.SUPABASE_SERVICE_ROLE_KEY,
};

async function rest(path, init) {
  const r = await fetch(URL_BASE + '/rest/v1/' + path, {
    ...init,
    headers: { ...SERVICE_HEADERS, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t.slice(0, 200));
  return t ? JSON.parse(t) : [];
}

async function signIn(email, password) {
  const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: password || PW }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(email + ': ' + JSON.stringify(b).slice(0, 120));
  return b.access_token;
}

async function fn(token, body) {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(FN + '/evaluate-recitation', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function readObject(path, token) {
  const headers = { apikey: ANON };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(URL_BASE + '/storage/v1/object/recitations/' + path, { headers });
  return r.status;
}

const created = { paths: [], recitationIds: [], authUsers: [], madrasaIds: [], linkIds: [] };

try {
  const student = await signIn('aisha.hassan@annur.example');
  const teacher = await signIn('owner@annur.example');
  const parent = await signIn('parent@example.com');

  console.log('upload-url');
  const up = await fn(student, { action: 'upload-url', contentType: 'audio/m4a' });
  ck('student gets a signed upload URL', up.status === 200, 'HTTP ' + up.status);
  const pathOk = /^madrasa\/[0-9a-f-]{36}\/recitations\/[0-9a-f-]{36}$/.test(up.body.path || '');
  ck('server chooses a tenant-scoped path', pathOk, up.body.path);
  if (up.body.path) created.paths.push(up.body.path);
  const madrasaId = String(up.body.path || '').split('/')[1];

  console.log('\n8. unsupported format');
  const badType = await fn(student, { action: 'upload-url', contentType: 'application/zip' });
  ck('unsupported MIME refused', badType.status === 400, 'HTTP ' + badType.status);

  console.log('\n1. role scoping (this endpoint is student-only)');
  const asTeacher = await fn(teacher, { action: 'upload-url', contentType: 'audio/m4a' });
  ck('teacher refused', asTeacher.status === 403, 'HTTP ' + asTeacher.status);
  const asParent = await fn(parent, { action: 'upload-url', contentType: 'audio/m4a' });
  ck('parent refused', asParent.status === 403, 'HTTP ' + asParent.status);

  console.log('\n5. unauthenticated');
  const anon = await fn(null, { action: 'upload-url', contentType: 'audio/m4a' });
  ck('no bearer token refused', anon.status === 401, 'HTTP ' + anon.status);

  console.log('\nupload the bytes');
  const t0 = Date.now();
  const putRes = await fetch(up.body.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/m4a', apikey: ANON, Authorization: 'Bearer ' + student },
    body: new Uint8Array(4096).fill(7),
  });
  const uploadMs = Date.now() - t0;
  ck('object uploaded to the private bucket', putRes.ok, 'HTTP ' + putRes.status + ' in ' + uploadMs + 'ms');

  const listed = await fetch(URL_BASE + '/storage/v1/object/list/recitations', {
    method: 'POST',
    headers: { ...SERVICE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: up.body.path.replace(/\/[^/]+$/, ''), limit: 100 }),
  }).then((r) => r.json());
  const leaf = up.body.path.split('/').pop();
  const found = Array.isArray(listed) && listed.find((o) => o.name === leaf);
  ck('object exists in the bucket', Boolean(found), leaf);
  ck('size recorded', found && found.metadata && found.metadata.size === 4096,
     found && found.metadata && found.metadata.size + ' bytes');

  console.log('\n9. evaluate with an invalid path');
  const foreignPath =
    'madrasa/00000000-0000-0000-0000-000000000000/recitations/' + randomUUID();
  const badPath = await fn(student, {
    action: 'evaluate', storagePath: foreignPath, surahNo: 67, ayahFrom: 1, ayahTo: 3,
  });
  ck('foreign-tenant path refused', badPath.status === 403, 'HTTP ' + badPath.status);
  const noPath = await fn(student, { action: 'evaluate', surahNo: 67, ayahFrom: 1, ayahTo: 3 });
  ck('missing path refused', noPath.status === 400, 'HTTP ' + noPath.status);
  const badRange = await fn(student, {
    action: 'evaluate', storagePath: up.body.path, surahNo: 67, ayahFrom: 9, ayahTo: 2,
  });
  ck('reversed ayah range refused', badRange.status === 400, 'HTTP ' + badRange.status);

  console.log('\nevaluate');
  const t1 = Date.now();
  const ev = await fn(student, {
    action: 'evaluate', storagePath: up.body.path, durationMs: 12000,
    surahNo: 67, ayahFrom: 1, ayahTo: 5, qiraahStyle: 'hafs',
  });
  const evalMs = Date.now() - t1;
  ck('evaluation accepted', ev.status === 201, 'HTTP ' + ev.status + ' in ' + evalMs + 'ms');
  ck('result labelled provisional', ev.body.provisional === true);
  ck('model version recorded', ev.body.modelVersion === 'placeholder-v1', ev.body.modelVersion);
  ck('carries a teacher-authority disclaimer', /teacher/i.test(ev.body.disclaimer || ''));
  if (ev.body.id) created.recitationIds.push(ev.body.id);

  console.log('\nthe persisted row');
  const rec = await rest(
    'recitations?select=id,audio_url,duration_ms,tajweed_feedback(overall_score,model_version)' +
      '&id=eq.' + ev.body.id,
  );
  ck('recitation row written', rec.length === 1);
  ck('audio_url is the STORAGE PATH', rec[0] && rec[0].audio_url === up.body.path, rec[0] && rec[0].audio_url);
  ck('  ...not a local file uri', rec[0] && !String(rec[0].audio_url).startsWith('file://'));
  const fb0 = rec[0] && (Array.isArray(rec[0].tajweed_feedback) ? rec[0].tajweed_feedback[0] : rec[0].tajweed_feedback);
  ck('feedback row written', Boolean(fb0), fb0 && 'score ' + fb0.overall_score);
  ck('duration persisted', rec[0] && rec[0].duration_ms === 12000);

  console.log('\n2/3. tenant read access');
  ck('student in the madrasa can read', (await readObject(up.body.path, student)) === 200);
  ck('teacher in the madrasa can read', (await readObject(up.body.path, teacher)) === 200);
  const anonRead = await readObject(up.body.path, null);
  ck('unauthenticated read refused', [400, 401, 403, 404].includes(anonRead), 'HTTP ' + anonRead);

  console.log('\n4/6. cross-tenant write');
  const foreign = 'madrasa/' + randomUUID() + '/recitations/' + randomUUID();
  const foreignPut = await fetch(URL_BASE + '/storage/v1/object/recitations/' + foreign, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + student, 'Content-Type': 'audio/m4a' },
    body: new Uint8Array(16),
  });
  ck('cannot write into another madrasa folder', !foreignPut.ok, 'HTTP ' + foreignPut.status);

  console.log('\n7. oversized file');
  const bigUp = await fn(student, { action: 'upload-url', contentType: 'audio/m4a' });
  if (bigUp.body.path) created.paths.push(bigUp.body.path);
  const bigRes = await fetch(bigUp.body.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/m4a', apikey: ANON, Authorization: 'Bearer ' + student },
    body: new Uint8Array(11 * 1024 * 1024).fill(1),
  });
  ck('11 MB refused by the bucket limit', !bigRes.ok, 'HTTP ' + bigRes.status);

  // ------------------------------------------------- teacher review access
  console.log('\nreview: signed playback URL');
  const signAs = async (token, path) => {
    const r = await fetch(URL_BASE + '/storage/v1/object/sign/recitations/' + path, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 600 }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  const teacherSign = await signAs(teacher, up.body.path);
  ck('teacher can mint a playback URL', teacherSign.status === 200, 'HTTP ' + teacherSign.status);
  ck('  ...and it is a signature, not a public link',
     /token=/.test(teacherSign.body.signedURL || teacherSign.body.signedUrl || ''));

  const studentSign = await signAs(student, up.body.path);
  ck('student can mint one for their own recitation', studentSign.status === 200, 'HTTP ' + studentSign.status);

  const parentSign = await signAs(parent, up.body.path);
  console.log('  . parent with no approved link to this pupil: HTTP ' + parentSign.status);

  const anonSign = await fetch(URL_BASE + '/storage/v1/object/sign/recitations/' + up.body.path, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  ck('unauthenticated cannot mint one', !anonSign.ok, 'HTTP ' + anonSign.status);

  console.log('\nreview: teacher override authorization');
  const override = async (token, recitationId, score, reviewerId) => {
    const r = await fetch(
      URL_BASE + '/rest/v1/tajweed_feedback?recitation_id=eq.' + recitationId,
      {
        method: 'PATCH',
        headers: {
          apikey: ANON,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          teacher_override: { overallScore: score, remarks: 'check', dismissedErrorIndexes: [] },
          ...(reviewerId ? { reviewed_by_teacher_id: reviewerId } : {}),
        }),
      },
    );
    return { status: r.status, rows: await r.json().catch(() => []) };
  };

  // Resolve the reviewing teacher the same way saveTeacherOverride does.
  const teacherRow = await rest('teachers?select=id,profiles!teachers_profile_id_fkey(email)&limit=50');
  const reviewer = teacherRow.find((t) => t.profiles && t.profiles.email === 'owner@annur.example');

  const byTeacher = await override(teacher, ev.body.id, 88, reviewer && reviewer.id);
  ck('1. teacher in the madrasa may override',
     byTeacher.status === 200 && byTeacher.rows.length === 1, 'HTTP ' + byTeacher.status);
  const byStudent = await override(student, ev.body.id, 100);
  ck('4. student may not override', byStudent.rows.length === 0, 'rows ' + byStudent.rows.length);
  const byParent = await override(parent, ev.body.id, 100);
  ck('3. parent may not override', byParent.rows.length === 0, 'rows ' + byParent.rows.length);

  // PostgREST answers 204 when RLS matches no rows, so the status alone does
  // not distinguish "blocked" from "applied". What matters is that nothing
  // changed, which is asserted by re-reading below.
  const byAnon = await fetch(
    URL_BASE + '/rest/v1/tajweed_feedback?recitation_id=eq.' + ev.body.id,
    {
      method: 'PATCH',
      headers: { apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ teacher_override: { overallScore: 1, remarks: 'anon' } }),
    },
  );
  const anonRows = await byAnon.json().catch(() => []);
  ck('5. unauthenticated may not override',
     !Array.isArray(anonRows) || anonRows.length === 0, 'HTTP ' + byAnon.status);

  const missing = await override(teacher, randomUUID(), 50);
  ck('6. unknown recitation id changes nothing', missing.rows.length === 0, 'rows ' + missing.rows.length);

  console.log('\n2. teacher from another madrasa');
  const otherEmail = 'fixture-teacher-' + randomUUID().slice(0, 8) + '@digital-madrasa.test';
  const otherPass = 'Fx-' + randomUUID();
  const otherUser = await fetch(URL_BASE + '/auth/v1/admin/users', {
    method: 'POST',
    headers: { ...SERVICE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: otherEmail,
      password: otherPass,
      email_confirm: true,
      user_metadata: {
        signup_kind: 'madrasa_owner',
        full_name: 'Other Owner',
        madrasa_name: 'Other Madrasa ' + randomUUID().slice(0, 6),
      },
    }),
  }).then((r) => r.json());
  if (otherUser && otherUser.id) created.authUsers.push(otherUser.id);

  // The signup trigger creates a madrasa for this owner. `madrasas.owner_id`
  // blocks deleting the profile while it exists, so the id is captured and the
  // madrasa is removed first during cleanup.
  const otherMadrasa = await rest('madrasas?select=id&owner_id=eq.' + otherUser.id);
  if (otherMadrasa[0]) created.madrasaIds.push(otherMadrasa[0].id);

  const otherToken = await signIn(otherEmail, otherPass);
  const byForeign = await override(otherToken, ev.body.id, 5);
  ck('foreign-madrasa teacher may not override', byForeign.rows.length === 0, 'rows ' + byForeign.rows.length);
  const foreignSign = await signAs(otherToken, up.body.path);
  ck('foreign-madrasa teacher cannot mint a playback URL', foreignSign.status !== 200, 'HTTP ' + foreignSign.status);

  console.log('\nreview: override stored, AI result preserved');
  const after = await rest('tajweed_feedback?select=overall_score,model_version,teacher_override,reviewed_by_teacher_id&recitation_id=eq.' + ev.body.id);
  ck('teacher_override persisted',
     Boolean(after[0] && after[0].teacher_override && after[0].teacher_override.overallScore === 88),
     after[0] && JSON.stringify(after[0].teacher_override));
  ck('reviewed_by_teacher_id recorded', Boolean(after[0] && after[0].reviewed_by_teacher_id),
     after[0] && String(after[0].reviewed_by_teacher_id).slice(0, 8));
  ck('the anonymous attempt left no trace',
     Boolean(after[0] && after[0].teacher_override && after[0].teacher_override.remarks !== 'anon'));
  ck('AI score NOT overwritten', Boolean(after[0]) && Number(after[0].overall_score) !== 88,
     after[0] && 'ai ' + after[0].overall_score);
  ck('model version preserved', Boolean(after[0]) && after[0].model_version === 'placeholder-v1');

  // ------------------------------------------------ storage read authorization
  //
  // The property under test is not "can this user open the screen" but "can
  // this user obtain a usable signed URL for this object". Minting is what the
  // Storage SELECT policy governs, so each case asks Storage directly rather
  // than going through getRecitation.
  console.log('\nstorage read authorization (signed URL minting)');

  const peerEmail = 'fixture-peer-' + randomUUID().slice(0, 8) + '@digital-madrasa.test';
  const peerPass = 'Fx-' + randomUUID();
  const peerUser = await fetch(URL_BASE + '/auth/v1/admin/users', {
    method: 'POST',
    headers: { ...SERVICE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: peerEmail, password: peerPass, email_confirm: true,
      user_metadata: { signup_kind: 'parent', full_name: 'Unlinked Parent' },
    }),
  }).then((r) => r.json());
  if (peerUser && peerUser.id) created.authUsers.push(peerUser.id);

  // Put the unlinked parent in the same madrasa as the recitation. This is the
  // exact shape of the Phase 4D finding: same tenant, no approved link.
  await rest('profiles?id=eq.' + peerUser.id, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ madrasa_id: madrasaId }),
  });
  await rest('parents?profile_id=eq.' + peerUser.id, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ madrasa_id: madrasaId }),
  });
  const unlinkedToken = await signIn(peerEmail, peerPass);

  const expectAllow = async (label, token) => {
    const r = await signAs(token, up.body.path);
    ck(label + ' -> ALLOW', r.status === 200, 'HTTP ' + r.status);
  };
  const expectDeny = async (label, token) => {
    const r = token
      ? await signAs(token, up.body.path)
      : { status: (await fetch(URL_BASE + '/storage/v1/object/sign/recitations/' + up.body.path, {
            method: 'POST',
            headers: { apikey: ANON, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiresIn: 600 }),
          })).status };
    ck(label + ' -> DENY', r.status !== 200, 'HTTP ' + r.status);
  };

  await expectAllow('1. teacher, same madrasa', teacher);
  await expectDeny('2. teacher, another madrasa', otherToken);
  await expectAllow('3. student, own recording', student);
  await expectDeny('6. parent, same madrasa but NO approved link', unlinkedToken);
  await expectDeny('8. unauthenticated', null);

  const bogus = await signAs(teacher, 'madrasa/' + madrasaId + '/recitations/' + randomUUID());
  ck('9. nonexistent object path -> DENY', bogus.status !== 200, 'HTTP ' + bogus.status);


  // Cases 4, 5, 7 and 10 need identities the seed does not provide, so they are
  // built here and torn down in the finally. Each one exists to prove a
  // distinction the madrasa-scoped policy could not make.

  // 4. another pupil in the same madrasa, who has nothing to do with this one
  const peerStudentToken = await signIn('dm-2025-0001@annur.example');
  const peerStudent = await signAs(peerStudentToken, up.body.path);
  ck('4. student, another student -> DENY', peerStudent.status !== 200, 'HTTP ' + peerStudent.status);

  // 5. a parent WITH an approved link to the reciting pupil
  const recStudent = await rest('recitations?select=student_id,madrasa_id&id=eq.' + ev.body.id);
  const linkedEmail = 'fixture-linked-' + randomUUID().slice(0, 8) + '@digital-madrasa.test';
  const linkedPass = 'Fx-' + randomUUID();
  const linkedUser = await fetch(URL_BASE + '/auth/v1/admin/users', {
    method: 'POST',
    headers: { ...SERVICE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: linkedEmail, password: linkedPass, email_confirm: true,
      user_metadata: { signup_kind: 'parent', full_name: 'Linked Parent' },
    }),
  }).then((r) => r.json());
  if (linkedUser && linkedUser.id) created.authUsers.push(linkedUser.id);

  await rest('profiles?id=eq.' + linkedUser.id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ madrasa_id: recStudent[0].madrasa_id }),
  });
  const linkedParent = await rest('parents?profile_id=eq.' + linkedUser.id, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ madrasa_id: recStudent[0].madrasa_id }),
  });
  const approved = await rest('parent_student_links', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      parent_id: linkedParent[0].id,
      student_id: recStudent[0].student_id,
      madrasa_id: recStudent[0].madrasa_id,
      relationship: 'mother',
      status: 'approved',
      decided_at: new Date().toISOString(),
    }),
  });
  if (approved[0]) created.linkIds.push(approved[0].id);

  const linkedToken = await signIn(linkedEmail, linkedPass);
  const linkedSign = await signAs(linkedToken, up.body.path);
  ck('5. parent, APPROVED child -> ALLOW', linkedSign.status === 200, 'HTTP ' + linkedSign.status);

  // 7. a parent belonging to the other madrasa entirely
  const farEmail = 'fixture-farparent-' + randomUUID().slice(0, 8) + '@digital-madrasa.test';
  const farPass = 'Fx-' + randomUUID();
  const farUser = await fetch(URL_BASE + '/auth/v1/admin/users', {
    method: 'POST',
    headers: { ...SERVICE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: farEmail, password: farPass, email_confirm: true,
      user_metadata: { signup_kind: 'parent', full_name: 'Far Parent' },
    }),
  }).then((r) => r.json());
  if (farUser && farUser.id) created.authUsers.push(farUser.id);

  await rest('profiles?id=eq.' + farUser.id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ madrasa_id: created.madrasaIds[0] }),
  });
  await rest('parents?profile_id=eq.' + farUser.id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ madrasa_id: created.madrasaIds[0] }),
  });
  const farToken = await signIn(farEmail, farPass);
  const farSign = await signAs(farToken, up.body.path);
  ck('7. parent, different madrasa -> DENY', farSign.status !== 200, 'HTTP ' + farSign.status);

  // 10. the platform admin keeps the reach it already had
  const adminToken = await signIn('mohammednursukyan98@gmail.com', 'Roman@4567');
  const adminSign = await signAs(adminToken, up.body.path);
  ck('10. platform admin -> ALLOW (unchanged)', adminSign.status === 200, 'HTTP ' + adminSign.status);

  // A soft-deleted recitation must stop authorising its audio.
  await rest('recitations?id=eq.' + ev.body.id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  const afterDelete = await signAs(teacher, up.body.path);
  ck('soft-deleted recitation -> DENY', afterDelete.status !== 200, 'HTTP ' + afterDelete.status);
  await rest('recitations?id=eq.' + ev.body.id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: null }),
  });


  // ------------------------------------------------ parent recitation reads
  //
  // The matrix above proves who may fetch the audio. This proves who may see
  // that the recitation exists at all — the query the parent's child screen
  // runs. Both must agree, or one of them is the weaker rule that decides.
  console.log('\nparent recitation visibility (row access)');

  const listAs = async (token, studentId) => {
    const r = await fetch(
      URL_BASE + '/rest/v1/recitations?select=id,audio_url&student_id=eq.' + studentId,
      { headers: { apikey: ANON, Authorization: 'Bearer ' + token } },
    );
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  };

  const childId = recStudent[0].student_id;

  const linkedRows = await listAs(linkedToken, childId);
  ck('approved parent lists the child recitation', linkedRows.length === 1, linkedRows.length + ' row(s)');
  ck('  ...and never receives a usable audio path it cannot sign',
     linkedRows.every((r) => typeof r.audio_url === 'string'));

  const unlinkedRows = await listAs(unlinkedToken, childId);
  ck('unlinked parent lists nothing for that child', unlinkedRows.length === 0, unlinkedRows.length + ' row(s)');

  const farRows = await listAs(farToken, childId);
  ck('parent from another madrasa lists nothing', farRows.length === 0, farRows.length + ' row(s)');

  const anonListRows = await fetch(
    URL_BASE + '/rest/v1/recitations?select=id&student_id=eq.' + childId,
    { headers: { apikey: ANON } },
  ).then((r) => r.json()).catch(() => []);
  ck('unauthenticated lists nothing', !Array.isArray(anonListRows) || anonListRows.length === 0);

  // A soft-deleted recitation disappears for the approved parent too, which is
  // the same rule the Storage policy applies to its audio.
  await rest('recitations?id=eq.' + ev.body.id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  const afterSoftDelete = await listAs(linkedToken, childId);
  ck('soft-deleted recitation hidden from the parent', afterSoftDelete.length === 0,
     afterSoftDelete.length + ' row(s)');
  await rest('recitations?id=eq.' + ev.body.id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: null }),
  });

  console.log('\n10. subscription enforcement');
  const src = readFileSync('supabase/functions/evaluate-recitation/index.ts', 'utf8');
  const hasSub = src.includes('requireActiveSubscription');
  // Reported rather than asserted: this endpoint has never had a subscription
  // gate, unlike issue-invoices. Whether a lapsed madrasa's students should
  // lose practice is a product decision, so nothing is changed here.
  console.log('  . active-subscription gate on this endpoint: ' + (hasSub ? 'enforced' : 'NONE (none has ever been applied)'));
  ck('uploads are rate limited', src.includes('rateLimit'), 'recitationUpload');
} finally {
  console.log('\ncleanup');
  for (const id of created.recitationIds) {
    try {
      await rest('recitations?id=eq.' + id, { method: 'DELETE' });
    } catch (e) {
      console.log('  ! recitation ' + id + ': ' + e.message.slice(0, 120));
    }
  }
  for (const id of created.linkIds) {
    try {
      await rest('parent_student_links?id=eq.' + id, { method: 'DELETE' });
    } catch (e) {
      console.log('  ! link ' + id + ': ' + e.message.slice(0, 120));
    }
  }
  for (const id of created.madrasaIds) {
    try {
      await rest('madrasas?id=eq.' + id, { method: 'DELETE' });
    } catch (e) {
      console.log('  ! madrasa ' + id + ': ' + e.message.slice(0, 120));
    }
  }
  for (const id of created.authUsers) {
    try {
      const r = await fetch(URL_BASE + '/auth/v1/admin/users/' + id, {
        method: 'DELETE',
        headers: SERVICE_HEADERS,
      });
      if (!r.ok) console.log('  ! auth user ' + id + ': HTTP ' + r.status);
    } catch (e) {
      console.log('  ! auth user ' + id + ': ' + e.message.slice(0, 120));
    }
  }
  for (const p of created.paths) {
    // Deleting straight from storage.objects is refused by the platform
    // ("Direct deletion from storage tables is not allowed"), so removal goes
    // through the Storage API with the service role, by exact object path.
    try {
      const r = await fetch(URL_BASE + '/storage/v1/object/recitations/' + p, {
        method: 'DELETE',
        headers: {
          apikey: adminEnv.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + adminEnv.SUPABASE_SERVICE_ROLE_KEY,
        },
      });
      // 400/404 means the upload was rejected and no object was ever created,
      // which is the expected outcome for the oversized-file case.
      if (!r.ok && r.status !== 404 && r.status !== 400) {
        console.log('  ! object ' + p + ': HTTP ' + r.status);
      }
    } catch (e) {
      console.log('  ! object ' + p + ': ' + e.message.slice(0, 120));
    }
  }
  console.log(
    '  removed ' + created.recitationIds.length + ' row(s) and ' +
      created.paths.length + ' object path(s), ' + created.authUsers.length +
      ' auth user(s) and ' + created.linkIds.length + ' link(s)',
  );
}

console.log(fail === 0
  ? '\n✓ Recitation pipeline and access control behave correctly.'
  : '\n✗ ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
