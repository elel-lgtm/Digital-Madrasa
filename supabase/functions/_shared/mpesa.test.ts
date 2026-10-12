import { beforeEach, describe, expect, it } from 'vitest';
import { maskMsisdn, processStkCallback, reconcilePending, stkPush, toMsisdn, type StkCallback } from './mpesa';

// The module reads configuration through Deno.env; give it a stand-in.
const env: Record<string, string> = {};
(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => env[k] } };

/** A stand-in for the service-role client: records the settlement RPC it is asked for. */
function fakeAdmin(rows: { payments?: string[]; subscriptions?: string[] }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    from(table: string) {
      let id = '';
      const q = {
        select: () => q,
        eq: (_col: string, value: string) => ((id = value), q),
        maybeSingle: async () => {
          const pool = table === 'payments' ? rows.payments ?? [] : rows.subscriptions ?? [];
          return { data: pool.includes(id) ? { id } : null };
        },
      };
      return q;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return { data: [{ status: args.p_success ? 'success' : 'failed' }], error: null };
    },
  };
  return { admin: admin as never, calls };
}

const success = (checkout: string, amount = 4500): StkCallback => ({
  Body: {
    stkCallback: {
      CheckoutRequestID: checkout,
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: amount },
          { Name: 'MpesaReceiptNumber', Value: 'SGR7ABC123' },
          { Name: 'PhoneNumber', Value: 254712345678 },
        ],
      },
    },
  },
});

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
});

describe('phone numbers', () => {
  it('turns every way a Kenyan number is typed into the Daraja MSISDN', () => {
    for (const typed of ['0712345678', '+254712345678', '254712345678', '0712 345 678', '712345678']) {
      expect(toMsisdn(typed)).toBe('254712345678');
    }
    expect(toMsisdn('0112345678')).toBe('254112345678');
  });

  it('refuses numbers that are not Kenyan mobiles', () => {
    for (const bad of ['', '12345', '0212345678', '07123456789', '+255712345678']) {
      expect(() => toMsisdn(bad)).toThrow();
    }
  });

  it('masks for display', () => {
    expect(maskMsisdn('254712345678')).toBe('07*****678');
  });
});

describe('STK push (mock provider)', () => {
  it('is the default when MPESA_ENV is unset, and encodes the demo outcome', async () => {
    const ok = await stkPush({ msisdn: '254712345678', amount: 4500, accountReference: 'DM', description: 'x' });
    const fail = await stkPush({ msisdn: '254700009999', amount: 4500, accountReference: 'DM', description: 'x' });
    expect(ok.checkoutRequestId).toMatch(/^ws_CO_MOCK_S/);
    expect(fail.checkoutRequestId).toMatch(/^ws_CO_MOCK_F/);
  });

  it('refuses fractions and non-positive amounts before any request', async () => {
    await expect(stkPush({ msisdn: '254712345678', amount: 10.5, accountReference: 'DM', description: 'x' })).rejects.toThrow();
    await expect(stkPush({ msisdn: '254712345678', amount: 0, accountReference: 'DM', description: 'x' })).rejects.toThrow();
  });
});

describe('callback settlement', () => {
  it('settles a fee payment with the amount and M-Pesa receipt', async () => {
    const { admin, calls } = fakeAdmin({ payments: ['ws_CO_1'] });
    const outcome = await processStkCallback(admin, success('ws_CO_1'));
    expect(outcome).toEqual({ handled: true, kind: 'fees', status: 'success' });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('settle_fee_payment');
    expect(calls[0].args).toMatchObject({ p_success: true, p_amount: 4500, p_provider_ref: 'SGR7ABC123', p_failure_reason: null });
  });

  it('routes a subscription checkout to the subscription settlement', async () => {
    const { admin, calls } = fakeAdmin({ subscriptions: ['ws_CO_2'] });
    await processStkCallback(admin, success('ws_CO_2', 3000));
    expect(calls[0].fn).toBe('settle_subscription_payment');
  });

  it('masks the phone number before the callback is stored', async () => {
    const { admin, calls } = fakeAdmin({ payments: ['ws_CO_1'] });
    await processStkCallback(admin, success('ws_CO_1'));
    const stored = JSON.stringify(calls[0].args.p_raw);
    expect(stored).not.toContain('712345678');
    expect(stored).toContain('07*****678');
  });

  it('records a cancelled prompt as a failure with a readable reason, and credits nothing', async () => {
    const { admin, calls } = fakeAdmin({ payments: ['ws_CO_1'] });
    await processStkCallback(admin, { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_1', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } });
    expect(calls[0].args).toMatchObject({ p_success: false, p_amount: null, p_provider_ref: null });
    expect(calls[0].args.p_failure_reason).toMatch(/cancelled/i);
  });

  it('ignores callbacks for unknown checkouts and malformed bodies without settling anything', async () => {
    const { admin, calls } = fakeAdmin({});
    expect(await processStkCallback(admin, success('ws_CO_UNKNOWN'))).toEqual({ handled: false });
    expect(await processStkCallback(admin, {})).toEqual({ handled: false });
    expect(calls).toHaveLength(0);
  });
});

describe('reconciling a pending mock payment', () => {
  it('waits for the simulated customer, then settles exactly as a callback would', async () => {
    const { admin, calls } = fakeAdmin({ payments: ['ws_CO_MOCK_Sabc'] });
    const now = new Date().toISOString();
    await reconcilePending(admin, { checkoutRequestId: 'ws_CO_MOCK_Sabc', amount: 4500, createdAt: now });
    expect(calls).toHaveLength(0); // too soon

    const earlier = new Date(Date.now() - 10_000).toISOString();
    await reconcilePending(admin, { checkoutRequestId: 'ws_CO_MOCK_Sabc', amount: 4500, createdAt: earlier });
    expect(calls[0].args).toMatchObject({ p_success: true, p_amount: 4500 });
    expect(String(calls[0].args.p_provider_ref)).toMatch(/^[A-Z]{2}[A-Z0-9]{8}$/); // shaped like a Safaricom code
  });

  it('fails the 9999 demo number', async () => {
    const { admin, calls } = fakeAdmin({ payments: ['ws_CO_MOCK_Fabc'] });
    const earlier = new Date(Date.now() - 10_000).toISOString();
    await reconcilePending(admin, { checkoutRequestId: 'ws_CO_MOCK_Fabc', amount: 4500, createdAt: earlier });
    expect(calls[0].args).toMatchObject({ p_success: false });
  });

  it('records the reason a simulated number was set up to fail with', async () => {
    const id = 'ws_CO_MOCK_F1xabc'; // as stkPush makes it for a number ending 8888
    const { admin, calls } = fakeAdmin({ payments: [id] });
    const earlier = new Date(Date.now() - 10_000).toISOString();
    await reconcilePending(admin, { checkoutRequestId: id, amount: 4500, createdAt: earlier });
    expect(calls[0].args).toMatchObject({ p_success: false, p_failure_reason: 'The M-Pesa balance was not enough.' });
  });
});
