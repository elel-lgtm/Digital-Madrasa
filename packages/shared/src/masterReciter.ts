import type { QiraahStyle } from './constants';

/**
 * Master reciters a pupil can compare their recitation with, ayah by ayah.
 *
 * Audio is streamed from EveryAyah.com, which publishes it under CC BY-NC:
 * free with attribution for non-commercial use. The app credits it beside
 * the player. A commercial release would need a licensed source; only
 * `MASTER_AUDIO_BASE` and the folders below would change.
 */
export const MASTER_AUDIO_BASE = 'https://everyayah.com/data';
export const MASTER_AUDIO_CREDIT = 'Recitation audio: EveryAyah.com (CC BY-NC)';

export interface MasterReciter {
  id: string;
  name: string;
  nameAr: string;
  /** Folder on EveryAyah.com. */
  folder: string;
  qiraah: QiraahStyle;
  /** Slow, phrase-by-phrase teaching style: the best model for a learner. */
  teaching?: boolean;
}

export const MASTER_RECITERS: readonly MasterReciter[] = [
  { id: 'husary-muallim', name: 'Al-Husary (teaching)', nameAr: 'الحصري (المعلّم)', folder: 'Husary_Muallim_128kbps', qiraah: 'hafs', teaching: true },
  { id: 'alafasy', name: 'Mishary Alafasy', nameAr: 'مشاري العفاسي', folder: 'Alafasy_128kbps', qiraah: 'hafs' },
  { id: 'minshawy', name: 'Al-Minshawy', nameAr: 'المنشاوي', folder: 'Minshawy_Murattal_128kbps', qiraah: 'hafs' },
  { id: 'dosary-warsh', name: 'Ibrahim Al-Dosary (Warsh)', nameAr: 'إبراهيم الدوسري (ورش)', folder: 'warsh/warsh_ibrahim_aldosary_128kbps', qiraah: 'warsh' },
];

/** Reciters in the same qiraah as the pupil, teaching style first. */
export function recitersFor(qiraah: QiraahStyle): MasterReciter[] {
  return MASTER_RECITERS.filter((r) => r.qiraah === qiraah).sort(
    (a, b) => Number(Boolean(b.teaching)) - Number(Boolean(a.teaching)),
  );
}

/** EveryAyah names each file SSSAAA.mp3: surah and ayah, zero-padded. */
export function masterAyahUrl(reciter: MasterReciter, surahNo: number, ayahNo: number): string {
  const pad = (n: number) => String(n).padStart(3, '0');
  return `${MASTER_AUDIO_BASE}/${reciter.folder}/${pad(surahNo)}${pad(ayahNo)}.mp3`;
}

/** The ayahs of a passage in order, clamped to sane bounds. */
export function passageAyahs(ayahFrom: number, ayahTo: number, max = 40): number[] {
  const from = Math.max(1, Math.floor(ayahFrom));
  const to = Math.max(from, Math.floor(ayahTo));
  return Array.from({ length: Math.min(to - from + 1, max) }, (_, i) => from + i);
}
