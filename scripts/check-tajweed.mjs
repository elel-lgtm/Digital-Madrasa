#!/usr/bin/env node
/**
 * Live check of recitation assessment: does the model actually hear the audio?
 *
 *   node scripts/check-tajweed.mjs                     silence, a real recitation, a wrong surah
 *   node scripts/check-tajweed.mjs <file> <surah> <from> <to>    assess one recording of your own
 *
 * Needs GEMINI_API_KEY set as a Supabase secret. Also checks that without
 * the pupil's AI feedback consent nothing is sent or scored; the pupil's
 * consent is restored to what it was.
 *
 * Submits as the test student, exactly as the app does, and removes every row
 * and object it created, by id and by exact path.
 */
import { readFileSync } from 'node:fs';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv('apps/mobile/.env');
const adminEnv = loadEnv('supabase/.env');
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = { apikey: adminEnv.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + adminEnv.SUPABASE_SERVICE_ROLE_KEY };
const PW = (readFileSync('scripts/check-screens.mjs', 'utf8').match(/Madrasa2026[^'"]*/) || [])[0];

let fail = 0;
let inconclusive = 0;
const ck = (label, ok, detail) => {
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + label + (detail ? ' — ' + detail : ''));
  if (!ok) fail += 1;
};

const created = { paths: [], ids: [] };

const signed = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'aisha.hassan@annur.example', password: PW }),
}).then((r) => r.json());
const token = signed.access_token;
if (!token) throw new Error('Could not sign in as the test student.');

async function fn(body) {
  const r = await fetch(URL_BASE + '/functions/v1/evaluate-recitation', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function assess(audio, contentType, surahNo, ayahFrom, ayahTo) {
  const up = await fn({ action: 'upload-url', contentType });
  if (up.status !== 200) throw new Error('upload-url: HTTP ' + up.status + ' ' + JSON.stringify(up.body));
  created.paths.push(up.body.path);
  const put = await fetch(up.body.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, apikey: ANON, Authorization: 'Bearer ' + token },
    body: audio,
  });
  if (!put.ok) throw new Error('upload: HTTP ' + put.status);

  const started = Date.now();
  const res = await fn({ action: 'evaluate', storagePath: up.body.path, durationMs: 10000, surahNo, ayahFrom, ayahTo });
  if (res.status !== 201) throw new Error('evaluate: HTTP ' + res.status + ' ' + JSON.stringify(res.body));
  created.ids.push(res.body.id);
  console.log(`    ${res.body.assessment}, model ${res.body.modelVersion}, score ${res.body.overallScore}, ` +
    `${res.body.findings.length} finding(s), ${Date.now() - started} ms`);
  for (const f of res.body.findings) console.log(`      ayah ${f.ayah}, word ${f.word_index}, ${f.rule} (${f.severity}): ${f.note}`);
  return res.body;
}

/**
 * Google's models were busy: the recitation was correctly saved unassessed,
 * but that says nothing about how well assessment works. Not a failure.
 */
function settled(r) {
  if (r.assessment !== 'unavailable') return r;
  console.log('    ~ the AI was unavailable (saved as not assessed); this case is inconclusive');
  inconclusive += 1;
  return null;
}

/** Two seconds of silence as a 16 kHz mono WAV. */
function silentWav(seconds = 2, rate = 16000) {
  const data = Buffer.alloc(seconds * rate * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Surah 112 recited by Mishary Alafasy, one file per ayah (everyayah.com). */
async function recitedIkhlas() {
  const parts = [];
  for (let ayah = 1; ayah <= 4; ayah += 1) {
    const r = await fetch(`https://everyayah.com/data/Alafasy_128kbps/112${String(ayah).padStart(3, '0')}.mp3`);
    if (!r.ok) throw new Error('reference recitation: HTTP ' + r.status);
    parts.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(parts);
}

const usesModel = (r) => r.assessment === 'assessed' && r.modelVersion !== 'none';

// The test pupil's consent, set directly with the service role and put back
// exactly as it was at the end.
const pupil = (await fetch(URL_BASE + '/rest/v1/students?select=id,ai_feedback_consent&profile_id=eq.' + signed.user.id, {
  headers: SERVICE,
}).then((r) => r.json()))[0];
const setConsent = (value) => fetch(URL_BASE + '/rest/v1/students?id=eq.' + pupil.id, {
  method: 'PATCH',
  headers: { ...SERVICE, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ai_feedback_consent: value }),
});

try {
  const [file, surah, from, to] = process.argv.slice(2);
  if (file) {
    console.log(`assessing ${file} as surah ${surah}, ayah ${from} to ${to}`);
    const type = file.endsWith('.mp3') ? 'audio/mpeg' : file.endsWith('.wav') ? 'audio/wav' : 'audio/m4a';
    await setConsent(true);
    const r = settled(await assess(readFileSync(file), type, Number(surah), Number(from), Number(to)));
    if (r) ck('assessed by a model', usesModel(r), r.modelVersion);
  } else {
    console.log('without consent');
    await setConsent(false);
    const none = await assess(silentWav(), 'audio/wav', 112, 1, 4);
    ck('nothing is sent and nothing is scored', none.assessment === 'not_consented' && none.overallScore === null
      && none.modelVersion === 'none' && none.findings.length === 0, `${none.assessment}, score ${none.overallScore}`);

    await setConsent(true);
    console.log('\nsilence');
    const silent = settled(await assess(silentWav(), 'audio/wav', 112, 1, 4));
    if (silent) {
      ck('assessed by a model', usesModel(silent), silent.modelVersion);
      ck('a silent recording scores 0 with no findings', silent.overallScore === 0 && silent.findings.length === 0,
        'score ' + silent.overallScore);
    }

    console.log('\na correct recitation of Al-Ikhlas');
    const audio = await recitedIkhlas();
    const good = settled(await assess(audio, 'audio/mpeg', 112, 1, 4));
    if (good) {
      ck('assessed by a model', usesModel(good), good.modelVersion);
      ck('a correct recitation scores high', good.overallScore >= 80, 'score ' + good.overallScore);
      ck('every finding is about an ayah that was recited', good.findings.every((f) => f.ayah >= 1 && f.ayah <= 4));
    }

    console.log('\nthe same audio, submitted as Al-Falaq');
    const wrong = settled(await assess(audio, 'audio/mpeg', 113, 1, 5));
    if (wrong) {
      ck('assessed by a model', usesModel(wrong), wrong.modelVersion);
      ck('a different passage is not given a passing score', wrong.overallScore <= 30, 'score ' + wrong.overallScore);
    }
  }
} finally {
  console.log('\ncleanup');
  await setConsent(pupil.ai_feedback_consent);
  for (const id of created.ids) {
    const r = await fetch(URL_BASE + '/rest/v1/recitations?id=eq.' + id, { method: 'DELETE', headers: SERVICE });
    if (!r.ok) console.log('  ! recitation ' + id + ': HTTP ' + r.status);
  }
  for (const p of created.paths) {
    const r = await fetch(URL_BASE + '/storage/v1/object/recitations/' + p, { method: 'DELETE', headers: SERVICE });
    if (!r.ok && r.status !== 404 && r.status !== 400) console.log('  ! object ' + p + ': HTTP ' + r.status);
  }
  console.log(`  removed ${created.ids.length} recitation(s) and ${created.paths.length} object(s)`);
}

if (fail > 0) console.log(`\n✗ ${fail} check(s) failed.`);
else if (inconclusive > 0) console.log(`\n~ No failures, but ${inconclusive} case(s) were inconclusive: the AI was busy. Run again later.`);
else console.log('\n✓ Recitations are assessed from the audio, and only with consent.');
process.exit(fail > 0 ? 1 : inconclusive > 0 ? 2 : 0);
