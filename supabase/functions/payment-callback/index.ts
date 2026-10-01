import { adminClient } from '../_shared/auth.ts';
import { json } from '../_shared/http.ts';
import { processStkCallback, type StkCallback } from '../_shared/mpesa.ts';

/**
 * Where Safaricom reports the outcome of an STK Push.
 *
 * Safaricom sends no bearer token and does not sign its callbacks, so this
 * function is deployed with JWT verification off (config.toml) and checks a
 * shared secret instead: the `key` query parameter must equal the
 * MPESA_CALLBACK_SECRET, which only appears in the CallBackURL this project
 * gives Daraja. A request without it is ignored.
 *
 * Even an authentic callback cannot credit more than was asked for: the
 * database compares the amount with the payment it names, settles each
 * payment once, and ignores replays. (The name avoids "mpesa" on purpose —
 * Daraja rejects callback URLs that contain it.)
 *
 * The response is always 200 with Daraja's "accepted" body once the request
 * is authentic, including when the payment is unknown. Anything else makes
 * Safaricom retry an outcome that will never be applied.
 */

const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' };

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST required.' }, 405);

  const expected = Deno.env.get('MPESA_CALLBACK_SECRET') ?? '';
  const given = new URL(req.url).searchParams.get('key') ?? '';
  if (!expected || !sameSecret(given, expected)) {
    // No detail about why: probing learns nothing about the secret.
    return json({ ResultCode: 1, ResultDesc: 'Rejected' }, 401);
  }

  let payload: StkCallback;
  try {
    payload = await req.json();
  } catch {
    return json(ACCEPTED);
  }

  try {
    const outcome = await processStkCallback(adminClient(), payload);
    if (!outcome.handled) console.warn('[payment-callback] unknown checkout');
    return json(ACCEPTED);
  } catch (error) {
    // A database failure is the one case worth a retry from Safaricom.
    console.error('[payment-callback]', error instanceof Error ? error.message : 'unknown');
    return json({ ResultCode: 1, ResultDesc: 'Temporary failure' }, 500);
  }
});
