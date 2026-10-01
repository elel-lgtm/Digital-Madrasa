#!/usr/bin/env node
/**
 * API latency under light concurrency, as each role sees it.
 *
 *   npm run perf:api            (defaults: 30 requests per operation, 5 at a time)
 *   PERF_N=60 PERF_C=10 npm run perf:api
 *
 * Signs in as the seeded owner, parent and student and times the reads their
 * home screens make, plus the Edge Functions on hot paths. Everything is a
 * read — nothing is written, so it is safe against the live project — and the
 * concurrency is kept modest because this is the shared project, not a load
 * rig.
 *
 * Reports p50 / p95 / max and the error count per operation, and fails if any
 * request errors or a p95 exceeds its budget. Budgets are round-trip times
 * from a client in East Africa to the hosted project, so they include the
 * network, which dominates; `npm run perf:db` measures the database alone.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const app = loadEnv('apps/mobile/.env');
const URL = app.EXPO_PUBLIC_SUPABASE_URL;
const ANON = app.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const N = Number(process.env.PERF_N ?? 30);
const C = Number(process.env.PERF_C ?? 5);

/** p95 budgets, milliseconds. */
const BUDGET = { rest: 1500, rpc: 1500, edge: 3000 };

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'Madrasa2026!' });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { db: c, token: data.session.access_token };
}

const edge = (who, name, init = {}) => async () => {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    ...init,
    headers: { apikey: ANON, ...(who ? { Authorization: `Bearer ${who.token}` } : {}), ...(init.headers ?? {}) },
  });
  await res.arrayBuffer();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

const query = (builder) => async () => {
  const { error } = await builder();
  if (error) throw new Error(error.message);
};

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function measure(label, kind, fn) {
  const times = [];
  let errors = 0;
  let firstError = '';
  let next = 0;
  const worker = async () => {
    while (next < N) {
      next += 1;
      const t = performance.now();
      try {
        await fn();
        times.push(performance.now() - t);
      } catch (e) {
        errors += 1;
        firstError ||= e instanceof Error ? e.message : String(e);
      }
    }
  };
  await fn().catch(() => {}); // warm the connection; not counted
  await Promise.all(Array.from({ length: C }, worker));
  times.sort((a, b) => a - b);
  const p50 = pct(times, 50) ?? NaN;
  const p95 = pct(times, 95) ?? NaN;
  const max = times.at(-1) ?? NaN;
  const ok = errors === 0 && p95 <= BUDGET[kind];
  console.log(
    `  ${ok ? '✓' : '✗'} ${label.padEnd(38)} p50 ${p50.toFixed(0).padStart(5)}  p95 ${p95.toFixed(0).padStart(5)}  max ${max
      .toFixed(0)
      .padStart(5)} ms  ${errors ? `${errors} error(s): ${firstError}` : ''}${p95 > BUDGET[kind] ? `  (budget ${BUDGET[kind]})` : ''}`,
  );
  return ok;
}

const owner = await signIn('owner@annur.example');
const parent = await signIn('parent@example.com');
const student = await signIn('dm-2025-0001@annur.example');
const { data: aClass } = await owner.db.from('classes').select('id').limit(1).single();

console.log(`\nAPI latency — ${N} requests per operation, ${C} concurrent\n`);
const results = [];

console.log('owner');
results.push(await measure('students + profiles', 'rest', query(() =>
  owner.db.from('students').select('id, admission_no, profiles!students_profile_id_fkey(full_name)').is('deleted_at', null))));
results.push(await measure('open invoices', 'rest', query(() =>
  owner.db.from('invoices').select('id, amount_due, amount_paid, status').in('status', ['issued', 'partially_paid', 'overdue']))));
results.push(await measure('today’s attendance', 'rest', query(() =>
  owner.db.from('attendance').select('student_id, status').eq('session_date', new Date().toISOString().slice(0, 10)))));
results.push(await measure('subscription', 'rest', query(() =>
  owner.db.from('subscriptions').select('*, subscription_plans(*)').maybeSingle())));
results.push(await measure('edge: attendance-qr token', 'edge', edge(owner, `attendance-qr?classId=${aClass.id}`)));

console.log('\nparent');
results.push(await measure('children’s invoices', 'rest', query(() =>
  parent.db.from('invoices').select('id, amount_due, amount_paid, status, due_date'))));
results.push(await measure('inbox', 'rest', query(() =>
  parent.db.from('notifications').select('*').neq('type', 'message').order('created_at', { ascending: false }).limit(50))));
results.push(await measure('payments + receipts', 'rest', query(() =>
  parent.db.from('payments').select('*, payment_allocations(invoice_id), receipts(receipt_no)').limit(100))));

console.log('\nstudent');
results.push(await measure('memorisation', 'rest', query(() =>
  student.db.from('hifz_progress').select('*'))));
results.push(await measure('assignments', 'rest', query(() =>
  student.db.from('assignments').select('id, title, due_at').is('deleted_at', null))));

console.log('\npublic');
results.push(await measure('rpc: verify_certificate (miss)', 'rpc', query(() =>
  createClient(URL, ANON).rpc('verify_certificate', { p_code: 'ZZZZZZZZZZ' }))));
results.push(await measure('edge: health', 'edge', edge(null, 'health')));

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n✗ ${failed} operation(s) over budget or erroring.` : '\n✓ Every operation within budget, no errors.');
process.exit(failed ? 1 : 0);
