import { describe, expect, it } from 'vitest';
import { certificateHtml, escapeHtml, verifyUrlFor } from './html';

const doc = {
  title: 'Juz 30 completed',
  kindLabel: 'Juz completion',
  studentName: 'Aisha Hassan Omar',
  madrasaName: 'Madrasat An-Nur',
  issuedAt: '2026-10-04T08:00:00Z',
  verificationCode: 'ABCDE23456',
  verifyUrl: verifyUrlFor('https://x.supabase.co/', 'ABCDE23456'),
};

describe('printable certificate', () => {
  it('points the QR code at the public verification page for that code', () => {
    expect(doc.verifyUrl).toBe('https://x.supabase.co/functions/v1/verify?code=ABCDE23456');
  });

  it('shows the pupil, title, code, both calendars and a QR code', async () => {
    const html = await certificateHtml(doc);
    expect(html).toContain('Aisha Hassan Omar');
    expect(html).toContain('Juz 30 completed');
    expect(html).toContain('ABCDE23456');
    expect(html).toContain('4 October 2026');
    expect(html).toMatch(/\d+ Rabi al-Thani 1448 AH/);
    expect(html).toContain('<svg');
  });

  it('cannot be made to carry markup through a name or title', async () => {
    const html = await certificateHtml({ ...doc, studentName: '<script>alert(1)</script>', title: '"><img src=x>' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('prints the chain of transmission on an ijazah', async () => {
    const html = await certificateHtml({ ...doc, sanad: ['Sheikh Umar', 'Sheikh Ali'] });
    expect(html).toContain('Chain of transmission');
    expect(html).toContain('Sheikh Umar');
    expect(html).not.toContain('Chain of transmission (sanad)</div></div>'.repeat(2));
  });
});
