import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JUZ_AYAH_COUNT, JUZ_START } from './hifz';
import { SURAHS } from './quran';

/**
 * The offline library's files (supabase/seed/quran, built by
 * scripts/build-quran-juz.mjs) must split the mushaf exactly where the app's
 * memorisation totals do. If either side changes alone, this fails.
 */
const root = resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'supabase/seed/quran/manifest.json'), 'utf8')) as {
  juz: { juz: number; file: string; ayahs: number; from: [number, number]; to: [number, number] }[];
};

describe('offline library data', () => {
  it('lists all 30 juz with the same sizes as hifz.ts', () => {
    expect(manifest.juz).toHaveLength(30);
    manifest.juz.forEach((entry, i) => {
      expect(entry.juz).toBe(i + 1);
      expect(entry.ayahs).toBe(JUZ_AYAH_COUNT[i]);
      expect(entry.from).toEqual(JUZ_START[i]);
    });
  });

  it('matches the surah table ayah for ayah', () => {
    const counts = new Map<number, number>();
    for (const entry of manifest.juz) {
      const book = JSON.parse(readFileSync(resolve(root, 'supabase/seed/quran', entry.file), 'utf8')) as {
        surahs: { number: number; ayahs: { n: number }[] }[];
      };
      for (const surah of book.surahs) {
        counts.set(surah.number, (counts.get(surah.number) ?? 0) + surah.ayahs.length);
      }
    }
    for (const surah of SURAHS) expect(counts.get(surah.number)).toBe(surah.ayahCount);
  });
});
