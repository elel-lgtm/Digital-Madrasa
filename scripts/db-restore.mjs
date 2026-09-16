#!/usr/bin/env node
/**
 * Restores a logical backup produced by db-backup.mjs.
 *
 *   npm run db:restore -- backups/<timestamp>
 *   npm run db:restore -- backups/<timestamp> --verify   # dry run, no writes
 *
 * Assumes the schema exists — run the migrations first. This restores DATA,
 * which is the half git does not cover.
 *
 * Two things this learned the hard way, from an actual failed restore:
 *
 *   1. Column types must be read, not guessed. Writing every array as jsonb
 *      broke every text[] column (features, resource_urls, audience, channel).
 *   2. Triggers must be off. `students` has a BEFORE INSERT trigger that
 *      refuses a supplied admission_no — correct in normal use, fatal when
 *      restoring rows that already have one.
 */
import { existsSync, readFileSync } from 'node:fs';
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

const dir = process.argv[2];
const verifyOnly = process.argv.includes('--verify');

if (!dir || !existsSync(join(dir, '_manifest.json'))) {
  console.error('Usage: node scripts/db-restore.mjs <backup-dir> [--verify]');
  process.exit(1);
}

async function sql(query, attempt = 1) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/timeout|terminated|ECONNRESET/i.test(text) && attempt < 5) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return sql(query, attempt + 1);
    }
    throw new Error(text);
  }
  return JSON.parse(text);
}

/** Parents before children, so foreign keys are satisfiable. */
const ORDER = [
  'subscription_plans', 'profiles', 'madrasas', 'teachers', 'classes', 'students',
  'parents', 'parent_student_links', 'enrollments', 'lessons', 'assignments',
  'submissions', 'hifz_progress', 'recitations', 'tajweed_feedback', 'attendance',
  'grades', 'certificates', 'fee_structures', 'invoices', 'payments',
  'payment_allocations', 'receipts', 'subscriptions', 'subscription_invoices',
  'subscription_payments', 'saved_cards', 'message_threads', 'messages',
  'announcements', 'notifications', 'notification_preferences', 'mail_outbox',
  'feature_flags', 'audit_log', 'admission_counters', 'rate_limits',
];

const manifest = JSON.parse(readFileSync(join(dir, '_manifest.json'), 'utf8'));
console.log(`Backup from ${manifest.takenAt} (project ${manifest.project})`);
if (verifyOnly) console.log('VERIFY ONLY — nothing will be written');
console.log('');

/** Actual column types, so arrays are encoded for the column they land in. */
const typeRows = await sql(
  `select table_name, column_name, data_type
     from information_schema.columns
    where table_schema = 'public'`,
);
const types = {};
for (const r of typeRows) {
  types[r.table_name] ??= {};
  types[r.table_name][r.column_name] = r.data_type;
}

function quote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function literal(value, pgType) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    if (pgType === 'ARRAY') {
      // Postgres array literal: {"a","b"} with backslash and quote escaped.
      const inner = value
        .map((v) => JSON.stringify(String(v)))
        .join(',');
      return quote(`{${inner}}`);
    }
    return `${quote(JSON.stringify(value))}::jsonb`;
  }

  if (typeof value === 'object') return `${quote(JSON.stringify(value))}::jsonb`;
  return quote(value);
}

let restored = 0;
const problems = [];

for (const table of ORDER) {
  const file = join(dir, `${table}.json`);
  if (!existsSync(file)) continue;

  const rows = JSON.parse(readFileSync(file, 'utf8'));
  if (rows.length === 0) continue;

  if (verifyOnly) {
    console.log(`  ${table.padEnd(28)} ${rows.length} row(s) ready`);
    restored += rows.length;
    continue;
  }

  const columns = Object.keys(rows[0]);
  const colTypes = types[table] ?? {};
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));

  try {
    for (const chunk of chunks) {
      const values = chunk
        .map((row) => `(${columns.map((c) => literal(row[c], colTypes[c])).join(',')})`)
        .join(',');

      // session_replication_role=replica disables triggers for this statement
      // batch, which is what lets rows keep their original admission numbers,
      // timestamps and audit entries instead of being regenerated.
      await sql(
        `set session_replication_role = replica;
         insert into public."${table}" (${columns.map((c) => `"${c}"`).join(',')})
         values ${values} on conflict do nothing;
         set session_replication_role = origin;`,
      );
    }
    console.log(`  ${table.padEnd(28)} ${rows.length}`);
    restored += rows.length;
  } catch (error) {
    problems.push(`${table}: ${String(error.message).slice(0, 200)}`);
    console.log(`  ${table.padEnd(28)} FAILED`);
  }
}

console.log(`\n${verifyOnly ? 'Would restore' : 'Restored'} ${restored} rows`);

if (problems.length) {
  console.log('\nProblems:');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

if (!verifyOnly) {
  console.log('\nauth.users are NOT restored here — password hashes are deliberately');
  console.log('not backed up. Recreate logins with the admin API and send resets.');
}
