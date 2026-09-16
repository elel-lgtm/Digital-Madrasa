#!/usr/bin/env node
/**
 * Runs a one-off SQL query and prints the result as a table.
 *
 *   node scripts/db-query.mjs "select 1 as x"
 *
 * Retries on the transient connection timeouts the management API returns
 * under load, which otherwise look like query failures.
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
const query = process.argv.slice(2).join(' ');
if (!query) {
  console.error('Usage: node scripts/db-query.mjs "<sql>"');
  process.exit(1);
}

async function run(attempt = 1) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();

  if (!res.ok) {
    if (/timeout|terminated/i.test(text) && attempt < 4) {
      await new Promise((r) => setTimeout(r, attempt * 1500));
      return run(attempt + 1);
    }
    console.error(text);
    process.exit(1);
  }
  return JSON.parse(text);
}

const rows = await run();
if (!Array.isArray(rows) || rows.length === 0) {
  console.log('(no rows)');
} else {
  for (const row of rows) {
    console.log(
      Object.entries(row)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('  '),
    );
  }
}
