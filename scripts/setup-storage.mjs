#!/usr/bin/env node
/**
 * Creates the Storage buckets and their access policies.
 *
 *   npm run db:storage
 *
 * Every bucket is PRIVATE. Files are reached through short-lived signed URLs
 * issued by the server, never by a public path — a recitation is a child's
 * voice, and an avatar identifies one. Paths are tenant-scoped as
 * `madrasa/{madrasa_id}/{entity}/{uuid}` so a policy can check the tenant from
 * the path itself.
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
const URL_BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKETS = [
  {
    id: 'recitations',
    public: false,
    file_size_limit: 10 * 1024 * 1024,
    allowed_mime_types: ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'],
  },
  {
    id: 'avatars',
    public: false,
    file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
  },
  {
    id: 'documents',
    public: false,
    file_size_limit: 10 * 1024 * 1024,
    allowed_mime_types: ['application/pdf'],
  },
];

for (const bucket of BUCKETS) {
  const res = await fetch(`${URL_BASE}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: bucket.id, ...bucket }),
  });
  const body = await res.json().catch(() => ({}));
  const already = /already exists/i.test(body.message ?? body.error ?? '');
  console.log(
    `  ${bucket.id.padEnd(14)} ${res.ok ? 'created' : already ? 'exists' : `HTTP ${res.status} ${JSON.stringify(body).slice(0, 80)}`}`,
  );
}

const list = await (
  await fetch(`${URL_BASE}/storage/v1/bucket`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
).json();

console.log(
  `\n  buckets: ${(Array.isArray(list) ? list : []).map((b) => `${b.name}${b.public ? ' (PUBLIC!)' : ''}`).join(', ')}`,
);
