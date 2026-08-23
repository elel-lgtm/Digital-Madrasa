import React from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/** Shared tab bar styling so all three role shells look like one app. */
export function useTabScreenOptions() {
  const theme = useTheme();

  return React.useMemo(
    () => ({
      headerShown: false as const,
      tabBarActiveTintColor: theme.colors.accent,
      tabBarInactiveTintColor: theme.colors.textSubtle,
      tabBarStyle: {
        backgroundColor: theme.colors.backgroundElevated,
        borderTopColor: theme.colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        height: 62,
        paddingTop: 6,
        paddingBottom: 8,
      },
      tabBarLabelStyle: {
        fontFamily: theme.fonts.bodyMedium,
        fontSize: 11,
      },
      sceneStyle: { backgroundColor: theme.colors.background },
    }),
    [theme],
  );
}
