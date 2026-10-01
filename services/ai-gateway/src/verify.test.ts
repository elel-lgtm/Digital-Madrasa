import { describe, expect, it } from 'vitest';
import { hasLeakedAlias, restoreNames } from './context';
import { deterministicFallback, verifyNumbers } from './verify';

const facts = 'Student A: attendance 95% over 20 sessions, 1 absence, 12 surahs memorised.';

describe('numeric guard', () => {
  it('accepts a reply that only uses figures from the records', () => {
    expect(verifyNumbers('Attendance is 95% with 1 absence.', facts)).toEqual({ ok: true, invented: [] });
  });

  it('catches the rounding the small model did in practice (95% → 100%)', () => {
    const result = verifyNumbers('Perfect attendance (100%)!', facts);
    expect(result.ok).toBe(false);
    expect(result.invented).toEqual(['100']);
  });

  it('catches invented counts', () => {
    expect(verifyNumbers('Only 3 absences this term.', facts).invented).toEqual(['3']);
    expect(verifyNumbers('15 surahs memorised so far.', facts).invented).toEqual(['15']);
  });

  it('accepts any integer that literally appears in the source', () => {
    expect(verifyNumbers('20 sessions attended.', facts).ok).toBe(true);
  });

  it('falls back to the records verbatim', () => {
    expect(deterministicFallback(facts)).toContain(facts);
  });
});

describe('pseudonyms', () => {
  const map = { 'Student A': 'Amina Yusuf', 'Student B': 'Bashir Omar' };

  it('restores full aliases', () => {
    expect(restoreNames('Student A is doing well; Student B needs revision.', map)).toBe(
      'Amina Yusuf is doing well; Bashir Omar needs revision.',
    );
  });

  it('restores a bare letter the model shortened an alias to, except English words', () => {
    expect(restoreNames('B should revise Al-Mulk.', map)).toBe('Bashir Omar should revise Al-Mulk.');
    // "A" is an English word: replacing it would corrupt real prose.
    expect(restoreNames('A grade of 70 was recorded.', map)).toBe('A grade of 70 was recorded.');
  });

  it('detects an alias that survived into the output', () => {
    expect(hasLeakedAlias('Student C is absent.')).toBe(true);
    expect(hasLeakedAlias('Amina Yusuf is present.')).toBe(false);
  });
});
