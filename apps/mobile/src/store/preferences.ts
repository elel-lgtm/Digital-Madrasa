import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from '@digital-madrasa/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SchemePreference = 'system' | 'dark' | 'light';

interface PreferencesState {
  scheme: SchemePreference;
  locale: Locale | 'system';
  /** Multiplier applied to Uthmani script only, driven by a slider. */
  quranFontScale: number;
  reducedMotion: boolean;
  hasSeenOnboarding: boolean;
  /** False until AsyncStorage has been read, so we can hold the splash. */
  hydrated: boolean;

  setScheme: (scheme: SchemePreference) => void;
  setLocale: (locale: Locale | 'system') => void;
  setQuranFontScale: (scale: number) => void;
  setReducedMotion: (value: boolean) => void;
  completeOnboarding: () => void;
  markHydrated: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      scheme: 'dark',
      locale: 'system',
      quranFontScale: 1,
      reducedMotion: false,
      hasSeenOnboarding: false,
      hydrated: false,

      setScheme: (scheme) => set({ scheme }),
      setLocale: (locale) => set({ locale }),
      setQuranFontScale: (quranFontScale) => set({ quranFontScale }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      completeOnboarding: () => set({ hasSeenOnboarding: true }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'dm.preferences.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        scheme: state.scheme,
        locale: state.locale,
        quranFontScale: state.quranFontScale,
        reducedMotion: state.reducedMotion,
        hasSeenOnboarding: state.hasSeenOnboarding,
      }),
      // Runs whether or not there was anything stored, so the app never
      // waits forever on a first launch.
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);
