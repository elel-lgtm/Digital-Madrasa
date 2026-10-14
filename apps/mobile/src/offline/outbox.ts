import type { MarkAttendanceInput } from '@digital-madrasa/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/types';

/**
 * Work saved on the phone while there is no connection, sent when it
 * returns. Madrasas in rural areas lose signal often; a register marked in
 * class must not be lost because of it.
 *
 * Only writes that are safe to repeat go here. Attendance is: the server
 * keeps one record per pupil per day (upsert on student_id + session_date),
 * so sending the same register twice corrects rather than duplicates.
 */

export type OutboxItem = {
  id: string;
  kind: 'attendance';
  input: MarkAttendanceInput;
  createdAt: string;
  attempts: number;
};

const KEY = 'dm.outbox.v1';
type Listener = (items: OutboxItem[]) => void;
const listeners = new Set<Listener>();
let cache: OutboxItem[] | null = null;
let flushing: Promise<{ sent: number; dropped: number }> | null = null;

async function load(): Promise<OutboxItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(items: OutboxItem[]): Promise<void> {
  cache = items;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable: the in-memory copy still syncs this session.
  }
  listeners.forEach((l) => l(items));
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  void load().then(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A request that never reached the server, as opposed to one it refused. */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError && err.code === 'network') return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /network request failed|failed to fetch|network error|load failed|timed? ?out|fetch failed/i.test(message);
}

/** Keeps a register for later. A newer save for the same class and day replaces the older one. */
export async function queueAttendance(input: MarkAttendanceInput): Promise<void> {
  const items = (await load()).filter(
    (i) => !(i.kind === 'attendance' && i.input.classId === input.classId && i.input.sessionDate === input.sessionDate),
  );
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'attendance',
    input,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await save(items);
}

/**
 * Sends everything waiting, oldest first. Stops at the first network failure
 * (the connection is gone again) and keeps the rest. Anything the server
 * refuses outright is dropped, since sending it again would only be refused
 * again; the count is returned so the screen can say so.
 */
export function flushOutbox(send: (item: OutboxItem) => Promise<unknown>): Promise<{ sent: number; dropped: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    let dropped = 0;
    let items = [...(await load())];
    while (items.length > 0) {
      const item = items[0]!;
      try {
        await send(item);
        sent += 1;
      } catch (err) {
        if (isNetworkError(err)) {
          items[0] = { ...item, attempts: item.attempts + 1 };
          break;
        }
        dropped += 1;
      }
      items = items.slice(1);
      await save(items);
    }
    await save(items);
    return { sent, dropped };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** For tests. */
export async function _resetOutbox(): Promise<void> {
  cache = [];
  await save([]);
}
