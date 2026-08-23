/**
 * Deterministic identifiers for the mock dataset.
 *
 * Real rows use `gen_random_uuid()`. The mock needs stable ids so a reload
 * doesn't reshuffle relationships, but they must still be *shaped* like real
 * UUIDs — every Zod schema in `packages/shared` validates them as such, and we
 * want those schemas exercised in development rather than bypassed.
 */

export const NS = {
  profile: 1,
  madrasa: 2,
  student: 3,
  teacher: 4,
  klass: 5,
  lesson: 6,
  assignment: 7,
  invoice: 8,
  payment: 9,
  recitation: 10,
  attendance: 11,
  grade: 12,
  link: 13,
  message: 14,
  announcement: 15,
  mail: 16,
  feeStructure: 17,
  hifz: 18,
  thread: 19,
  notification: 20,
  certificate: 21,
  submission: 22,
  audit: 23,
  subscription: 24,
  subInvoice: 25,
  subPayment: 26,
  savedCard: 27,
  plan: 28,
} as const;

export type Namespace = (typeof NS)[keyof typeof NS];

export function uid(namespace: Namespace, n: number): string {
  const head = namespace.toString(16).padStart(8, '0');
  const tail = n.toString(16).padStart(12, '0');
  return `${head}-0000-4000-8000-${tail}`;
}

let runtimeCounter = 900;

/** Ids for rows created during a session (the "insert" path of the mock). */
export function newId(namespace: Namespace): string {
  runtimeCounter += 1;
  return uid(namespace, runtimeCounter);
}
