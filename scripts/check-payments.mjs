#!/usr/bin/env node
/**
 * End-to-end check of M-Pesa payments (migration 0024, the `payments` and
 * `payment-callback` Edge Functions) through the deployed API, with the
 * provider in mock mode (MPESA_ENV unset). No real money moves.
 *
 *   fees:          someone else's invoice refused · staff refused
 *                  · a failed prompt credits nothing · a paid prompt credits the
 *                  invoice, issues a receipt and tells the parent · a double tap
 *                  is refused · the callback needs its secret · a replayed
 *                  callback changes nothing
 *   subscription:  a teacher cannot pay · the owner pays → active for a month
 *                  · cancel and resume
 *
 * Everything the run changes is captured first and put back in `finally`
 * with the service-role key, by id: payments (their allocations and receipts
 * cascade), notifications, the subscription invoice and payment, the
 * invoice's amount paid and the subscription row. Audit rows stay — the log
 * is append-only by design.
 *
 * Payment attempts are rate limited (5 per 10 minutes per account), so allow
 * ten minutes between runs.
 *
 *   npm run check:payments
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
const env = loadEnv('supabase/.env');
const URL = app.EXPO_PUBLIC_SUPABASE_URL;
const ANON = app.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'Madrasa2026!';
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

// The seeded parent's approved child has INV-2026-0003 open; DM-2026-0008's
// link is revoked, so its invoice INV-2026-0005 must stay out of reach.
const OPEN_INVOICE_NO = 'INV-2026-0003';
const REVOKED_INVOICE_NO = 'INV-2026-0005';

const client = () => createClient(URL, ANON, { auth: { persistSession: false } });
async function signIn(email) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { db: c, token: data.session.access_token };
}

async function call(who, body) {
  const res = await fetch(`${URL}/functions/v1/payments`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function callback(key, payload) {
  const q = key === null ? '' : `?key=${encodeURIComponent(key)}`;
  const res = await fetch(`${URL}/functions/v1/payment-callback${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function rest(method, path, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} ${res.status}`);
  return text ? JSON.parse(text) : null;
}

async function poll(who, kind, checkoutRequestId, done) {
  const until = Date.now() + 30_000;
  let last;
  while (Date.now() < until) {
    last = await call(who, { action: 'status', kind, checkoutRequestId });
    if (last.status !== 200 || done(last.body)) return last;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const created = { payments: [], subPayments: [], subInvoices: [] };
let invoiceBefore = null;
let subscriptionBefore = null;
const startedAt = new Date().toISOString();

try {
  const parent = await signIn('parent@example.com');
  const owner = await signIn('owner@annur.example');
  const teacher = await signIn('fatuma@annur.example');

  [invoiceBefore] = await rest('GET', `invoices?invoice_no=eq.${OPEN_INVOICE_NO}&select=id,madrasa_id,amount_paid,status`);
  const [revoked] = await rest('GET', `invoices?invoice_no=eq.${REVOKED_INVOICE_NO}&select=id`);
  [subscriptionBefore] = await rest('GET', `subscriptions?madrasa_id=eq.${invoiceBefore.madrasa_id}&select=*`);
  check('fixture invoice is open', ['issued', 'partially_paid', 'overdue'].includes(invoiceBefore.status),
    `${OPEN_INVOICE_NO} ${invoiceBefore.status}`);

  console.log('\nfees — refusals');
  // Card payments have their own check: npm run check:card.
  let r = await call(parent, { action: 'pay-fees', channel: 'mpesa', invoiceIds: [revoked.id], phone: '0712345678' });
  check('invoice of a revoked child is not found', r.status === 404, `${r.status} ${r.body.code}`);

  r = await call(owner, { action: 'pay-fees', channel: 'mpesa', invoiceIds: [invoiceBefore.id], phone: '0712345678' });
  check('staff cannot pay fees', r.status === 403, `${r.status}`);

  r = await call(parent, { action: 'pay-fees', channel: 'mpesa', invoiceIds: [invoiceBefore.id], phone: '12345' });
  check('bad phone number refused', r.status === 400 && r.body.code === 'validation', `${r.status}`);

  console.log('\nfees — a prompt that fails');
  r = await call(parent, { action: 'pay-fees', channel: 'mpesa', invoiceIds: [invoiceBefore.id], phone: '0700009999' });
  if (r.body.paymentId) created.payments.push(r.body.paymentId);
  check('prompt sent', r.status === 200 && r.body.amount === 4500 - Number(invoiceBefore.amount_paid),
    `${r.status} amount ${r.body.amount}`);
  check('phone masked in the reply', /^07\*{5}999$/.test(r.body.phone ?? ''), r.body.phone);
  const failed = await poll(parent, 'fees', r.body.checkoutRequestId, (p) => p.status !== 'pending');
  check('outcome: failed', failed.body.status === 'failed', failed.body.status);
  let [inv] = await rest('GET', `invoices?id=eq.${invoiceBefore.id}&select=amount_paid,status`);
  check('invoice untouched', Number(inv.amount_paid) === Number(invoiceBefore.amount_paid), inv.amount_paid);

  console.log('\nfees — a prompt that is paid');
  r = await call(parent, { action: 'pay-fees', channel: 'mpesa', invoiceIds: [invoiceBefore.id], phone: '0712345678' });
  if (r.body.paymentId) created.payments.push(r.body.paymentId);
  const checkout = r.body.checkoutRequestId;
  check('prompt sent', r.status === 200 && checkout, `${r.status}`);

  const dup = await call(parent, { action: 'pay-fees', channel: 'mpesa', invoiceIds: [invoiceBefore.id], phone: '0712345678' });
  check('second prompt for the same bill refused', dup.status === 409 && dup.body.code === 'payment_in_progress',
    `${dup.status} ${dup.body.code}`);

  const paid = await poll(parent, 'fees', checkout, (p) => p.status !== 'pending');
  check('outcome: success', paid.body.status === 'success', paid.body.status);
  check('receipt issued', /^RCP-\d{4}-\d{6}$/.test(paid.body.receiptNo ?? ''), paid.body.receiptNo);
  check('M-Pesa reference recorded', /^MK[A-Z0-9]{6}$/.test(paid.body.providerRef ?? ''), paid.body.providerRef);

  const { data: seen } = await parent.db.from('invoices').select('amount_paid, status').eq('id', invoiceBefore.id).single();
  check('parent sees the invoice paid', seen?.status === 'paid' && Number(seen.amount_paid) === 4500,
    `${seen?.status} ${seen?.amount_paid}`);
  const { data: notices } = await parent.db
    .from('notifications').select('id').eq('type', 'payment_receipt').eq('payload->>payment_id', paid.body.id);
  check('parent notified once', notices?.length === 1, `${notices?.length}`);

  console.log('\ncallback endpoint');
  r = await callback(null, {});
  check('no secret: rejected', r.status === 401, `${r.status}`);
  r = await callback('wrong', {});
  check('wrong secret: rejected', r.status === 401, `${r.status}`);
  r = await callback(env.MPESA_CALLBACK_SECRET, { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_UNKNOWN', ResultCode: 0 } } });
  check('unknown checkout: accepted, ignored', r.status === 200 && r.body.ResultCode === 0, `${r.status}`);
  r = await callback(env.MPESA_CALLBACK_SECRET, {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkout,
        ResultCode: 0,
        CallbackMetadata: { Item: [{ Name: 'Amount', Value: 4500 }, { Name: 'MpesaReceiptNumber', Value: 'REPLAY0001' }] },
      },
    },
  });
  [inv] = await rest('GET', `invoices?id=eq.${invoiceBefore.id}&select=amount_paid`);
  const [payRow] = await rest('GET', `payments?checkout_request_id=eq.${checkout}&select=provider_ref`);
  const receipts = await rest('GET', `receipts?payment_id=eq.${paid.body.id}&select=id`);
  check('replayed callback changes nothing',
    r.status === 200 && Number(inv.amount_paid) === 4500 && payRow.provider_ref === paid.body.providerRef && receipts.length === 1,
    `${r.status} paid ${inv.amount_paid} ref ${payRow.provider_ref} receipts ${receipts.length}`);

  console.log('\nsubscription');
  r = await call(teacher, { action: 'pay-subscription', channel: 'mpesa', phone: '0712345678' });
  check('a teacher who is not the owner cannot pay', r.status === 403, `${r.status}`);

  r = await call(owner, { action: 'pay-subscription', channel: 'mpesa', phone: '0712345678' });
  if (r.body.paymentId) created.subPayments.push(r.body.paymentId);
  const [plan] = await rest('GET', `subscription_plans?id=eq.${subscriptionBefore.plan_id}&select=amount`);
  check('owner prompted for the plan price', r.status === 200 && r.body.amount === Number(plan.amount),
    `${r.status} ${r.body.amount}`);
  const sub = await poll(owner, 'subscription', r.body.checkoutRequestId, (p) => p.status !== 'pending');
  check('outcome: success', sub.body.status === 'success', sub.body.status);
  if (sub.body.subscriptionInvoiceId) created.subInvoices.push(sub.body.subscriptionInvoiceId);

  const { data: after } = await owner.db.from('subscriptions').select('status, current_period_end').single();
  const days = (new Date(after.current_period_end) - Date.now()) / 86_400_000;
  check('subscription active for about a month', after.status === 'active' && days > 27 && days < 32,
    `${after.status}, ${days.toFixed(1)} days`);

  const { error: cancelError } = await owner.db.rpc('cancel_subscription', { p_reason: 'check-payments' });
  const { data: cancelled } = await owner.db.from('subscriptions').select('status, cancel_at_period_end').single();
  check('owner cancels; access runs to period end',
    !cancelError && cancelled.cancel_at_period_end && cancelled.status === 'active', cancelError?.message);
  const { error: teacherCancel } = await teacher.db.rpc('resume_subscription');
  check('a teacher cannot resume', teacherCancel?.code === '42501', teacherCancel?.code);
  const { error: resumeError } = await owner.db.rpc('resume_subscription');
  const { data: resumed } = await owner.db.from('subscriptions').select('cancel_at_period_end').single();
  check('owner resumes', !resumeError && !resumed.cancel_at_period_end, resumeError?.message);
} catch (error) {
  failures += 1;
  console.error('\n  ✗ run aborted:', error instanceof Error ? error.message : error);
} finally {
  console.log('\ncleanup');
  try {
    for (const id of created.payments) {
      for (const n of await rest('GET', `notifications?payload->>payment_id=eq.${id}&select=id`)) {
        await rest('DELETE', `mail_outbox?notification_id=eq.${n.id}`);
        await rest('DELETE', `sms_outbox?notification_id=eq.${n.id}`);
        await rest('DELETE', `notifications?id=eq.${n.id}`);
      }
      await rest('DELETE', `payments?id=eq.${id}`);
    }
    for (const id of created.subPayments) {
      for (const n of await rest('GET', `notifications?payload->>subscription_payment_id=eq.${id}&select=id`)) {
        await rest('DELETE', `mail_outbox?notification_id=eq.${n.id}`);
        await rest('DELETE', `sms_outbox?notification_id=eq.${n.id}`);
        await rest('DELETE', `notifications?id=eq.${n.id}`);
      }
      await rest('DELETE', `subscription_payments?id=eq.${id}`);
    }
    for (const id of created.subInvoices) {
      // Only an invoice this run opened; an older unpaid one is left alone.
      const [row] = await rest('GET', `subscription_invoices?id=eq.${id}&select=created_at`);
      if (row && row.created_at >= startedAt) await rest('DELETE', `subscription_invoices?id=eq.${id}`);
    }
    if (invoiceBefore) {
      await rest('PATCH', `invoices?id=eq.${invoiceBefore.id}`, { amount_paid: invoiceBefore.amount_paid });
      const [back] = await rest('GET', `invoices?id=eq.${invoiceBefore.id}&select=amount_paid,status`);
      check('invoice restored', back.status === invoiceBefore.status && Number(back.amount_paid) === Number(invoiceBefore.amount_paid),
        `${back.status} ${back.amount_paid}`);
    }
    if (subscriptionBefore) {
      const { id, madrasa_id, created_at, updated_at, ...fields } = subscriptionBefore;
      await rest('PATCH', `subscriptions?id=eq.${id}`, fields);
      const [back] = await rest('GET', `subscriptions?id=eq.${id}&select=status,current_period_end,cancel_at_period_end`);
      check('subscription restored',
        back.status === subscriptionBefore.status && back.current_period_end === subscriptionBefore.current_period_end
          && back.cancel_at_period_end === subscriptionBefore.cancel_at_period_end,
        `${back.status}`);
    }
    console.log(`  removed ${created.payments.length} fee payment(s), ${created.subPayments.length} subscription payment(s)`);
  } catch (error) {
    failures += 1;
    console.error('  ✗ cleanup failed:', error instanceof Error ? error.message : error);
  }
}

console.log(failures === 0 ? '\nAll payment checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
