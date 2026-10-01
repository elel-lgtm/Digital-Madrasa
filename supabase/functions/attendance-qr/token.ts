/**
 * Rotating QR attendance tokens.
 *
 * `classId.window.mac`, where `window` is a 30-second slot number and `mac` is
 * the first 128 bits of HMAC-SHA-256 over `classId.window`, keyed by a server
 * secret. Nothing is stored: a token is checked by recomputing it. Pure Web
 * Crypto, so it runs the same in the Edge runtime and under the unit tests.
 */

export const WINDOW_SECONDS = 30;

export function windowNumber(at = Date.now()): number {
  return Math.floor(at / 1000 / WINDOW_SECONDS);
}

export async function signToken(secret: string, classId: string, window: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${classId}.${window}`));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${classId}.${window}.${hex.slice(0, 32)}`;
}

/** Compares without stopping at the first difference, so timing reveals nothing. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The class a token is for, or null. Accepts the current window and the one
 * before it — clock skew and a slow camera — and nothing older or newer.
 */
export async function verifyToken(secret: string, token: string, at = Date.now()): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [classId, windowRaw] = parts;
  const window = Number(windowRaw);
  if (!classId || !Number.isInteger(window)) return null;

  const now = windowNumber(at);
  if (window !== now && window !== now - 1) return null;

  const expected = await signToken(secret, classId, window);
  return sameString(expected, token) ? classId : null;
}
