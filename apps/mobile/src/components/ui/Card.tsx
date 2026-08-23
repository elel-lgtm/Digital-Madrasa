import { CaretRight } from 'phosphor-react-native';
import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { AppText } from './Text';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  /** Draws a coloured left edge — used for overdue and alert cards. */
  accent?: 'accent' | 'success' | 'warning' | 'danger' | 'info';
}

export function Card({
  children,
  onPress,
  padded = true,
  style,
  accessibilityLabel,
  accent,
}: CardProps) {
  const theme = useTheme();

  const content: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: padded ? theme.spacing.lg : 0,
    ...(accent
      ? { borderLeftWidth: 3, borderLeftColor: theme.colors[accent] }
      : {}),
    ...theme.shadow.card,
  };

  if (!onPress) return <View style={[content, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      onPress={onPress}
      style={({ pressed }) => [
        content,
        pressed ? { backgroundColor: theme.colors.surfacePressed } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
  subtitle?: string;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHeader, { marginBottom: theme.spacing.md }]}>
      <View style={styles.grow}>
        <AppText variant="heading">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="textMuted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={8}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        >
          <AppText variant="bodyStrong" color="accent">
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

interface ListRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}

export function ListRow({
  title,
  subtitle,
  meta,
  left,
  right,
  onPress,
  showChevron = true,
}: ListRowProps) {
  const theme = useTheme();
  const inner = (
    <View
      style={[
        styles.row,
        { paddingVertical: theme.spacing.md, gap: theme.spacing.md, minHeight: MIN_TOUCH_TARGET },
      ]}
    >
      {left}
      <View style={styles.grow}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {meta ? (
        <AppText variant="caption" color="textSubtle">
          {meta}
        </AppText>
      ) : null}
      {right}
      {onPress && showChevron ? (
        <CaretRight size={16} color={theme.colors.textSubtle} weight="bold" />
      ) : null}
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      {inner}
    </Pressable>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} />;
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});
