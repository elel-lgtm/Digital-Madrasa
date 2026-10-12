import { describe, expect, it } from 'vitest';
import { MASTER_RECITERS, masterAyahUrl, passageAyahs, recitersFor } from './masterReciter';

describe('master reciter', () => {
  it('builds EveryAyah file names from surah and ayah', () => {
    const husary = MASTER_RECITERS[0]!;
    expect(masterAyahUrl(husary, 1, 7)).toBe('https://everyayah.com/data/Husary_Muallim_128kbps/001007.mp3');
    expect(masterAyahUrl(husary, 112, 2)).toMatch(/\/112002\.mp3$/);
  });

  it('offers only reciters of the pupil’s qiraah, teaching style first', () => {
    expect(recitersFor('hafs')[0]!.teaching).toBe(true);
    expect(recitersFor('hafs').every((r) => r.qiraah === 'hafs')).toBe(true);
    expect(recitersFor('warsh').map((r) => r.qiraah)).toEqual(['warsh']);
    expect(recitersFor('qaloon')).toEqual([]);
  });

  it('lists a passage’s ayahs in order, within bounds', () => {
    expect(passageAyahs(3, 6)).toEqual([3, 4, 5, 6]);
    expect(passageAyahs(0, 2)).toEqual([1, 2]);
    expect(passageAyahs(5, 2)).toEqual([5]);
    expect(passageAyahs(1, 286)).toHaveLength(40);
  });
});
