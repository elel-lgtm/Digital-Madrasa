import { authenticate, requireOwner, type Caller } from '../_shared/auth.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { cardReference, startCardCheckout, verifyCardCheckout } from '../_shared/card.ts';
import { settleCardOutcome } from '../_shared/card-settle.ts';
import { maskMsisdn, reconcilePending, stkPush, toMsisdn } from '../_shared/mpesa.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Starting and following payments, by M-Pesa or by card.
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
 * Card payments go through Paystack's hosted checkout (_shared/card.ts): this
 * function records the attempt for the amount it derived and returns the
 * checkout page, which the app opens in a browser. The card number is typed
 * into Paystack's page and never reaches the app or this server. The outcome
 * settles through the same database functions as M-Pesa, from Paystack's
 * signed webhook (card-callback) or from a status poll asking Paystack.
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

const PAYSTACK_KEY = () => Deno.env.get('PAYSTACK_SECRET_KEY') || undefined;

/** Where Paystack sends the browser after the card step. */
const CARD_RETURN_URL = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/card-callback`;

/** Paystack needs an e-mail for its receipt; never one we invent if we have one. */
function payerEmail(caller: Caller): string {
  return caller.email || `${caller.userId}@users.digitalmadrasa.invalid`;
}

// ------------------------------------------------------------------- fees

async function payFees(caller: Caller, body: Body): Promise<Response> {
  const card = body.channel === 'card';
  if (caller.role !== 'parent') {
    throw new PublicError(403, 'forbidden', 'Only a parent can pay fees here.');
  }

  const ids = [...new Set(body.invoiceIds ?? [])];
  if (ids.length === 0 || ids.length > 10 || !ids.every((id) => UUID.test(id))) {
    throw new PublicError(400, 'validation', 'Choose between one and ten invoices.');
  }
  const msisdn = card ? null : toMsisdn(body.phone ?? '');

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
  if (!card && !Number.isInteger(amount)) {
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
    throw new PublicError(409, 'payment_in_progress', 'A payment for this bill is already in progress.');
  }

  const madrasaId = invoices[0].madrasa_id as string;
  const { data: payment, error: insertError } = await caller.admin
    .from('payments')
    .insert({
      madrasa_id: madrasaId,
      parent_id: parent.id,
      amount,
      currency: 'KES',
      method: card ? 'card' : 'mpesa',
      channel: card ? 'card' : 'mpesa',
      provider: card ? 'paystack' : 'daraja',
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

  if (card) {
    return startCard(caller, 'fees', 'payments', payment.id, amount, 'KES', { payment_id: payment.id });
  }

  const reference =
    (invoices[0] as { students?: { admission_no?: string } }).students?.admission_no ?? 'FEES';

  let push;
  try {
    push = await stkPush({ msisdn: msisdn!, amount, accountReference: reference, description: 'School fees' });
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
    phone: maskMsisdn(msisdn!),
    channel: 'mpesa',
    authorisationUrl: null,
  });
}

/**
 * Starts the hosted card checkout for a payment row already recorded with its
 * amount. The row is keyed by the checkout reference, which is how the
 * webhook and the status poll find it again.
 */
async function startCard(
  caller: Caller,
  kind: 'fees' | 'subscription',
  table: 'payments' | 'subscription_payments',
  paymentId: string,
  amount: number,
  currency: string,
  metadata: Record<string, unknown>,
): Promise<Response> {
  const reference = cardReference(kind);
  let checkout;
  try {
    checkout = await startCardCheckout({
      secretKey: PAYSTACK_KEY(),
      reference,
      amount,
      email: payerEmail(caller),
      callbackUrl: CARD_RETURN_URL(),
      metadata: { ...metadata, kind },
    });
  } catch (err) {
    console.error('[payments] card checkout:', err instanceof Error ? err.message : err);
    await caller.admin
      .from(table)
      .update({ status: 'failed', failure_reason: 'The card checkout could not be started.' })
      .eq('id', paymentId);
    throw new PublicError(502, 'card_unavailable', 'Card payment could not be started. Please try again or pay with M-Pesa.');
  }

  await caller.admin
    .from(table)
    .update({ status: 'pending', checkout_request_id: checkout.reference })
    .eq('id', paymentId);

  return json({
    paymentId,
    checkoutRequestId: checkout.reference,
    amount,
    currency,
    phone: null,
    channel: 'card',
    authorisationUrl: checkout.authorisationUrl,
  });
}

// ------------------------------------------------------------ subscription

async function paySubscription(caller: Caller, body: Body): Promise<Response> {
  const card = body.channel === 'card';
  // Only the owner pays. A teacher must not be able to charge the school.
  const owner = await requireOwner(caller);
  const msisdn = card ? null : toMsisdn(body.phone ?? '');

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
    throw new PublicError(409, 'payment_in_progress', 'A payment for this invoice is already in progress.');
  }

  const { data: payment, error: insertError } = await caller.admin
    .from('subscription_payments')
    .insert({
      madrasa_id: owner.madrasa_id,
      subscription_invoice_id: invoice.id,
      amount,
      currency: invoice.currency ?? 'KES',
      channel: card ? 'card' : 'mpesa',
      provider: card ? 'paystack' : 'daraja',
      status: 'initiated',
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  if (card) {
    return startCard(caller, 'subscription', 'subscription_payments', payment.id, amount,
      invoice.currency ?? 'KES', { subscription_payment_id: payment.id });
  }

  let push;
  try {
    push = await stkPush({
      msisdn: msisdn!,
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
    phone: maskMsisdn(msisdn!),
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

  const byCard = fees ? row.method === 'card' : row.channel === 'card';
  if (byCard && (row.status === 'pending' || row.status === 'initiated')) {
    // The webhook normally settles a card payment; a poll asks Paystack too,
    // so a lost webhook cannot leave the parent waiting.
    const outcome = await verifyCardCheckout({
      secretKey: PAYSTACK_KEY(),
      reference: checkoutId,
      createdAt: row.created_at,
      amount: Number(row.amount),
    });
    await settleCardOutcome(caller.admin, fees ? 'fees' : 'subscription', checkoutId, outcome);
    row = (await read()) ?? row;
  } else if (row.status === 'pending' || row.status === 'initiated') {
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
