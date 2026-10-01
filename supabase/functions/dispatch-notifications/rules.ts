/**
 * Which channels a notification goes out on. Pure, so it is unit-tested
 * (rules.test.ts) apart from the dispatcher that sends.
 */

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
export type Channel = 'push' | 'email' | 'sms';
export type Prefs = Record<string, Partial<Record<Channel, boolean>>>;

/** Mirrors DEFAULT_PREFS in the app (queries-comms.ts). */
export const DEFAULT_PREFS: Prefs = {
  fees: { push: true, email: true, sms: true },
  attendance: { push: true, email: false, sms: false },
  grades: { push: true, email: true, sms: false },
  announcements: { push: true, email: false, sms: false },
  messages: { push: true, email: false, sms: false },
  progress: { push: false, email: true, sms: false },
};

/**
 * Which preference switch governs a notification type. Account events —
 * link decisions, a madrasa's status — have no switch: they are sent on
 * every channel they ask for, because missing them locks a family out.
 */
export function categoryOf(type: string): string | null {
  if (type === 'fee_due' || type === 'payment_receipt') return 'fees';
  if (type.startsWith('attendance') || type === 'absence') return 'attendance';
  if (type.startsWith('grade')) return 'grades';
  if (type === 'announcement') return 'announcements';
  if (type === 'message') return 'messages';
  if (type === 'certificate_issued' || type.startsWith('recitation') || type.startsWith('progress')) {
    return 'progress';
  }
  return null;
}

/** What the notification asks for, narrowed by the recipient's switches. */
export function channelsFor(n: Row, prefs: Prefs | null): Channel[] {
  const wanted = (n.channel ?? []).filter((c: string): c is Channel => c === 'push' || c === 'email' || c === 'sms');
  const category = categoryOf(n.type);
  if (!category) return wanted;
  const switches = { ...DEFAULT_PREFS[category], ...(prefs?.[category] ?? {}) };
  return wanted.filter((c: Channel) => switches[c] !== false);
}

/** A stored phone number as +2547XXXXXXXX / +2541XXXXXXXX, or null if it is not one. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('254') ? digits.slice(3) : digits.replace(/^0/, '');
  return /^[17]\d{8}$/.test(local) ? `+254${local}` : null;
}
