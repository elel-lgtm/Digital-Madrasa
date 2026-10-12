import { juzForSurah } from '@digital-madrasa/shared';
import { isDownloaded, librarySupported, readJuz } from '@/offline/quranLibrary';

export interface SurahText {
  number: number;
  name: string;
  transliteration: string;
  ayahs: { n: number; text: string }[];
}

// Al-Fatihah and Juz 'Amma ship with the app (the recite-along bundle).
const BUNDLED = require('../../assets/quran/recite-along.json') as { surahs: SurahText[] };

export const BUNDLED_SURAHS = BUNDLED.surahs;

/** A surah's Uthmani text: bundled, or from a downloaded juz, or null. */
export async function loadSurahText(surahNo: number): Promise<SurahText | null> {
  const bundled = BUNDLED.surahs.find((s) => s.number === surahNo);
  if (bundled) return bundled;
  const juz = juzForSurah(surahNo);
  if (!librarySupported || !isDownloaded(juz)) return null;
  const book = await readJuz(juz);
  return book.surahs.find((s) => s.number === surahNo) ?? null;
}
