import { describe, expect, it } from 'vitest';
import {
  gradeSubmissionSchema,
  initiatePaymentSchema,
  issueCertificateSchema,
  issueInvoicesSchema,
  madrasaLifecycleSchema,
  payFeesSchema,
  phoneSchema,
  startSubscriptionPaymentSchema,
  submitAssignmentSchema,
  cardDetailsSchema,
  normaliseKenyanPhone,
} from './index';

const ID = '3f0c9a52-7d7e-4b8e-9d2a-0e1f5b6c7d8e';
const ID2 = 'a1b2c3d4-0000-4000-8000-000000000000';
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe('money: the client never names an amount', () => {
  it('strips an amount smuggled into a fee payment', () => {
    const parsed = payFeesSchema.parse({ channel: 'mpesa', invoiceIds: [ID], phone: '+254 712 345 678', amount: 1 });
    expect(parsed).not.toHaveProperty('amount');
    expect(parsed).toEqual({ channel: 'mpesa', invoiceIds: [ID], phone: '+254712345678' });
  });

  it('strips an amount smuggled into a subscription payment', () => {
    const parsed = startSubscriptionPaymentSchema.parse({ channel: 'mpesa', phone: '+254712345678', amount: 1 });
    expect(parsed).not.toHaveProperty('amount');
  });

  it('requires at least one invoice, and caps the older entry point at ten', () => {
    expect(messages(payFeesSchema.safeParse({ channel: 'mpesa', invoiceIds: [], phone: '+254712345678' }))).toContain(
      'validation.no_invoices_selected',
    );
    const eleven = Array.from({ length: 11 }, () => ID);
    expect(initiatePaymentSchema.safeParse({ invoiceIds: eleven, phone: '+254712345678' }).success).toBe(false);
  });
});

describe('phone numbers', () => {
  // The schema takes the international form; screens run normaliseKenyanPhone
  // first, so every way a parent types a number reaches it as +254….
  it('accepts +254 / 254 mobiles however they are spaced', () => {
    for (const ok of ['+254712345678', '254712345678', '+254 712-345-678', '+254112345678']) {
      expect(phoneSchema.safeParse(ok).success, ok).toBe(true);
    }
  });

  it('accepts what a parent types once it has been normalised, as the screens do', () => {
    for (const typed of ['0712345678', '0712 345 678', '712345678']) {
      expect(phoneSchema.safeParse(normaliseKenyanPhone(typed)).success, typed).toBe(true);
    }
  });

  it('rejects landlines, short numbers and other countries', () => {
    for (const bad of ['+254202345678', '+25471234567', '+255712345678', 'abc']) {
      expect(phoneSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('invoice targeting', () => {
  const base = { feeStructureId: ID, dueDate: '2026-10-15' };

  it('demands a scope, so a forgotten target cannot become "bill everyone"', () => {
    expect(issueInvoicesSchema.safeParse(base).success).toBe(false);
  });

  it('demands the student or class that the scope names', () => {
    expect(messages(issueInvoicesSchema.safeParse({ ...base, scope: 'student' }))).toContain('validation.student_required');
    expect(messages(issueInvoicesSchema.safeParse({ ...base, scope: 'class' }))).toContain('validation.class_required');
    expect(issueInvoicesSchema.safeParse({ ...base, scope: 'class', classId: ID2 }).success).toBe(true);
    expect(issueInvoicesSchema.safeParse({ ...base, scope: 'madrasa' }).success).toBe(true);
  });
});

describe('madrasa lifecycle', () => {
  it('needs a written reason for everything except reinstatement', () => {
    for (const action of ['suspend', 'schedule_deletion', 'purge'] as const) {
      expect(messages(madrasaLifecycleSchema.safeParse({ madrasaId: ID, action, confirmName: 'X' }))).toContain(
        'validation.reason_required',
      );
    }
    expect(madrasaLifecycleSchema.safeParse({ madrasaId: ID, action: 'reinstate' }).success).toBe(true);
  });

  it('needs the name typed back before a purge', () => {
    const r = madrasaLifecycleSchema.safeParse({ madrasaId: ID, action: 'purge', reason: 'Owner asked in writing' });
    expect(messages(r)).toContain('validation.confirm_name_required');
  });

  it('rejects an unknown action', () => {
    expect(madrasaLifecycleSchema.safeParse({ madrasaId: ID, action: 'delete', reason: 'because' }).success).toBe(false);
  });
});

describe('learning writes', () => {
  it('requires an answer before handing in', () => {
    expect(messages(submitAssignmentSchema.safeParse({ assignmentId: ID, textBody: '   ' }))).toContain(
      'validation.body_required',
    );
  });

  it('keeps marks within 0–100 and to the two outcomes a teacher can give', () => {
    expect(gradeSubmissionSchema.safeParse({ submissionId: ID, score: 101, status: 'graded' }).success).toBe(false);
    expect(gradeSubmissionSchema.safeParse({ submissionId: ID, score: -1, status: 'graded' }).success).toBe(false);
    expect(gradeSubmissionSchema.safeParse({ submissionId: ID, score: 80, status: 'pending' }).success).toBe(false);
    expect(gradeSubmissionSchema.safeParse({ submissionId: ID, score: 80, status: 'returned' }).success).toBe(true);
  });

  it('only issues the certificate kinds the database knows', () => {
    expect(issueCertificateSchema.safeParse({ studentId: ID, kind: 'juz_completion', title: 'Juz 30 completed' }).success).toBe(true);
    expect(issueCertificateSchema.safeParse({ studentId: ID, kind: 'phd', title: 'Doctorate' }).success).toBe(false);
  });
});

describe('card details (validated on the device, never sent to our server)', () => {
  const card = { number: '4242 4242 4242 4242', expiry: '12/39', cvv: '123', holderName: 'Amina Yusuf' };

  it('accepts a well-formed card and does not save it unless asked', () => {
    const parsed = cardDetailsSchema.parse(card);
    expect(parsed.number).toBe('4242424242424242');
    expect(parsed.saveCard).toBe(false);
  });

  it('catches a mistyped number, a past expiry and a CVV of the wrong length for the brand', () => {
    expect(cardDetailsSchema.safeParse({ ...card, number: '4242 4242 4242 4241' }).success).toBe(false);
    expect(cardDetailsSchema.safeParse({ ...card, expiry: '01/20' }).success).toBe(false);
    expect(cardDetailsSchema.safeParse({ ...card, number: '3782 822463 10005', cvv: '123' }).success).toBe(false);
    expect(cardDetailsSchema.safeParse({ ...card, number: '3782 822463 10005', cvv: '1234' }).success).toBe(true);
  });
});
