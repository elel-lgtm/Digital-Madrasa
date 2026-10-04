import { getSurah } from './quran';

/**
 * The tajweed mistake map: findings counted per ayah and rule across a
 * madrasa (migration 0031), shaped for the teacher's screen.
 */

export interface HeatmapCell {
  surahNo: number;
  ayahNo: number;
  rule: string;
  /** Findings of this rule on this ayah. */
  mistakes: number;
  /** Distinct pupils who made them. */
  students: number;
}

export interface HeatmapAyah {
  ayahNo: number;
  mistakes: number;
  /** Rules on this ayah, most frequent first. */
  rules: { rule: string; mistakes: number; students: number }[];
}

export interface HeatmapSurah {
  surahNo: number;
  surahName: string;
  ayahCount: number;
  mistakes: number;
  /** Only ayahs with findings, in mushaf order. */
  ayahs: HeatmapAyah[];
}

export interface HeatmapSummary {
  /** Surahs with findings, most mistakes first. */
  surahs: HeatmapSurah[];
  /** Rules across everything, most frequent first. */
  rules: { rule: string; mistakes: number }[];
  /** The highest count on any one ayah, for scaling colours. */
  maxPerAyah: number;
  total: number;
}

export function summariseHeatmap(cells: readonly HeatmapCell[], rule?: string | null): HeatmapSummary {
  const ruleTotals = new Map<string, number>();
  const bySurah = new Map<number, Map<number, HeatmapAyah>>();
  let total = 0;

  for (const c of cells) {
    const surah = getSurah(c.surahNo);
    if (!surah || c.ayahNo < 1 || c.ayahNo > surah.ayahCount || c.mistakes <= 0) continue;
    ruleTotals.set(c.rule, (ruleTotals.get(c.rule) ?? 0) + c.mistakes);
    if (rule && c.rule !== rule) continue;

    total += c.mistakes;
    const ayahs = bySurah.get(c.surahNo) ?? new Map<number, HeatmapAyah>();
    bySurah.set(c.surahNo, ayahs);
    const ayah = ayahs.get(c.ayahNo) ?? { ayahNo: c.ayahNo, mistakes: 0, rules: [] };
    ayahs.set(c.ayahNo, ayah);
    ayah.mistakes += c.mistakes;
    ayah.rules.push({ rule: c.rule, mistakes: c.mistakes, students: c.students });
  }

  let maxPerAyah = 0;
  const surahs: HeatmapSurah[] = [...bySurah.entries()].map(([surahNo, ayahs]) => {
    const s = getSurah(surahNo)!;
    const list = [...ayahs.values()].sort((a, b) => a.ayahNo - b.ayahNo);
    for (const a of list) {
      a.rules.sort((x, y) => y.mistakes - x.mistakes || x.rule.localeCompare(y.rule));
      maxPerAyah = Math.max(maxPerAyah, a.mistakes);
    }
    return {
      surahNo,
      surahName: s.name,
      ayahCount: s.ayahCount,
      mistakes: list.reduce((sum, a) => sum + a.mistakes, 0),
      ayahs: list,
    };
  });
  surahs.sort((a, b) => b.mistakes - a.mistakes || a.surahNo - b.surahNo);

  const rules = [...ruleTotals.entries()]
    .map(([r, mistakes]) => ({ rule: r, mistakes }))
    .sort((a, b) => b.mistakes - a.mistakes || a.rule.localeCompare(b.rule));

  return { surahs, rules, maxPerAyah, total };
}
