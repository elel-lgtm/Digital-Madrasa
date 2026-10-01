import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The bar itself, above whatever the system reserves at the bottom edge. Tall
 * enough for the 24pt icon plus a full label line: at 62 the navigator shrank
 * the label to 9pt of height and clipped every descender, which in Arabic
 * took the dots off most words.
 */
const BAR_HEIGHT = 66;

/** Shared tab bar styling so all three role shells look like one app. */
export function useTabScreenOptions() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  // Arabic labels render in the system's taller Arabic fallback font, so they
  // get a taller line.
  const arabic = i18n.language === 'ar';

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
        lineHeight: arabic ? 18 : 15,
        // Never squeezed below its own line height by the icon above it.
        flexShrink: 0,
      },
      sceneStyle: { backgroundColor: theme.colors.background },
    }),
    [theme, insets.bottom, arabic],
  );
}
