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

const created = { paths: [], recitationIds: [] };

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
      created.paths.length + ' object path(s)',
  );
}

console.log(fail === 0
  ? '\n✓ Recitation pipeline and access control behave correctly.'
  : '\n✗ ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
