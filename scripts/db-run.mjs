#!/usr/bin/env node
/**
 * Runs SQL files against the linked Supabase project via the Management API.
 *
 *   node scripts/db-run.mjs supabase/migrations/*.sql
 *
 * Files run in the order given and the script stops at the first failure, so
 * a broken migration cannot be followed by ones that assume it succeeded.
 * Postgres treats each file as a single implicit transaction, so a failure
 * leaves nothing half-applied.
 *
 * Credentials come from supabase/.env and are never printed.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const ENV_PATH = 'supabase/.env';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF;

if (!token) {
  console.error(`SUPABASE_ACCESS_TOKEN missing from ${ENV_PATH}`);
  process.exit(1);
}
if (!ref) {
  console.error('SUPABASE_PROJECT_REF missing — add it to supabase/.env');
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/db-run.mjs <file.sql> [more.sql ...]');
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

let failed = false;

for (const file of files) {
  const label = basename(file);
  process.stdout.write(`→ ${label} … `);
  const sql = readFileSync(file, 'utf8');
  const { ok, status, body } = await runSql(sql);

  if (ok) {
    console.log('ok');
    continue;
  }

  console.log(`FAILED (${status})`);
  const message =
    typeof body === 'string' ? body : (body?.message ?? JSON.stringify(body, null, 2));
  console.error(`\n${message}\n`);
  failed = true;
  break;
}

if (failed) {
  console.error('Stopped at the first failure. Nothing from that file was applied.');
  process.exit(1);
}

console.log(`\n✓ Applied ${files.length} file(s).`);
