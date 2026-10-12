import { describe, expect, it } from 'vitest';
import { maskKenyanPhone, mpesaFailureCode, mpesaStyleCode, MPESA_FAILURES, simulatedResultCode } from './mpesa';

describe('m-pesa helpers', () => {
  it('makes codes shaped like Safaricom transaction codes', () => {
    const code = mpesaStyleCode(new Date('2026-10-12T10:00:00Z'));
    expect(code).toMatch(/^[A-Z]{2}[A-Z0-9]{8}$/);
    expect(code.slice(0, 2)).toBe('UJ'); // 2026, October
    expect(mpesaStyleCode(new Date('2024-04-01T00:00:00Z')).slice(0, 2)).toBe('SD');
  });

  it('turns a stored failure sentence back into its code', () => {
    expect(mpesaFailureCode(MPESA_FAILURES[1032]!.reason)).toBe('cancelled');
    expect(mpesaFailureCode(MPESA_FAILURES[1]!.reason)).toBe('insufficient_funds');
    expect(mpesaFailureCode('M-Pesa: something else')).toBe('other');
    expect(mpesaFailureCode(null)).toBeNull();
  });

  it('simulates each outcome from the number’s last digits', () => {
    expect(simulatedResultCode('254712349999')).toBe(1032);
    expect(simulatedResultCode('254712348888')).toBe(1);
    expect(simulatedResultCode('254712347777')).toBe(1037);
    expect(simulatedResultCode('254712346666')).toBe(2001);
    expect(simulatedResultCode('254712345678')).toBe(0);
  });

  it('masks a number the way M-Pesa shows it', () => {
    expect(maskKenyanPhone('254712345678')).toBe('07*****678');
    expect(maskKenyanPhone('0712345678')).toBe('07*****678');
  });
});
