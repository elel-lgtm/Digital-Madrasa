import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferences } from '@/store/preferences';
import { buildTheme, type ColorScheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(buildTheme('dark'));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = usePreferences((s) => s.scheme);
  const systemScheme = useColorScheme();

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const theme = useMemo(() => buildTheme(scheme), [scheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Builds a stylesheet from the current theme and memoises it per theme object.
 * Use this instead of `StyleSheet.create` so no screen ends up with a
 * hardcoded colour that survives the light/dark swap.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
