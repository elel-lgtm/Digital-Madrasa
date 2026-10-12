/**
 * M-Pesa details shared by the app and the payments Edge Function.
 *
 * Deliberately import-free: the Edge Function (Deno) imports this file
 * directly, as it does quran.ts and voiceReport.ts.
 */

/** Why an STK push did not complete, from Daraja's ResultCode. */
export type MpesaFailureCode = 'cancelled' | 'timeout' | 'insufficient_funds' | 'wrong_pin' | 'other';

/** Daraja ResultCode → our code and the plain sentence stored on the payment. */
export const MPESA_FAILURES: Record<number, { code: MpesaFailureCode; reason: string }> = {
  1032: { code: 'cancelled', reason: 'The request was cancelled on the phone.' },
  1037: { code: 'timeout', reason: 'The phone could not be reached, or the prompt timed out.' },
  1: { code: 'insufficient_funds', reason: 'The M-Pesa balance was not enough.' },
  2001: { code: 'wrong_pin', reason: 'The M-Pesa PIN entered was wrong.' },
};

/** The stored failure sentence back to its code, so the app can advise in any language. */
export function mpesaFailureCode(reason: string | null | undefined): MpesaFailureCode | null {
  if (!reason) return null;
  const hit = Object.values(MPESA_FAILURES).find((f) => f.reason === reason);
  return hit ? hit.code : 'other';
}

/**
 * Simulated M-Pesa only: phone numbers ending in these digits fail in a
 * particular way, so every outcome can be shown without a real phone.
 * Anything else succeeds.
 */
export const MPESA_TEST_ENDINGS: Record<string, number> = {
  '9999': 1032,
  '8888': 1,
  '7777': 1037,
  '6666': 2001,
};

export function simulatedResultCode(msisdn: string): number {
  const hit = Object.entries(MPESA_TEST_ENDINGS).find(([ending]) => msisdn.endsWith(ending));
  return hit ? hit[1] : 0;
}

/**
 * A transaction code shaped like Safaricom's: ten characters, the first for
 * the year (Q = 2022, then one letter a year), the second for the month
 * (A = January), then eight letters and digits. Used only by the simulator;
 * real codes come from Safaricom.
 */
export function mpesaStyleCode(date: Date, random: () => number = Math.random): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const year = letters[Math.min(25, Math.max(0, 16 + (date.getUTCFullYear() - 2022)))];
  const month = letters[date.getUTCMonth()];
  let rest = '';
  for (let i = 0; i < 8; i += 1) rest += alphabet[Math.floor(random() * alphabet.length)];
  return `${year}${month}${rest}`;
}

/** 2547XXXXXXXX → 07*****XXX, the way M-Pesa itself shows a number. */
export function maskKenyanPhone(msisdnOrLocal: string): string {
  const digits = msisdnOrLocal.replace(/\D/g, '');
  const local = digits.startsWith('254') ? `0${digits.slice(3)}` : digits.startsWith('0') ? digits : `0${digits}`;
  return `${local.slice(0, 2)}*****${local.slice(-3)}`;
}
