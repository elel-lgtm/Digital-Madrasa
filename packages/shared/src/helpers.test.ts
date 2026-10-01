import { describe, expect, it } from 'vitest';
import {
  billingUrgency,
  canManageMeetingLink,
  canUseAdminFeatures,
  detectCardBrand,
  formatCardNumber,
  isCardExpired,
  isSessionHost,
  isValidCardNumber,
  liveSessionState,
  maskAdmissionNo,
  meetingProvider,
  normaliseKenyanPhone,
  parseAdmissionNo,
  toLocalKenyanDigits,
  trialDaysLeft,
} from './index';

const NOW = new Date('2026-09-30T08:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

describe('admission numbers', () => {
  it('parses the DM-YYYY-NNNN form, case-insensitively', () => {
    expect(parseAdmissionNo(' dm-2026-0042 ')).toEqual({ year: 2026, sequence: 42 });
    expect(parseAdmissionNo('DM-26-42')).toBeNull();
    expect(parseAdmissionNo('XX-2026-0042')).toBeNull();
  });

  it('formats as the parent types', () => {
    expect(maskAdmissionNo('dm20260042')).toBe('DM-2026-0042');
  });
});

describe('Kenyan phone numbers', () => {
  it('normalises every common way of typing one to E.164', () => {
    for (const typed of ['0712345678', '254712345678', '+254 712 345 678', '712345678']) {
      expect(normaliseKenyanPhone(typed)).toBe('+254712345678');
    }
  });

  it('extracts the nine subscriber digits for the +254 field', () => {
    expect(toLocalKenyanDigits('+254 712 345 678')).toBe('712345678');
    expect(toLocalKenyanDigits('00712345678')).toBe('712345678');
  });
});

describe('subscription gate', () => {
  it('keeps admin features on through grace, off once restricted or cancelled', () => {
    expect(['trialing', 'active', 'past_due', 'grace'].every((s) => canUseAdminFeatures(s as never))).toBe(true);
    expect(canUseAdminFeatures('restricted')).toBe(false);
    expect(canUseAdminFeatures('cancelled')).toBe(false);
  });

  it('escalates the payment nudge as the trial runs out', () => {
    const trial = (d: number) => ({ status: 'trialing' as const, trialEndsAt: inDays(d), currentPeriodEnd: null, graceEndsAt: null });
    expect(trialDaysLeft(trial(10), NOW)).toBe(10);
    expect(billingUrgency(trial(10), NOW)).toBe('info');
    expect(billingUrgency(trial(6), NOW)).toBe('warning');
    expect(billingUrgency(trial(2), NOW)).toBe('critical');
    expect(billingUrgency({ ...trial(0), status: 'active' }, NOW)).toBe('none');
  });
});

describe('cards', () => {
  it('runs the Luhn check', () => {
    expect(isValidCardNumber('4242 4242 4242 4242')).toBe(true);
    expect(isValidCardNumber('4242 4242 4242 4241')).toBe(false);
    expect(isValidCardNumber('4242')).toBe(false);
  });

  it('detects brands and groups digits the way the card is printed', () => {
    expect(detectCardBrand('4111')).toBe('visa');
    expect(detectCardBrand('5500')).toBe('mastercard');
    expect(detectCardBrand('2221')).toBe('mastercard');
    expect(detectCardBrand('3782')).toBe('amex');
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  });

  it('treats a card as valid through the last day of its expiry month', () => {
    expect(isCardExpired(9, 2026, NOW)).toBe(false);
    expect(isCardExpired(8, 2026, NOW)).toBe(true);
    expect(isCardExpired(13, 2030, NOW)).toBe(true);
  });
});

describe('live lesson links', () => {
  it('allows only real https meeting hosts', () => {
    expect(meetingProvider('https://meet.google.com/abc-defg-hij')).toBe('google_meet');
    expect(meetingProvider('https://us02web.zoom.us/j/123')).toBe('zoom');
    expect(meetingProvider('https://teams.microsoft.com/l/meetup-join/x')).toBe('teams');
    expect(meetingProvider('http://meet.google.com/abc')).toBeNull();
  });

  it('is not fooled by look-alike URLs', () => {
    for (const spoof of [
      'https://meet.google.com@evil.example/abc',
      'https://meet.google.com.evil.example/abc',
      'https://zoom.us.evil.example/j/1',
      'https://evil.example/?next=https://meet.google.com',
      'javascript:alert(1)',
    ]) {
      expect(meetingProvider(spoof), spoof).toBeNull();
    }
  });

  it('lets only the class teacher or the owner change a link', () => {
    expect(canManageMeetingLink('t1', { id: 't1', isOwner: false })).toBe(true);
    expect(canManageMeetingLink('t1', { id: 't2', isOwner: true })).toBe(true);
    expect(canManageMeetingLink('t1', { id: 't2', isOwner: false })).toBe(false);
    expect(canManageMeetingLink(null, { id: 't2', isOwner: false })).toBe(false);
    expect(canManageMeetingLink('t1', null)).toBe(false);
    expect(isSessionHost('t1', { id: 't2' })).toBe(false);
  });

  it('opens Join 15 minutes before and closes it 90 minutes after the start', () => {
    const start = '2026-09-30T08:00:00Z';
    const at = (min: number) => new Date(Date.parse(start) + min * 60_000);
    expect(liveSessionState(start, at(-16))).toBe('upcoming');
    expect(liveSessionState(start, at(-15))).toBe('starting_soon');
    expect(liveSessionState(start, at(0))).toBe('live');
    expect(liveSessionState(start, at(89))).toBe('live');
    expect(liveSessionState(start, at(90))).toBe('ended');
  });
});
