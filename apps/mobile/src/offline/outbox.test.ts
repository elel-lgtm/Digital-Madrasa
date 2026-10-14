import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const m = new Map<string, string>();
  return { default: { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) } };
});

const { flushOutbox, queueAttendance, subscribeOutbox, isNetworkError, _resetOutbox } = await import('./outbox');
const { ApiError } = await import('../api/types');

const register = (day: string, status: 'present' | 'absent' = 'present') => ({
  classId: '00000000-0000-4000-8000-000000000001',
  sessionDate: day,
  method: 'manual' as const,
  entries: [{ studentId: '00000000-0000-4000-8000-000000000002', status }],
});

describe('offline outbox', () => {
  beforeEach(async () => {
    await _resetOutbox();
  });

  it('keeps one register per class and day, the latest', async () => {
    await queueAttendance(register('2026-10-15', 'absent'));
    await queueAttendance(register('2026-10-15', 'present'));
    await queueAttendance(register('2026-10-16'));
    let items: { input: { entries: { status: string }[] } }[] = [];
    subscribeOutbox((i) => (items = i));
    await new Promise((r) => setTimeout(r, 0));
    expect(items).toHaveLength(2);
    expect(items[0]!.input.entries[0]!.status).toBe('present');
  });

  it('sends everything when the connection is back', async () => {
    await queueAttendance(register('2026-10-15'));
    await queueAttendance(register('2026-10-16'));
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await flushOutbox(send)).toEqual({ sent: 2, dropped: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(await flushOutbox(send)).toEqual({ sent: 0, dropped: 0 });
  });

  it('stops and keeps the rest when the connection drops again', async () => {
    await queueAttendance(register('2026-10-15'));
    await queueAttendance(register('2026-10-16'));
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await flushOutbox(send)).toEqual({ sent: 1, dropped: 0 });
    const again = vi.fn().mockResolvedValue(undefined);
    expect(await flushOutbox(again)).toEqual({ sent: 1, dropped: 0 });
  });

  it('drops what the server refuses rather than retrying for ever', async () => {
    await queueAttendance(register('2026-10-15'));
    const send = vi.fn().mockRejectedValue(new ApiError('forbidden', 'No'));
    expect(await flushOutbox(send)).toEqual({ sent: 0, dropped: 1 });
  });

  it('tells a lost connection from a refusal', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError(new ApiError('network', 'x'))).toBe(true);
    expect(isNetworkError(new ApiError('forbidden', 'x'))).toBe(false);
  });
});
