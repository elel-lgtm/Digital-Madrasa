#!/usr/bin/env node
/**
 * End-to-end check of card payments (migration 0029, `payments` and
 * `card-callback`) through the deployed API. With no PAYSTACK_SECRET_KEY set
 * the card provider is the mock, so no real money moves; with a Paystack test
 * key the checkout URL is real and this script stops short of paying it.
 *
 *   fees:          card payment starts with no card data from the app · the
 *                  amount is the server's · it settles once, with a receipt,
 *                  the card's last four digits and the parent told
 *   subscription:  a teacher cannot start one · the owner can
 *   callback:      an unsigned or wrongly signed webhook is refused · the
 *                  browser return page answers
 *
 * Everything the run changes is put back in `finally` with the service-role
 * key, by id, exactly as check-payments does. Payment attempts are rate
 * limited (5 per 10 minutes per account), so allow ten minutes between runs.
 *
 *   npm run check:card
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
const OPEN_INVOICE_NO = 'INV-2026-0003';

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { token: data.session.access_token };
}

async function call(who, body) {
  const res = await fetch(`${URL}/functions/v1/payments`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function rest(method, path, body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} ${res.status}`);
  return text ? JSON.parse(text) : null;
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

  [invoiceBefore] = await rest('GET', `invoices?invoice_no=eq.${OPEN_INVOICE_NO}&select=id,madrasa_id,amount_due,amount_paid,status`);
  [subscriptionBefore] = await rest('GET', `subscriptions?madrasa_id=eq.${invoiceBefore.madrasa_id}&select=*`);
  const owed = Number(invoiceBefore.amount_due) - Number(invoiceBefore.amount_paid);

  console.log('fees by card');
  // A card number in the request must make no difference: it is not read.
  const start = await call(parent, {
    action: 'pay-fees', channel: 'card', invoiceIds: [invoiceBefore.id], amount: 1, card: { number: '4242424242424242' },
  });
  if (start.body.paymentId) created.payments.push(start.body.paymentId);
  check('checkout started', start.status === 200 && start.body.channel === 'card', `HTTP ${start.status} ${start.body.code ?? ''}`);
  check('amount is what the invoice owes, not what was sent', start.body.amount === owed, `${start.body.amount} of ${owed}`);
  check('a hosted page, or none with the mock', start.body.authorisationUrl === null
    || /^https:\/\/checkout\.paystack\.com\//.test(start.body.authorisationUrl ?? ''), String(start.body.authorisationUrl));

  if (start.body.authorisationUrl) {
    console.log('  . Paystack test mode: pay the checkout page by hand to settle; settlement is not checked here');
  } else {
    let s;
    const until = Date.now() + 30_000;
    do {
      await new Promise((r) => setTimeout(r, 2000));
      s = await call(parent, { action: 'status', kind: 'fees', checkoutRequestId: start.body.checkoutRequestId });
    } while (s.status === 200 && s.body.status === 'pending' && Date.now() < until);
    check('settles as paid', s.body.status === 'success', s.body.status);
    check('receipt issued', /^RCP-\d{4}-\d{6}$/.test(s.body.receiptNo ?? ''), s.body.receiptNo);

    const [row] = await rest('GET', `payments?id=eq.${start.body.paymentId}&select=method,channel,provider,card_last4,card_brand`);
    check('recorded as a card payment, keeping only brand and last four', row.method === 'card' && row.channel === 'card'
      && row.card_last4 === '4242' && row.card_brand === 'visa', `${row.method} ${row.card_brand} ${row.card_last4}`);
    const [inv] = await rest('GET', `invoices?id=eq.${invoiceBefore.id}&select=status,amount_paid`);
    check('invoice paid', inv.status === 'paid', inv.status);
    const notes = await rest('GET', `notifications?payload->>payment_id=eq.${start.body.paymentId}&select=type`);
    check('parent told once', notes.length === 1 && notes[0].type === 'payment_receipt', `${notes.length}`);

    const again = await call(parent, { action: 'status', kind: 'fees', checkoutRequestId: start.body.checkoutRequestId });
    const receipts = await rest('GET', `receipts?payment_id=eq.${start.body.paymentId}&select=id`);
    check('asking again changes nothing', again.body.status === 'success' && receipts.length === 1, `${receipts.length} receipt(s)`);
  }

  console.log('\nsubscription by card');
  let r = await call(teacher, { action: 'pay-subscription', channel: 'card' });
  check('a teacher who is not the owner cannot', r.status === 403, `HTTP ${r.status}`);
  r = await call(owner, { action: 'pay-subscription', channel: 'card' });
  if (r.body.paymentId) created.subPayments.push(r.body.paymentId);
  check('the owner can start one', r.status === 200 && r.body.channel === 'card', `HTTP ${r.status}`);
  for (const inv of await rest('GET', `subscription_invoices?madrasa_id=eq.${invoiceBefore.madrasa_id}&created_at=gte.${startedAt}&select=id`)) {
    created.subInvoices.push(inv.id);
  }

  console.log('\ncallback');
  const hook = (headers) => fetch(`${URL}/functions/v1/card-callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ event: 'charge.success', data: { reference: start.body.checkoutRequestId, status: 'success', amount: 100 } }),
  });
  check('unsigned webhook refused', (await hook({})).status === 401);
  check('wrongly signed webhook refused', (await hook({ 'x-paystack-signature': 'ab'.repeat(64) })).status === 401);
  const back = await fetch(`${URL}/functions/v1/card-callback?reference=${encodeURIComponent(start.body.checkoutRequestId ?? '')}`);
  check('browser return page answers', back.status === 200 && (await back.text()).includes('return to ILMORA'), `HTTP ${back.status}`);
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
    for (const id of created.subInvoices) await rest('DELETE', `subscription_invoices?id=eq.${id}`);
    if (invoiceBefore) {
      await rest('PATCH', `invoices?id=eq.${invoiceBefore.id}`, { amount_paid: invoiceBefore.amount_paid });
      const [back] = await rest('GET', `invoices?id=eq.${invoiceBefore.id}&select=amount_paid,status`);
      check('invoice restored', back.status === invoiceBefore.status && Number(back.amount_paid) === Number(invoiceBefore.amount_paid),
        `${back.status} ${back.amount_paid}`);
    }
    if (subscriptionBefore) {
      const { id, madrasa_id, created_at, updated_at, ...fields } = subscriptionBefore;
      await rest('PATCH', `subscriptions?id=eq.${id}`, fields);
    }
    console.log(`  removed ${created.payments.length} fee payment(s), ${created.subPayments.length} subscription payment(s)`);
  } catch (error) {
    failures += 1;
    console.error('  ✗ cleanup failed:', error instanceof Error ? error.message : error);
  }
}

console.log(failures === 0 ? '\nAll card payment checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
