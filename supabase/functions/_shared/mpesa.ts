import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { PublicError } from './http.ts';

/**
 * M-Pesa (Safaricom Daraja) STK Push, behind one small interface.
 *
 * Which provider runs is decided by the `MPESA_ENV` secret:
 *
 *   mock        (default) No request leaves Supabase and no money moves. The
 *               prompt "succeeds" a few seconds later unless the phone number
 *               ends in 9999, which always fails, so both paths can be shown.
 *   sandbox     Safaricom's sandbox (sandbox.safaricom.co.ke). Test money.
 *   production  The live API. Real money.
 *
 * For sandbox and production these secrets must also be set:
 *   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY,
 *   MPESA_CALLBACK_SECRET
 * None of them is ever returned to a client or written to a log.
 *
 * Settlement is the same whichever provider runs: an outcome, shaped exactly
 * like Daraja's STK callback, goes through `processStkCallback`, which hands
 * it to the database's `settle_*_payment` functions. The mock builds that
 * callback itself; the real one arrives at the `payment-callback` function.
 */

export type MpesaEnv = 'mock' | 'sandbox' | 'production';

export function mpesaEnv(): MpesaEnv {
  const value = (Deno.env.get('MPESA_ENV') ?? 'mock').toLowerCase();
  return value === 'sandbox' || value === 'production' ? value : 'mock';
}

/** 07XXXXXXXX, 01XXXXXXXX, +2547…, 2547… → 2547XXXXXXXX / 2541XXXXXXXX. */
export function toMsisdn(phone: string): string {
  const digits = String(phone ?? '').replace(/[\s\-+()]/g, '');
  const local = digits.startsWith('254') ? digits.slice(3) : digits.replace(/^0/, '');
  if (!/^[17]\d{8}$/.test(local)) {
    throw new PublicError(400, 'validation', 'Enter a valid Kenyan phone number.');
  }
  return `254${local}`;
}

/** For display and storage: 2547XXXXX123 → 07*****123. */
export function maskMsisdn(msisdn: string): string {
  const local = `0${msisdn.slice(3)}`;
  return `${local.slice(0, 2)}*****${local.slice(-3)}`;
}

// ------------------------------------------------------------------ Daraja

function darajaBase(): string {
  return mpesaEnv() === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error('[mpesa] missing secret', name);
    throw new PublicError(503, 'payment_provider', 'M-Pesa is not configured yet. Please try again later.');
  }
  return value;
}

/** Daraja wants the time in Nairobi (UTC+3), as YYYYMMDDHHmmss. */
function darajaTimestamp(): string {
  const eat = new Date(Date.now() + 3 * 3600 * 1000);
  return eat.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

async function darajaToken(): Promise<string> {
  const basic = btoa(`${secret('MPESA_CONSUMER_KEY')}:${secret('MPESA_CONSUMER_SECRET')}`);
  const res = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    console.error('[mpesa] oauth failed', res.status);
    throw new PublicError(502, 'payment_provider', 'M-Pesa is not responding. Please try again.');
  }
  const body = await res.json();
  return String(body.access_token);
}

function darajaPassword(timestamp: string): string {
  return btoa(`${secret('MPESA_SHORTCODE')}${secret('MPESA_PASSKEY')}${timestamp}`);
}

// ------------------------------------------------------------------- push

export interface StkPushInput {
  msisdn: string;
  /** Whole shillings. Daraja rejects fractions. */
  amount: number;
  /** Shown on the customer's phone. Daraja allows 12 characters. */
  accountReference: string;
  description: string;
}

export interface StkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
}

const MOCK_PREFIX = 'ws_CO_MOCK_';

export async function stkPush(input: StkPushInput): Promise<StkPushResult> {
  if (!Number.isInteger(input.amount) || input.amount < 1) {
    throw new PublicError(422, 'validation', 'M-Pesa can only take whole shillings.');
  }

  if (mpesaEnv() === 'mock') {
    // The outcome is fixed now and carried in the id, so the poll that
    // settles it later needs nothing else: F fails, S succeeds.
    const outcome = input.msisdn.endsWith('9999') ? 'F' : 'S';
    const id = crypto.randomUUID().replace(/-/g, '');
    return { checkoutRequestId: `${MOCK_PREFIX}${outcome}${id}`, merchantRequestId: `mock-${id.slice(0, 12)}` };
  }

  const timestamp = darajaTimestamp();
  const shortcode = secret('MPESA_SHORTCODE');
  const callbackSecret = secret('MPESA_CALLBACK_SECRET');
  const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-callback?key=${encodeURIComponent(callbackSecret)}`;

  const res = await fetch(`${darajaBase()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await darajaToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: darajaPassword(timestamp),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: input.amount,
      PartyA: input.msisdn,
      PartyB: shortcode,
      PhoneNumber: input.msisdn,
      CallBackURL: callbackUrl,
      AccountReference: input.accountReference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
    console.error('[mpesa] stk push rejected', res.status, body.errorCode ?? body.ResponseCode ?? '');
    throw new PublicError(502, 'payment_provider', 'M-Pesa did not accept the request. Please try again.');
  }
  return { checkoutRequestId: String(body.CheckoutRequestID), merchantRequestId: String(body.MerchantRequestID ?? '') };
}

// -------------------------------------------------------------- callbacks

/** Daraja's STK callback body. Only the fields this code reads are typed. */
export interface StkCallback {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number | string;
      ResultDesc?: string;
      CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] };
    };
  };
}

/** What a customer sees when a push does not complete, by Daraja result code. */
function failureReason(code: number, desc: string | undefined): string {
  switch (code) {
    case 1032:
      return 'The request was cancelled on the phone.';
    case 1037:
      return 'The phone could not be reached, or the prompt timed out.';
    case 1:
      return 'The M-Pesa balance was not enough.';
    case 2001:
      return 'The M-Pesa PIN entered was wrong.';
    default:
      return desc ? `M-Pesa: ${desc}` : 'The payment did not go through.';
  }
}

/**
 * The phone number is not needed to settle anything, so it is masked before
 * the callback is stored (and so before it reaches the audit log).
 */
function redact(payload: StkCallback): StkCallback {
  const copy = structuredClone(payload);
  for (const item of copy.Body?.stkCallback?.CallbackMetadata?.Item ?? []) {
    if (item.Name === 'PhoneNumber' && item.Value !== undefined) {
      item.Value = maskMsisdn(String(item.Value));
    }
  }
  return copy;
}

export type SettleOutcome =
  | { handled: false }
  | { handled: true; kind: 'fees' | 'subscription'; status: string };

/**
 * Applies one STK outcome. Safe to call any number of times for the same
 * checkout: the database settles a payment once and ignores the rest.
 */
export async function processStkCallback(admin: SupabaseClient, payload: StkCallback): Promise<SettleOutcome> {
  const cb = payload.Body?.stkCallback;
  const checkoutId = cb?.CheckoutRequestID;
  if (!cb || !checkoutId) return { handled: false };

  const code = Number(cb.ResultCode);
  const items = new Map((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
  const success = code === 0;
  const args = {
    p_checkout_request_id: checkoutId,
    p_success: success,
    p_provider_ref: success ? String(items.get('MpesaReceiptNumber') ?? '') || null : null,
    p_amount: success && items.has('Amount') ? Number(items.get('Amount')) : null,
    p_raw: redact(payload),
    p_failure_reason: success ? null : failureReason(code, cb.ResultDesc),
  };

  const { data: fee } = await admin
    .from('payments')
    .select('id')
    .eq('checkout_request_id', checkoutId)
    .maybeSingle();

  const kind = fee ? 'fees' : 'subscription';
  if (!fee) {
    const { data: sub } = await admin
      .from('subscription_payments')
      .select('id')
      .eq('checkout_request_id', checkoutId)
      .maybeSingle();
    if (!sub) return { handled: false };
  }

  const { data, error } = await admin.rpc(
    kind === 'fees' ? 'settle_fee_payment' : 'settle_subscription_payment',
    args,
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { handled: true, kind, status: String(row?.status ?? '') };
}

// ------------------------------------------------------------------ polling

/** How long the mock "customer" takes to enter their PIN. */
const MOCK_SETTLE_MS = 6000;
/** Before this, a live push is still with the customer; asking is pointless. */
const QUERY_AFTER_MS = 30_000;

function mockReceipt(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `MK${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

/**
 * Called while the app polls a pending payment. The mock settles here once
 * its "customer" has had time to respond. A live payment is normally settled
 * by the callback; if that has not arrived after a while, Daraja is asked
 * directly, so a lost callback cannot leave a parent waiting forever.
 */
export async function reconcilePending(
  admin: SupabaseClient,
  payment: { checkoutRequestId: string; amount: number; createdAt: string },
): Promise<void> {
  const age = Date.now() - new Date(payment.createdAt).getTime();

  if (payment.checkoutRequestId.startsWith(MOCK_PREFIX)) {
    if (age < MOCK_SETTLE_MS) return;
    const ok = payment.checkoutRequestId.charAt(MOCK_PREFIX.length) === 'S';
    await processStkCallback(admin, {
      Body: {
        stkCallback: {
          MerchantRequestID: 'mock',
          CheckoutRequestID: payment.checkoutRequestId,
          ResultCode: ok ? 0 : 1032,
          ResultDesc: ok
            ? 'The service request is processed successfully. (simulated)'
            : 'Request cancelled by user (simulated)',
          CallbackMetadata: ok
            ? {
                Item: [
                  { Name: 'Amount', Value: payment.amount },
                  { Name: 'MpesaReceiptNumber', Value: mockReceipt() },
                  { Name: 'TransactionDate', Value: Number(darajaTimestamp()) },
                ],
              }
            : undefined,
        },
      },
    });
    return;
  }

  if (mpesaEnv() === 'mock' || age < QUERY_AFTER_MS) return;

  try {
    const timestamp = darajaTimestamp();
    const res = await fetch(`${darajaBase()}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await darajaToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: secret('MPESA_SHORTCODE'),
        Password: darajaPassword(timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: payment.checkoutRequestId,
      }),
    });
    const body = await res.json().catch(() => ({}));
    // While the customer is still deciding, Daraja answers with an error body
    // and no ResultCode. Only a definite result is acted on.
    if (body.ResultCode === undefined || body.ResultCode === null) return;
    const code = Number(body.ResultCode);
    await processStkCallback(admin, {
      Body: {
        stkCallback: {
          CheckoutRequestID: payment.checkoutRequestId,
          ResultCode: code,
          ResultDesc: body.ResultDesc,
          // The query does not return the M-Pesa receipt. A success settles
          // without one; the callback, if it comes, fills it in.
          CallbackMetadata: code === 0 ? { Item: [{ Name: 'Amount', Value: payment.amount }] } : undefined,
        },
      },
    });
  } catch (error) {
    // Reconciliation is best-effort; the callback remains the primary path.
    console.error('[mpesa] query failed', error instanceof Error ? error.message : 'unknown');
  }
}
