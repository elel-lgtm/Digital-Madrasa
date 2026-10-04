import { describe, expect, it } from 'vitest';
import { VOICE_LANGS, voiceReportText, type VoiceReportFacts } from './voiceReport';

const facts: VoiceReportFacts = {
  childName: 'Amina',
  attended: 9,
  sessions: 10,
  memorisedSurahs: 12,
  learning: { surahName: 'Al-Mulk', ayah: 12 },
  lastScore: 86.4,
  teacherRemark: 'Very good. Watch the madd.',
  balance: 1500,
};

describe('voice report', () => {
  it('reads the whole report in English', () => {
    const text = voiceReportText(facts, 'en');
    expect(text).toContain('Amina came to 9 of 10 classes');
    expect(text).toContain('12 surahs');
    expect(text).toContain('Al-Mulk, up to ayah 12');
    expect(text).toContain('scored 86 out of one hundred');
    expect(text).toContain('The teacher says: Very good.');
    expect(text).toContain('1,500 shillings');
  });

  it('leaves out what is not known and thanks a family that has paid', () => {
    const text = voiceReportText({ ...facts, sessions: 0, attended: 0, learning: null, lastScore: null, teacherRemark: null, balance: 0 }, 'en');
    expect(text).toContain('No classes have been recorded');
    expect(text).not.toContain('ayah');
    expect(text).not.toContain('scored');
    expect(text).toContain('All fees are paid');
  });

  it('has every sentence in every language', () => {
    for (const lang of VOICE_LANGS) {
      const text = voiceReportText(facts, lang);
      expect(text).toContain('Amina');
      expect(text).toContain('Al-Mulk');
      expect(text).toContain('1,500');
      expect(text.length).toBeGreaterThan(150);
    }
  });

  it('keeps a long remark short enough to listen to', () => {
    const text = voiceReportText({ ...facts, teacherRemark: 'x'.repeat(1000) }, 'sw');
    expect(text.length).toBeLessThan(700);
  });
});
