import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/** The bar itself, above whatever the system reserves at the bottom edge. */
const BAR_HEIGHT = 62;

/** Shared tab bar styling so all three role shells look like one app. */
export function useTabScreenOptions() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return React.useMemo(
    () => ({
      headerShown: false as const,
      tabBarActiveTintColor: theme.colors.accent,
      tabBarInactiveTintColor: theme.colors.textSubtle,
      tabBarStyle: {
        backgroundColor: theme.colors.backgroundElevated,
        borderTopColor: theme.colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        // A fixed height here overrides the inset the navigator would otherwise
        // add, which put the labels under the gesture pill on devices that use
        // gesture navigation. Growing the bar by the inset keeps the labels in
        // the same place relative to the bar and clear of the system control.
        height: BAR_HEIGHT + insets.bottom,
        paddingTop: 6,
        paddingBottom: 8 + insets.bottom,
      },
      tabBarLabelStyle: {
        fontFamily: theme.fonts.bodyMedium,
        fontSize: 11,
      },
      sceneStyle: { backgroundColor: theme.colors.background },
    }),
    [theme, insets.bottom],
  );
}
