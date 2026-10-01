import { describe, expect, it } from 'vitest';
import { WINDOW_SECONDS, signToken, verifyToken, windowNumber } from './token';

const SECRET = 'test-secret-not-used-anywhere-else';
const CLASS = '3f0c9a52-7d7e-4b8e-9d2a-0e1f5b6c7d8e';
const T0 = Date.UTC(2026, 8, 30, 8, 0, 0); // a fixed instant, so windows are stable

describe('QR attendance tokens', () => {
  it('round-trips within the same window', async () => {
    const token = await signToken(SECRET, CLASS, windowNumber(T0));
    expect(await verifyToken(SECRET, token, T0)).toBe(CLASS);
  });

  it('accepts the previous window (clock skew, slow camera) but not two back', async () => {
    const w = windowNumber(T0);
    const previous = await signToken(SECRET, CLASS, w - 1);
    const older = await signToken(SECRET, CLASS, w - 2);
    expect(await verifyToken(SECRET, previous, T0)).toBe(CLASS);
    expect(await verifyToken(SECRET, older, T0)).toBeNull();
  });

  it('rejects a token from the future, so next window cannot be pre-shared', async () => {
    const next = await signToken(SECRET, CLASS, windowNumber(T0) + 1);
    expect(await verifyToken(SECRET, next, T0)).toBeNull();
  });

  it('expires a screenshot after at most two windows', async () => {
    const token = await signToken(SECRET, CLASS, windowNumber(T0));
    expect(await verifyToken(SECRET, token, T0 + WINDOW_SECONDS * 1000)).toBe(CLASS);
    expect(await verifyToken(SECRET, token, T0 + 2 * WINDOW_SECONDS * 1000)).toBeNull();
  });

  it('cannot be forged without the secret', async () => {
    const w = windowNumber(T0);
    const forged = await signToken('guessed-secret', CLASS, w);
    expect(await verifyToken(SECRET, forged, T0)).toBeNull();
  });

  it('binds the token to its class: swapping the class id invalidates it', async () => {
    const w = windowNumber(T0);
    const token = await signToken(SECRET, CLASS, w);
    const [, win, mac] = token.split('.');
    const other = 'a1b2c3d4-0000-4000-8000-000000000000';
    expect(await verifyToken(SECRET, `${other}.${win}.${mac}`, T0)).toBeNull();
  });

  it('rejects a tampered mac and malformed input', async () => {
    const token = await signToken(SECRET, CLASS, windowNumber(T0));
    const flipped = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    expect(await verifyToken(SECRET, flipped, T0)).toBeNull();
    for (const bad of ['', 'x', 'a.b', `${CLASS}.notanumber.abc`, `${CLASS}.1.5.extra`, `.${windowNumber(T0)}.abc`]) {
      expect(await verifyToken(SECRET, bad, T0)).toBeNull();
    }
  });
});
