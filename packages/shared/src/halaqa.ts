/**
 * The live halaqa's shared state and the rules for moving it on. The
 * teacher's phone holds the state and broadcasts it; every phone renders the
 * same thing from it.
 */

export type HalaqaMark = 'excellent' | 'good' | 'needs_work';
export const HALAQA_MARKS: readonly HalaqaMark[] = ['excellent', 'good', 'needs_work'];

export interface HalaqaState {
  surahNo: number;
  /** The ayah being read now. */
  ayah: number;
  /** Where the current reader started, for the mark's range. */
  startAyah: number;
  readerUserId: string | null;
  readerStudentId: string | null;
  readerName: string | null;
  /** Bumped on every change, so a late copy never overwrites a newer one. */
  version: number;
}

export interface HalaqaParticipant {
  userId: string;
  name: string;
  role: 'teacher' | 'student' | 'parent' | 'admin';
  studentId: string | null;
  /** When the hand went up, or null. */
  handRaisedAt: number | null;
}

export function initialHalaqa(surahNo: number, ayah = 1): HalaqaState {
  return { surahNo, ayah, startAyah: ayah, readerUserId: null, readerStudentId: null, readerName: null, version: 1 };
}

/** Raised hands, first raised first. */
export function handQueue(people: readonly HalaqaParticipant[]): HalaqaParticipant[] {
  return people
    .filter((p) => p.role === 'student' && p.handRaisedAt !== null)
    .sort((a, b) => (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0));
}

export function chooseReader(state: HalaqaState, reader: HalaqaParticipant): HalaqaState {
  return {
    ...state,
    readerUserId: reader.userId,
    readerStudentId: reader.studentId,
    readerName: reader.name,
    startAyah: state.ayah,
    version: state.version + 1,
  };
}

export function moveAyah(state: HalaqaState, by: number, ayahCount: number): HalaqaState {
  const ayah = Math.min(ayahCount, Math.max(1, state.ayah + by));
  return ayah === state.ayah ? state : { ...state, ayah, version: state.version + 1 };
}

export function changeSurah(state: HalaqaState, surahNo: number): HalaqaState {
  return { ...initialHalaqa(surahNo), version: state.version + 1 };
}

/** After a mark: the reader steps down, the next reader starts after the last ayah read. */
export function endTurn(state: HalaqaState, ayahCount: number): HalaqaState {
  const next = Math.min(ayahCount, state.ayah + 1);
  return { ...state, readerUserId: null, readerStudentId: null, readerName: null, ayah: next, startAyah: next, version: state.version + 1 };
}

/** Keep whichever copy is newer. */
export function newer(a: HalaqaState | null, b: HalaqaState): HalaqaState {
  return !a || b.version >= a.version ? b : a;
}
