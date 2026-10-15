import { describe, expect, it } from 'vitest';
import { summariseHeatmap, type HeatmapCell } from './heatmap';

const cell = (surahNo: number, ayahNo: number, rule: string, mistakes: number, students = 1): HeatmapCell => ({
  surahNo, ayahNo, rule, mistakes, students,
});

describe('tajweed mistake map', () => {
  const cells = [
    cell(112, 2, 'ghunnah', 3, 2),
    cell(112, 2, 'madd', 1),
    cell(112, 4, 'qalqalah', 1),
    cell(1, 7, 'madd', 6, 4),
  ];

  it('puts the surah with most mistakes first', () => {
    const s = summariseHeatmap(cells);
    expect(s.surahs.map((x) => x.surahNo)).toEqual([1, 112]);
    expect(s.total).toBe(11);
  });

  it('adds rules on the same ayah together, most frequent first', () => {
    const ikhlas = summariseHeatmap(cells).surahs[1]!;
    expect(ikhlas.ayahs.map((a) => a.ayahNo)).toEqual([2, 4]);
    expect(ikhlas.ayahs[0]).toMatchObject({ mistakes: 4, rules: [{ rule: 'ghunnah' }, { rule: 'madd' }] });
  });

  it('ranks the rules and finds the hottest ayah', () => {
    const s = summariseHeatmap(cells);
    expect(s.rules[0]).toEqual({ rule: 'madd', mistakes: 7 });
    expect(s.maxPerAyah).toBe(6);
  });

  it('filters to one rule but still lists every rule to choose from', () => {
    const s = summariseHeatmap(cells, 'ghunnah');
    expect(s.total).toBe(3);
    expect(s.surahs.map((x) => x.surahNo)).toEqual([112]);
    expect(s.rules).toHaveLength(3);
  });

  it('ignores ayahs that do not exist', () => {
    expect(summariseHeatmap([cell(112, 9, 'madd', 2), cell(115, 1, 'madd', 1)]).total).toBe(0);
  });
});
