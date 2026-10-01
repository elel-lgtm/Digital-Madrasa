/**
 * Card payments through Paystack's hosted checkout.
 *
 * The card number is typed into Paystack's own page, opened by the app in a
 * browser. It never reaches the app's code or this server, which keeps the
 * project out of card-data (PCI DSS) scope entirely. This module only starts
 * a checkout for an amount the server derived, and later asks Paystack what
 * happened.
 *
 * Like M-Pesa, it runs against a mock until a key is configured:
 *
 *   PAYSTACK_SECRET_KEY   sk_test_… (Paystack test mode) or sk_live_…
 *
 * With no key, the mock "card" succeeds a few seconds after the checkout is
 * started, so the whole flow (record, poll, settle, receipt) can be shown.
 *
 * No runtime globals beyond fetch and Web Crypto, so it runs in the Edge
 * Functions and in the unit tests alike.
 */

const PAYSTACK = 'https://api.paystack.co';

/** How long the mock customer takes to "pay". */
export const MOCK_CARD_DELAY_MS = 5_000;

export type CardProvider = 'paystack' | 'mock';

export function cardProvider(secretKey: string | undefined): CardProvider {
  return secretKey ? 'paystack' : 'mock';
}

/** A checkout reference: unique, and recognisable in Paystack's dashboard. */
export function cardReference(kind: 'fees' | 'subscription'): string {
  return `DM-${kind === 'fees' ? 'FEE' : 'SUB'}-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/** Shillings to the minor unit Paystack charges in (cents). */
export function toMinorUnits(amount: number): number {
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(minor) || minor <= 0) throw new Error('Amount must be positive.');
  return minor;
}

export interface CheckoutStart {
  reference: string;
  /** Paystack's hosted page. Null for the mock, which needs no page. */
  authorisationUrl: string | null;
}

export async function startCardCheckout(opts: {
  secretKey: string | undefined;
  reference: string;
  amount: number;
  email: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<CheckoutStart> {
  if (!opts.secretKey) return { reference: opts.reference, authorisationUrl: null };

  const res = await fetch(`${PAYSTACK}/transaction/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference: opts.reference,
      amount: toMinorUnits(opts.amount),
      currency: 'KES',
      email: opts.email,
      channels: ['card'],
      callback_url: opts.callbackUrl,
      metadata: opts.metadata ?? {},
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };
  if (!res.ok || !body.status || !body.data?.authorization_url) {
    throw new Error(`Paystack did not start the checkout: ${(body.message ?? `HTTP ${res.status}`).slice(0, 160)}`);
  }
  return { reference: opts.reference, authorisationUrl: body.data.authorization_url };
}

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'unknown';

export interface CardOutcome {
  /** pending: the customer has not finished on the checkout page yet. */
  status: 'success' | 'failed' | 'pending';
  /** In shillings, as charged. Settlement refuses a different amount. */
  amount: number | null;
  providerRef: string | null;
  last4: string | null;
  brand: CardBrand;
  failureReason: string | null;
  raw: Record<string, unknown>;
}

export function cardBrand(type: string | undefined | null): CardBrand {
  const t = (type ?? '').toLowerCase();
  if (t.includes('visa')) return 'visa';
  if (t.includes('master')) return 'mastercard';
  if (t.includes('american') || t.includes('amex')) return 'amex';
  return 'unknown';
}

const FAILED = new Set(['failed', 'abandoned', 'reversed']);

/** Turns a Paystack transaction (from verify or a webhook) into an outcome. */
export function outcomeFromPaystack(data: Record<string, unknown>): CardOutcome {
  const status = String(data.status ?? '');
  const auth = (data.authorization ?? {}) as Record<string, unknown>;
  const last4 = typeof auth.last4 === 'string' && /^\d{4}$/.test(auth.last4) ? auth.last4 : null;
  return {
    status: status === 'success' ? 'success' : FAILED.has(status) ? 'failed' : 'pending',
    amount: typeof data.amount === 'number' ? data.amount / 100 : null,
    providerRef: data.id !== undefined ? String(data.id) : null,
    last4,
    brand: cardBrand(auth.card_type as string | undefined),
    failureReason: FAILED.has(status)
      ? String(data.gateway_response ?? 'The card payment did not go through.').slice(0, 200)
      : null,
    // What is kept: the outcome, never anything that identifies the card
    // beyond its brand and last four digits.
    raw: { status, reference: data.reference, gateway_response: data.gateway_response, paid_at: data.paid_at },
  };
}

/** Asks Paystack (or the mock) what became of a checkout. */
export async function verifyCardCheckout(opts: {
  secretKey: string | undefined;
  reference: string;
  /** For the mock: when the checkout was started, and the amount it was for. */
  createdAt: string;
  amount: number;
  now?: number;
}): Promise<CardOutcome> {
  if (!opts.secretKey) {
    const elapsed = (opts.now ?? Date.now()) - new Date(opts.createdAt).getTime();
    if (elapsed < MOCK_CARD_DELAY_MS) {
      return { status: 'pending', amount: null, providerRef: null, last4: null, brand: 'unknown', failureReason: null, raw: {} };
    }
    return {
      status: 'success',
      amount: opts.amount,
      providerRef: `MOCK-${opts.reference.slice(-10)}`,
      last4: '4242',
      brand: 'visa',
      failureReason: null,
      raw: { status: 'success', reference: opts.reference, mock: true },
    };
  }

  const res = await fetch(`${PAYSTACK}/transaction/verify/${encodeURIComponent(opts.reference)}`, {
    headers: { Authorization: `Bearer ${opts.secretKey}` },
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; data?: Record<string, unknown> };
  // Not found yet, or Paystack unreachable: still pending, ask again later.
  if (!res.ok || !body.status || !body.data) {
    return { status: 'pending', amount: null, providerRef: null, last4: null, brand: 'unknown', failureReason: null, raw: {} };
  }
  return outcomeFromPaystack(body.data);
}

/**
 * Checks Paystack's webhook signature: HMAC-SHA512 of the raw body with the
 * secret key, hex encoded, in `x-paystack-signature`. Compared in constant
 * time so the check itself leaks nothing.
 */
export async function validPaystackSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string,
): Promise<boolean> {
  if (!signature || !secretKey) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
