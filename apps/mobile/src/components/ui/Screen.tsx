import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  /** Wraps content in a ScrollView. Turn off for screens with their own list. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Removes the default horizontal padding, for edge-to-edge lists. */
  flush?: boolean;
  contentStyle?: ViewStyle;
  footer?: React.ReactNode;
  scrollProps?: Omit<ScrollViewProps, 'children' | 'refreshControl'>;
}

/**
 * The page frame: safe-area aware, themed background, and a consistent
 * pull-to-refresh affordance so every list refreshes the same way.
 */
export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  flush = false,
  contentStyle,
  footer,
  scrollProps,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingHorizontal: flush ? 0 : theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl + insets.bottom,
  };

  const body = scroll ? (
    <ScrollView
      {...scrollProps}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[padding, contentStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padding, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              backgroundColor: theme.colors.backgroundElevated,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
