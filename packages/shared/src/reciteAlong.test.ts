import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { followRecitation, mushafWords, normaliseArabic, wordsMatch } from './reciteAlong';

const juz30 = JSON.parse(readFileSync(resolve(__dirname, '../../../supabase/seed/quran/juz-30.json'), 'utf8')) as {
  surahs: { number: number; ayahs: { n: number; text: string }[] }[];
};
const juz1 = JSON.parse(readFileSync(resolve(__dirname, '../../../supabase/seed/quran/juz-01.json'), 'utf8')) as typeof juz30;
const surah = (book: typeof juz30, n: number) => book.surahs.find((s) => s.number === n)!.ayahs;

describe('recite-along', () => {
  it('strips harakat and Quranic marks', () => {
    expect(normaliseArabic('ٱللَّهُ')).toBe('الله');
    expect(normaliseArabic('ٱلصَّمَدُ')).toBe('الصمد');
  });

  it('matches Uthmani spelling with the modern spelling a recogniser writes', () => {
    expect(wordsMatch('ٱلصِّرَٰطَ', 'الصراط')).toBe(true);
    expect(wordsMatch('كُفُوًا', 'كفوا')).toBe(true);
    expect(wordsMatch('إِلَٰهِ', 'اله')).toBe(true);
    expect(wordsMatch('ٱلرَّحۡمَٰنِ', 'الرحمن')).toBe(true);
    expect(wordsMatch('ٱلصَّمَدُ', 'الناس')).toBe(false);
  });

  it('follows Al-Ikhlas recited in full', () => {
    const words = mushafWords(surah(juz30, 112));
    const heard = 'قل هو الله احد الله الصمد لم يلد ولم يولد ولم يكن له كفوا احد';
    const f = followRecitation(words, heard);
    expect(f.done).toBe(true);
    expect(f.states.every((s) => s === 'recited')).toBe(true);
  });

  it('follows Al-Fatihah as a recogniser writes it', () => {
    const words = mushafWords(surah(juz1, 1));
    const heard =
      'بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين اياك نعبد واياك نستعين ' +
      'اهدنا الصراط المستقيم صراط الذين انعمت عليهم غير المغضوب عليهم ولا الضالين';
    const f = followRecitation(words, heard);
    expect(f.done).toBe(true);
    expect(f.states.filter((s) => s === 'missed')).toHaveLength(0);
  });

  it('marks a skipped word and keeps the place', () => {
    const words = mushafWords(surah(juz30, 112));
    // "هو" left out of the first ayah
    const f = followRecitation(words, 'قل الله احد الله');
    expect(f.states.slice(0, 5)).toEqual(['recited', 'missed', 'recited', 'recited', 'recited']);
    expect(f.cursor).toBe(5);
  });

  it('ignores a cough or a repeated word', () => {
    const words = mushafWords(surah(juz30, 112));
    const f = followRecitation(words, 'قل قل هو امم الله احد');
    expect(f.cursor).toBe(4);
    expect(f.states.slice(0, 4).every((s) => s === 'recited')).toBe(true);
  });

  it('keeps pause marks with the word before them', () => {
    const words = mushafWords([{ n: 1, text: 'كَلَّا ۖ سَيَعۡلَمُونَ' }]);
    expect(words).toHaveLength(2);
    expect(words[0]!.display).toContain('ۖ');
  });
});
