import { authenticate, requireOwner, type Caller } from '../_shared/auth.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { maskMsisdn, reconcilePending, stkPush, toMsisdn } from '../_shared/mpesa.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Starting and following M-Pesa payments.
 *
 *   { action: 'pay-fees', channel, invoiceIds, phone }   a parent pays invoices
 *   { action: 'pay-subscription', channel, phone }       the owner pays the platform
 *   { action: 'status', kind, checkoutRequestId }         the app polls an outcome
 *
 * No request carries an amount. Fees are what the invoices still owe;
 * the subscription is what its open invoice (priced from the plan) still owes.
 *
 * This function never marks anything paid. It records the attempt and asks
 * M-Pesa to prompt the phone. Money moves only when an outcome is settled by
 * the database (`settle_*_payment`, service role only): from the Safaricom
 * callback, from a status query when the callback is late, or — with the
 * mock provider — from the simulated callback in `_shared/mpesa.ts`.
 *
 * Card payments are refused here, deliberately and visibly. No card gateway
 * is integrated, and card numbers must never be sent to this server: a real
 * integration tokenises on the device through the gateway's own SDK.
 */

interface Body {
  action?: 'pay-fees' | 'pay-subscription' | 'status';
  channel?: 'mpesa' | 'card';
  invoiceIds?: string[];
  phone?: string;
  kind?: 'fees' | 'subscription';
  checkoutRequestId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_INVOICE = ['issued', 'partially_paid', 'overdue'];
/** A second prompt for the same bill inside this window is refused. */
const IN_FLIGHT_MS = 2 * 60 * 1000;

function refuseCard(channel: Body['channel']) {
  if (channel === 'card') {
    throw new PublicError(
      422,
      'card_unavailable',
      'Card payments are not available yet. Please pay with M-Pesa.',
    );
  }
}

// ------------------------------------------------------------------- fees

async function payFees(caller: Caller, body: Body): Promise<Response> {
  refuseCard(body.channel);
  if (caller.role !== 'parent') {
    throw new PublicError(403, 'forbidden', 'Only a parent can pay fees here.');
  }

  const ids = [...new Set(body.invoiceIds ?? [])];
  if (ids.length === 0 || ids.length > 10 || !ids.every((id) => UUID.test(id))) {
    throw new PublicError(400, 'validation', 'Choose between one and ten invoices.');
  }
  const msisdn = toMsisdn(body.phone ?? '');

  await rateLimit(caller.admin, `payment:${caller.userId}`, LIMITS.payment);

  const { data: parent } = await caller.admin
    .from('parents')
    .select('id')
    .eq('profile_id', caller.userId)
    .maybeSingle();
  if (!parent) throw new PublicError(403, 'forbidden', 'No parent record for this account.');

  // Read as the parent. RLS shows only invoices of approved children, so an
  // invoice id belonging to anyone else is simply "not found".
  const { data: invoices, error } = await caller.db
    .from('invoices')
    .select('id, madrasa_id, amount_due, amount_paid, status, students(admission_no)')
    .in('id', ids)
    .is('deleted_at', null);
  if (error) throw error;
  if (!invoices || invoices.length !== ids.length) {
    throw new PublicError(404, 'not_found', 'One of those invoices was not found.');
  }

  const madrasaIds = new Set(invoices.map((i) => i.madrasa_id));
  if (madrasaIds.size !== 1) {
    throw new PublicError(422, 'validation', 'Pay each madrasa’s invoices separately.');
  }
  const open = invoices.filter((i) => OPEN_INVOICE.includes(i.status));
  if (open.length !== invoices.length) {
    throw new PublicError(409, 'conflict', 'One of those invoices is already settled.');
  }

  const owed = open.map((i) => ({ id: i.id, owed: Number(i.amount_due) - Number(i.amount_paid) }));
  const amount = owed.reduce((sum, i) => sum + i.owed, 0);
  if (amount <= 0) throw new PublicError(409, 'conflict', 'These invoices are already settled.');
  if (!Number.isInteger(amount)) {
    throw new PublicError(422, 'validation', 'M-Pesa can only take whole shillings. Ask the madrasa to round this invoice.');
  }

  // One prompt at a time for the same bill: a double tap must not put two
  // prompts on the phone. (Were both paid, the second could not over-credit —
  // apply_payment stops at what is owed — but it would be money to refund.)
  const since = new Date(Date.now() - IN_FLIGHT_MS).toISOString();
  const { data: inFlight } = await caller.admin
    .from('payment_allocations')
    .select('invoice_id, payments!inner(status, created_at)')
    .in('invoice_id', ids)
    .in('payments.status', ['initiated', 'pending'])
    .gte('payments.created_at', since)
    .limit(1);
  if (inFlight && inFlight.length > 0) {
    throw new PublicError(409, 'payment_in_progress', 'A payment for this bill is already waiting on a phone.');
  }

  const madrasaId = invoices[0].madrasa_id as string;
  const { data: payment, error: insertError } = await caller.admin
    .from('payments')
    .insert({
      madrasa_id: madrasaId,
      parent_id: parent.id,
      amount,
      currency: 'KES',
      method: 'mpesa',
      channel: 'mpesa',
      provider: 'daraja',
      status: 'initiated',
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  const { error: allocError } = await caller.admin.from('payment_allocations').insert(
    owed.filter((i) => i.owed > 0).map((i) => ({
      payment_id: payment.id,
      invoice_id: i.id,
      madrasa_id: madrasaId,
      amount: i.owed,
    })),
  );
  if (allocError) throw allocError;

  const reference =
    (invoices[0] as { students?: { admission_no?: string } }).students?.admission_no ?? 'FEES';

  let push;
  try {
    push = await stkPush({ msisdn, amount, accountReference: reference, description: 'School fees' });
  } catch (err) {
    await caller.admin
      .from('payments')
      .update({ status: 'failed', failure_reason: 'M-Pesa did not accept the request.' })
      .eq('id', payment.id);
    throw err;
  }

  await caller.admin
    .from('payments')
    .update({ status: 'pending', checkout_request_id: push.checkoutRequestId })
    .eq('id', payment.id);

  return json({
    paymentId: payment.id,
    checkoutRequestId: push.checkoutRequestId,
    amount,
    currency: 'KES',
    phone: maskMsisdn(msisdn),
    channel: 'mpesa',
    authorisationUrl: null,
  });
}

// ------------------------------------------------------------ subscription

async function paySubscription(caller: Caller, body: Body): Promise<Response> {
  refuseCard(body.channel);
  // Only the owner pays. A teacher must not be able to charge the school.
  const owner = await requireOwner(caller);
  const msisdn = toMsisdn(body.phone ?? '');

  await rateLimit(caller.admin, `payment:${caller.userId}`, LIMITS.payment);

  const { data: invoice, error } = await caller.admin.rpc('open_subscription_invoice', {
    p_madrasa_id: owner.madrasa_id,
  });
  if (error) throw error;

  const amount = Number(invoice.amount_due) - Number(invoice.amount_paid);
  if (amount <= 0) throw new PublicError(409, 'conflict', 'Nothing is owed right now.');

  const since = new Date(Date.now() - IN_FLIGHT_MS).toISOString();
  const { data: inFlight } = await caller.admin
    .from('subscription_payments')
    .select('id')
    .eq('subscription_invoice_id', invoice.id)
    .in('status', ['initiated', 'pending'])
    .gte('created_at', since)
    .limit(1);
  if (inFlight && inFlight.length > 0) {
    throw new PublicError(409, 'payment_in_progress', 'A payment for this invoice is already waiting on a phone.');
  }

  const { data: payment, error: insertError } = await caller.admin
    .from('subscription_payments')
    .insert({
      madrasa_id: owner.madrasa_id,
      subscription_invoice_id: invoice.id,
      amount,
      currency: invoice.currency ?? 'KES',
      channel: 'mpesa',
      provider: 'daraja',
      status: 'initiated',
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  let push;
  try {
    push = await stkPush({
      msisdn,
      amount,
      accountReference: String(invoice.invoice_no).replace(/^DMS-\d{4}-/, 'DMS-'),
      description: 'Subscription',
    });
  } catch (err) {
    await caller.admin
      .from('subscription_payments')
      .update({ status: 'failed', failure_reason: 'M-Pesa did not accept the request.' })
      .eq('id', payment.id);
    throw err;
  }

  await caller.admin
    .from('subscription_payments')
    .update({ status: 'pending', checkout_request_id: push.checkoutRequestId })
    .eq('id', payment.id);

  return json({
    paymentId: payment.id,
    checkoutRequestId: push.checkoutRequestId,
    amount,
    currency: invoice.currency ?? 'KES',
    phone: maskMsisdn(msisdn),
    channel: 'mpesa',
    authorisationUrl: null,
  });
}

// ------------------------------------------------------------------ status

const FEE_COLUMNS =
  'id, madrasa_id, parent_id, amount, currency, method, provider_ref, checkout_request_id, status, ' +
  'created_at, settled_at, payment_allocations(invoice_id), receipts(receipt_no)';
const SUB_COLUMNS =
  'id, madrasa_id, subscription_invoice_id, amount, currency, channel, provider, provider_ref, ' +
  'checkout_request_id, status, card_last4, card_brand, failure_reason, created_at, settled_at';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function toFeePayment(row: Row) {
  const receipt = Array.isArray(row.receipts) ? row.receipts[0] : row.receipts;
  return {
    id: row.id,
    madrasaId: row.madrasa_id,
    invoiceIds: (row.payment_allocations ?? []).map((a: Row) => a.invoice_id),
    parentId: row.parent_id ?? null,
    amount: Number(row.amount),
    currency: row.currency ?? 'KES',
    method: row.method,
    providerRef: row.provider_ref ?? null,
    checkoutRequestId: row.checkout_request_id ?? null,
    status: row.status,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? null,
    receiptNo: receipt?.receipt_no ?? null,
  };
}

function toSubscriptionPayment(row: Row) {
  return {
    id: row.id,
    madrasaId: row.madrasa_id,
    subscriptionInvoiceId: row.subscription_invoice_id,
    amount: Number(row.amount),
    currency: row.currency ?? 'KES',
    channel: row.channel,
    provider: row.provider,
    providerRef: row.provider_ref ?? null,
    checkoutRequestId: row.checkout_request_id ?? null,
    status: row.status,
    cardLast4: row.card_last4 ?? null,
    cardBrand: row.card_brand ?? null,
    failureReason: row.failure_reason ?? null,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? null,
    receiptNo: row.provider_ref ?? null,
  };
}

async function status(caller: Caller, body: Body): Promise<Response> {
  const checkoutId = String(body.checkoutRequestId ?? '');
  if (!checkoutId || checkoutId.length > 100) {
    throw new PublicError(400, 'validation', 'Which payment?');
  }
  const fees = body.kind !== 'subscription';
  const table = fees ? 'payments' : 'subscription_payments';
  const columns = fees ? FEE_COLUMNS : SUB_COLUMNS;

  // Read as the caller: somebody who cannot see a payment cannot learn its
  // outcome, and cannot cause it to be reconciled either.
  const read = async () => {
    const { data, error } = await caller.db
      .from(table)
      .select(columns)
      .eq('checkout_request_id', checkoutId)
      .maybeSingle();
    if (error) throw error;
    return data as Row | null;
  };

  let row = await read();
  if (!row) throw new PublicError(404, 'not_found', 'Payment not found.');

  if (row.status === 'pending' || row.status === 'initiated') {
    await reconcilePending(caller.admin, {
      checkoutRequestId: checkoutId,
      amount: Number(row.amount),
      createdAt: row.created_at,
    });
    row = (await read()) ?? row;
  }

  return json(fees ? toFeePayment(row) : toSubscriptionPayment(row));
}

// ------------------------------------------------------------------- entry

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');
  const caller = await authenticate(req);
  const body = await readJson<Body>(req);

  switch (body.action) {
    case 'pay-fees':
      return payFees(caller, body);
    case 'pay-subscription':
      return paySubscription(caller, body);
    case 'status':
      return status(caller, body);
    default:
      throw new PublicError(400, 'validation', 'Unknown action.');
  }
}));
