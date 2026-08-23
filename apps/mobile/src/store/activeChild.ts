import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ActiveChildState {
  /** Null until the parent has at least one approved link. */
  studentId: string | null;
  setStudentId: (studentId: string | null) => void;
}

/**
 * Which child the parent is currently looking at. Persisted so a household
 * with several children doesn't have to re-pick on every launch.
 */
export const useActiveChild = create<ActiveChildState>()(
  persist(
    (set) => ({
      studentId: null,
      setStudentId: (studentId) => set({ studentId }),
    }),
    {
      name: 'dm.active-child.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
