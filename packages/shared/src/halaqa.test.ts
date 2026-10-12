import { describe, expect, it } from 'vitest';
import { chooseReader, endTurn, handQueue, initialHalaqa, moveAyah, newer, type HalaqaParticipant } from './halaqa';

const person = (userId: string, role: HalaqaParticipant['role'], handRaisedAt: number | null): HalaqaParticipant => ({
  userId, name: userId, role, studentId: role === 'student' ? `s-${userId}` : null, handRaisedAt,
});

describe('live halaqa', () => {
  it('queues raised hands first come, first served, pupils only', () => {
    const q = handQueue([person('b', 'student', 20), person('t', 'teacher', 5), person('a', 'student', 10), person('c', 'student', null)]);
    expect(q.map((p) => p.userId)).toEqual(['a', 'b']);
  });

  it('a reader reads on from where the last one stopped', () => {
    let s = initialHalaqa(112);
    s = chooseReader(s, person('a', 'student', 1));
    s = moveAyah(s, 1, 4);
    s = moveAyah(s, 1, 4);
    expect(s).toMatchObject({ ayah: 3, startAyah: 1, readerStudentId: 's-a' });
    s = endTurn(s, 4);
    expect(s).toMatchObject({ ayah: 4, startAyah: 4, readerUserId: null });
    s = chooseReader(s, person('b', 'student', 2));
    expect(s.startAyah).toBe(4);
  });

  it('never runs past the surah', () => {
    expect(moveAyah(initialHalaqa(112, 4), 1, 4).ayah).toBe(4);
    expect(moveAyah(initialHalaqa(112, 1), -1, 4).ayah).toBe(1);
  });

  it('keeps the newer copy when updates cross', () => {
    const a = initialHalaqa(112);
    const b = moveAyah(a, 1, 4);
    expect(newer(b, a)).toBe(b);
    expect(newer(a, b)).toBe(b);
  });
});
