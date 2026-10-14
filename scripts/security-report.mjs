#!/usr/bin/env node
/**
 * Security proof report.
 *
 *   npm run security:report
 *
 * Runs every database verification suite (supabase/tests/verify_*.sql)
 * against the live project, each inside a transaction that rolls back, and
 * writes docs/security-report.html: what each suite proves, every guarantee
 * it checks, and whether it held. A suite stops with an error at the first
 * guarantee that fails, so "passed" means every listed guarantee held.
 *
 * Credentials come from supabase/.env through scripts/db-run.mjs and are
 * never printed or written to the report.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = 'supabase/tests';
const OUT = 'docs/security-report.html';

const TITLES = {
  verify_core_guarantees: 'Core guarantees: tenants, roles and children',
  verify_rls_equivalence: 'Row-level security: every reader sees exactly what they should',
  verify_teacher_owner_scope: 'Teachers and owners stay inside their own madrasa',
  verify_recitation_storage_scope: 'Recordings of children are private to their madrasa',
  verify_learning_writes: 'Pupils cannot mark their own work',
  verify_invoice_numbering: 'Invoice numbers are unique and server-made',
  verify_payments: 'Payments: no amount from the client, no double crediting',
  verify_subscription: 'Subscriptions and billing',
  verify_notifications: 'Notifications reach only the right people',
  verify_admin_console: 'Platform admin console',
  verify_ai_consent: 'AI feedback only with a parent’s consent',
  verify_ijazah: 'Ijazah chains cannot be forged',
  verify_heatmap: 'Mistake map: own madrasa only',
  verify_teacher_signals: 'Co-pilot insights: own madrasa only',
  verify_ussd: 'USSD: a phone reaches only its own children',
  verify_sponsorship: 'Sponsorship: anonymous both ways',
  verify_class_videos: 'Video library: teacher-chosen, YouTube only',
  verify_halaqa: 'Live reading room and marks',
  verify_session_access: 'Live sessions and links: own class only',
  verify_messaging: 'Messaging: only parents and their children’s teachers',
  verify_impact: 'Impact dashboard: totals only, scoped',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function describe(file) {
  const text = readFileSync(`${DIR}/${file}`, 'utf8');
  const header = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('--')) break;
    const body = line.replace(/^--\s?/, '');
    if (body.startsWith('npm run') || body.trim() === '') { if (header.length) break; continue; }
    header.push(body);
  }
  const guarantees = [...text.matchAll(/raise notice 'PASS\s+([^']+)'/g)].map((m) => m[1].replace(/''/g, '’').replace(/%/g, 'n'));
  return { summary: header.join(' ').replace(/\s+/g, ' ').trim(), guarantees: [...new Set(guarantees)] };
}

const files = readdirSync(DIR).filter((f) => /^verify_.*\.sql$/.test(f)).sort();
const results = [];
for (const file of files) {
  const started = Date.now();
  let ok = false;
  try {
    const out = execFileSync(process.execPath, ['scripts/db-run.mjs', `${DIR}/${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    ok = /… ok/.test(out);
  } catch {
    ok = false;
  }
  const name = file.replace(/\.sql$/, '');
  results.push({ name, title: TITLES[name] ?? name, ok, ms: Date.now() - started, ...describe(file) });
  console.log(`${ok ? '✓' : '✗'} ${TITLES[name] ?? name}`);
}

const passed = results.filter((r) => r.ok).length;
const guarantees = results.reduce((n, r) => n + r.guarantees.length, 0);
const when = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ILMORA security proof</title>
<style>
  body { font-family: -apple-system, Roboto, 'Segoe UI', sans-serif; margin: 0; background: #FAF5EE; color: #1d1a16; }
  header { background: #0E3B3A; color: #F7F0E1; padding: 28px 24px; }
  header h1 { margin: 0; font-size: 26px; letter-spacing: 3px; }
  header p { margin: 6px 0 0; color: #D4AF37; }
  main { max-width: 860px; margin: 0 auto; padding: 20px 16px 40px; }
  .summary { display: flex; gap: 12px; flex-wrap: wrap; margin: 8px 0 20px; }
  .stat { background: #fff; border: 1px solid #e6dccb; border-radius: 12px; padding: 14px 18px; flex: 1; min-width: 150px; }
  .stat b { display: block; font-size: 28px; }
  .suite { background: #fff; border: 1px solid #e6dccb; border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
  .suite h2 { font-size: 17px; margin: 0 0 6px; display: flex; gap: 10px; align-items: center; }
  .badge { font-size: 12px; padding: 2px 10px; border-radius: 999px; font-weight: 600; }
  .ok { background: #e3f3e3; color: #1f6b2a; } .bad { background: #fde2dd; color: #9a2c16; }
  .suite p { margin: 0 0 8px; color: #5c5145; font-size: 14px; }
  ul { margin: 0; padding-left: 20px; font-size: 14px; } li { margin: 3px 0; }
  footer { color: #7c705f; font-size: 12px; margin-top: 18px; }
</style></head><body>
<header><h1>ILMORA</h1><p>Security proof: database guarantees, checked against the live system</p></header>
<main>
<div class="summary">
  <div class="stat"><b>${passed} / ${results.length}</b>suites passed</div>
  <div class="stat"><b>${guarantees}</b>individual guarantees checked</div>
  <div class="stat"><b>${esc(when)}</b>run on the live database</div>
</div>
<p>Each suite builds its own test madrasas, users and children inside a database transaction, signs in as each kind of user (pupil, parent, teacher, owner, another madrasa, platform admin), tries what that user should and should not be able to do, and then rolls everything back. Nothing is left behind. A suite stops at the first guarantee that does not hold.</p>
${results.map((r) => `<section class="suite"><h2>${esc(r.title)} <span class="badge ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'PASSED' : 'FAILED'}</span></h2>
<p>${esc(r.summary)}</p>
${r.guarantees.length ? `<ul>${r.guarantees.map((g) => `<li>${esc(g.charAt(0).toUpperCase() + g.slice(1))}</li>`).join('')}</ul>` : ''}
</section>`).join('\n')}
<footer>Generated by <code>npm run security:report</code> from supabase/tests. Source: Digital Madrasa Mobile Application (ILMORA).</footer>
</main></body></html>
`;
writeFileSync(OUT, html);
console.log(`\n${passed}/${results.length} suites passed, ${guarantees} guarantees. Report: ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
