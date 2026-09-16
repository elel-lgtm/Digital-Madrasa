#!/usr/bin/env node
/**
 * Logical backup of every table in `public`.
 *
 *   npm run db:backup                 # writes backups/<timestamp>/
 *   npm run db:backup -- --out path   # somewhere else
 *
 * Why this exists: the free tier has no point-in-time recovery and no
 * automatic snapshots. This project already lost a database once — a paused
 * project restored blank — and only survived because the schema was in git.
 * Schema is covered by migrations; this covers the DATA, which is not.
 *
 * Rows are fetched through the Management API rather than pg_dump because
 * there is no direct Postgres password in this setup. Slower, but it needs
 * nothing installed and works from anywhere with the access token.
 *
 * Restore with scripts/db-restore.mjs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const REF = env.SUPABASE_PROJECT_REF;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

if (!REF || !TOKEN) {
  console.error('SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set in supabase/.env');
  process.exit(1);
}

/** Rows fetched per request. Large enough to be quick, small enough to not time out. */
const PAGE = 500;

async function sql(query, attempt = 1) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    // The API drops connections under load; a backup that gives up on the
    // first blip is not a backup.
    if (/timeout|terminated|ECONNRESET/i.test(text) && attempt < 5) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return sql(query, attempt + 1);
    }
    throw new Error(text);
  }
  return JSON.parse(text);
}

const outFlag = process.argv.indexOf('--out');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = outFlag !== -1 ? process.argv[outFlag + 1] : join('backups', stamp);
mkdirSync(dir, { recursive: true });

console.log(`Backing up project ${REF}`);
console.log(`  -> ${dir}\n`);

// auth.users is included: without it the profiles FK cannot be satisfied on
// restore, and every account would have to be recreated by hand.
const tables = (
  await sql(
    `select tablename from pg_tables where schemaname='public' order by tablename`,
  )
).map((r) => r.tablename);

const manifest = {
  project: REF,
  takenAt: new Date().toISOString(),
  tables: {},
  authUsers: 0,
};

let total = 0;

for (const table of tables) {
  const [{ count }] = await sql(`select count(*)::int as count from public."${table}"`);
  const rows = [];

  for (let offset = 0; offset < count; offset += PAGE) {
    const page = await sql(
      `select * from public."${table}" order by 1 limit ${PAGE} offset ${offset}`,
    );
    rows.push(...page);
  }

  writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
  manifest.tables[table] = rows.length;
  total += rows.length;
  console.log(`  ${table.padEnd(28)} ${rows.length}`);
}

// Auth users, minus anything that would let the dump impersonate someone.
// Password hashes are excluded on purpose: a backup file is not a place to
// keep credentials, and restored users can be sent a reset.
const authUsers = await sql(`
  select id, email, phone, email_confirmed_at, created_at, raw_user_meta_data
    from auth.users order by created_at
`);
writeFileSync(join(dir, '_auth_users.json'), JSON.stringify(authUsers, null, 2));
manifest.authUsers = authUsers.length;
console.log(`  ${'auth.users'.padEnd(28)} ${authUsers.length}`);

writeFileSync(join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`\n✓ ${total} rows across ${tables.length} tables, ${authUsers.length} auth users`);
console.log(`  ${join(dir, '_manifest.json')}`);
