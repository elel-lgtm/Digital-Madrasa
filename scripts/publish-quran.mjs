#!/usr/bin/env node
/**
 * Publishes the offline-library juz files to the `quran` Storage bucket.
 *
 *   npm run quran:publish
 *
 * The one PUBLIC bucket in the project, and deliberately so: it holds only
 * the Quran text (supabase/seed/quran, built by build-quran-juz.mjs), which is
 * published scripture with no personal data, and the app must be able to
 * fetch it before a family has any account. Clients can read it; only the
 * service role can write, because no Storage policy grants anyone else
 * INSERT or UPDATE on it.
 *
 * Idempotent: the bucket is created if missing and every file is upserted.
 */
import { readFileSync, readdirSync } from 'node:fs';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv('supabase/.env');
const BASE = env.SUPABASE_URL;
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
const DIR = 'supabase/seed/quran';

async function call(path, init) {
  const res = await fetch(BASE + path, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const bucket = { id: 'quran', name: 'quran', public: true, file_size_limit: 512 * 1024, allowed_mime_types: ['application/json'] };
let r = await call('/storage/v1/bucket', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(bucket),
});
if (!r.ok && !/already exists/i.test(r.text)) throw new Error(`create bucket: ${r.status} ${r.text.slice(0, 160)}`);
r = await call('/storage/v1/bucket/quran', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(bucket),
});
if (!r.ok) throw new Error(`update bucket: ${r.status} ${r.text.slice(0, 160)}`);
console.log('  bucket quran: public, JSON only, 512 KB limit');

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
for (const file of files) {
  const body = readFileSync(`${DIR}/${file}`);
  const res = await call(`/storage/v1/object/quran/${file}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      // The text never changes; the manifest may, so it is cached briefly.
      'Cache-Control': file === 'manifest.json' ? 'max-age=300' : 'max-age=31536000',
    },
    body,
  });
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.text.slice(0, 160)}`);
}
console.log(`  uploaded ${files.length} files`);

// Read one back the way the app does: a public URL with no credentials.
const check = await fetch(`${BASE}/storage/v1/object/public/quran/manifest.json`);
const manifest = await check.json();
console.log(`  public read ok: ${check.status}, ${manifest.juz.length} juz listed`);
