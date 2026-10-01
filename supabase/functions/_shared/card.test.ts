import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cardBrand, cardProvider, cardReference, MOCK_CARD_DELAY_MS, outcomeFromPaystack, startCardCheckout,
  toMinorUnits, validPaystackSignature, verifyCardCheckout,
} from './card.ts';

afterEach(() => vi.unstubAllGlobals());

describe('starting a card checkout', () => {
  it('uses Paystack only when a key is set', () => {
    expect(cardProvider(undefined)).toBe('mock');
    expect(cardProvider('sk_test_x')).toBe('paystack');
  });

  it('makes a unique reference that says what it pays for', () => {
    const a = cardReference('fees');
    expect(a).toMatch(/^DM-FEE-[0-9a-f]{20}$/);
    expect(cardReference('subscription')).toMatch(/^DM-SUB-/);
    expect(cardReference('fees')).not.toBe(a);
  });

  it('charges in cents and refuses a non-positive amount', () => {
    expect(toMinorUnits(1200)).toBe(120000);
    expect(toMinorUnits(99.99)).toBe(9999);
    expect(() => toMinorUnits(0)).toThrow();
  });

  it('asks Paystack for a card-only KES checkout, keeping the key out of the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: true, data: { authorization_url: 'https://checkout.paystack.com/abc', reference: 'R' },
    }), { status: 200 })));
    const start = await startCardCheckout({
      secretKey: 'sk_test_key', reference: 'DM-FEE-1', amount: 1500, email: 'p@example.com',
      callbackUrl: 'https://x/functions/v1/card-callback',
    });
    expect(start).toEqual({ reference: 'DM-FEE-1', authorisationUrl: 'https://checkout.paystack.com/abc' });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect(url).not.toContain('sk_test_key');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_key');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ amount: 150000, currency: 'KES', channels: ['card'], reference: 'DM-FEE-1' });
    expect(body).not.toHaveProperty('card');
  });

  it('fails loudly when Paystack will not start a checkout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: false, message: 'Invalid key' }), { status: 401 })));
    await expect(startCardCheckout({
      secretKey: 'bad', reference: 'R', amount: 10, email: 'e@x.co', callbackUrl: 'u',
    })).rejects.toThrow(/Invalid key/);
  });

  it('needs no page for the mock', async () => {
    expect(await startCardCheckout({ secretKey: undefined, reference: 'R', amount: 10, email: 'e', callbackUrl: 'u' }))
      .toEqual({ reference: 'R', authorisationUrl: null });
  });
});

describe('reading the outcome', () => {
  it('maps a successful Paystack charge, keeping only brand and last four digits', () => {
    const o = outcomeFromPaystack({
      status: 'success', amount: 150000, id: 991, reference: 'DM-FEE-1', gateway_response: 'Approved',
      authorization: { last4: '4081', card_type: 'visa DEBIT', bin: '408408', exp_month: '12' },
      customer: { email: 'p@example.com' },
    });
    expect(o).toMatchObject({ status: 'success', amount: 1500, providerRef: '991', last4: '4081', brand: 'visa' });
    expect(JSON.stringify(o.raw)).not.toContain('408408');
    expect(JSON.stringify(o.raw)).not.toContain('p@example.com');
  });

  it('treats failed and abandoned as failed, anything else as still pending', () => {
    expect(outcomeFromPaystack({ status: 'failed', gateway_response: 'Declined' })).toMatchObject({ status: 'failed', failureReason: 'Declined' });
    expect(outcomeFromPaystack({ status: 'abandoned' }).status).toBe('failed');
    expect(outcomeFromPaystack({ status: 'ongoing' }).status).toBe('pending');
  });

  it('names card brands', () => {
    expect(cardBrand('mastercard CREDIT')).toBe('mastercard');
    expect(cardBrand('american express')).toBe('amex');
    expect(cardBrand('verve')).toBe('unknown');
  });

  it('the mock card pays after a short wait, for exactly the amount charged', async () => {
    const createdAt = new Date(1_000_000).toISOString();
    const early = await verifyCardCheckout({ secretKey: undefined, reference: 'DM-FEE-x', createdAt, amount: 700, now: 1_000_000 + 1000 });
    expect(early.status).toBe('pending');
    const later = await verifyCardCheckout({ secretKey: undefined, reference: 'DM-FEE-x', createdAt, amount: 700, now: 1_000_000 + MOCK_CARD_DELAY_MS });
    expect(later).toMatchObject({ status: 'success', amount: 700, last4: '4242' });
  });

  it('asks Paystack when keyed, and reads an unanswered check as pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    const o = await verifyCardCheckout({ secretKey: 'sk', reference: 'DM-FEE-1', createdAt: '', amount: 1 });
    expect(o.status).toBe('pending');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.paystack.co/transaction/verify/DM-FEE-1');
  });
});

describe('the webhook signature', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'DM-FEE-1' } });
  const sign = (key: string) => createHmac('sha512', key).update(body).digest('hex');

  it('accepts Paystack’s HMAC-SHA512 signature', async () => {
    expect(await validPaystackSignature(body, sign('sk_test_key'), 'sk_test_key')).toBe(true);
    expect(await validPaystackSignature(body, sign('sk_test_key').toUpperCase(), 'sk_test_key')).toBe(true);
  });

  it('refuses a missing, wrong-key or tampered signature', async () => {
    expect(await validPaystackSignature(body, null, 'sk_test_key')).toBe(false);
    expect(await validPaystackSignature(body, sign('another'), 'sk_test_key')).toBe(false);
    expect(await validPaystackSignature(body.replace('DM-FEE-1', 'DM-FEE-2'), sign('sk_test_key'), 'sk_test_key')).toBe(false);
    expect(await validPaystackSignature(body, sign('sk_test_key'), '')).toBe(false);
  });
});
