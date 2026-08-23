import { initials as toInitials } from '@digital-madrasa/shared';
import { ArrowClockwise, WifiSlash } from 'phosphor-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { AppText } from './Text';
import { Button } from './Button';

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  tone?: Tone;
  style?: ViewStyle;
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();
  const map: Record<Tone, { bg: string; fg: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'textMuted' }> = {
    accent: { bg: theme.colors.accentSoft, fg: 'accent' },
    success: { bg: theme.colors.successSoft, fg: 'success' },
    warning: { bg: theme.colors.warningSoft, fg: 'warning' },
    danger: { bg: theme.colors.dangerSoft, fg: 'danger' },
    info: { bg: theme.colors.infoSoft, fg: 'info' },
    neutral: { bg: theme.colors.surfaceAlt, fg: 'textMuted' },
  };
  const tones = map[tone];

  return (
    <View
      style={[
        {
          backgroundColor: tones.bg,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <AppText variant="label" color={tones.fg}>
        {label}
      </AppText>
    </View>
  );
}

interface AvatarProps {
  name: string;
  size?: number;
  tone?: Tone;
}

export function Avatar({ name, size = 40, tone = 'accent' }: AvatarProps) {
  const theme = useTheme();
  const bg = tone === 'accent' ? theme.colors.accentSoft : theme.colors.surfaceAlt;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
      }}
    >
      <AppText variant="bodyStrong" color={tone === 'accent' ? 'accent' : 'textMuted'}>
        {toInitials(name)}
      </AppText>
    </View>
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: Tone;
  label?: string;
  height?: number;
}

export function ProgressBar({ value, max = 100, tone = 'accent', label, height = 8 }: ProgressBarProps) {
  const theme = useTheme();
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const fill =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'danger'
          ? theme.colors.danger
          : theme.colors.accent;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      {...(label ? { accessibilityLabel: label } : {})}
      style={{ gap: 4 }}
    >
      <View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: fill }} />
      </View>
    </View>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  caption?: string;
  tone?: Tone;
  onPress?: () => void;
}

export function StatTile({ label, value, caption, tone = 'neutral', onPress }: StatTileProps) {
  const theme = useTheme();
  const valueColor =
    tone === 'success'
      ? 'success'
      : tone === 'danger'
        ? 'danger'
        : tone === 'warning'
          ? 'warning'
          : tone === 'accent'
            ? 'accent'
            : 'text';

  const body = (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        gap: 2,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <AppText variant="label" color="textMuted" uppercase>
        {label}
      </AppText>
      <AppText variant="title" color={valueColor as 'text'}>
        {value}
      </AppText>
      {caption ? (
        <AppText variant="caption" color="textSubtle">
          {caption}
        </AppText>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.8 } : null]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Shimmering placeholder. We use these rather than a bare spinner so the
 * layout doesn't jump once data lands.
 */
export function Skeleton({
  height = 16,
  width = '100%',
  radius,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  const theme = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const backgroundColor = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.skeleton, theme.colors.skeletonHighlight],
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      style={{
        height,
        width,
        borderRadius: radius ?? theme.radius.sm,
        backgroundColor,
      }}
    />
  );
}

export function SkeletonCard() {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Skeleton height={14} width="45%" />
      <Skeleton height={22} width="70%" />
      <Skeleton height={12} width="90%" />
    </View>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  body: string;
  icon?: React.ReactNode;
  action?: { label: string; onPress: () => void };
}

/** Empty states teach the next step rather than apologising. */
export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xxl,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      {icon ? <View style={{ marginBottom: theme.spacing.sm }}>{icon}</View> : null}
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText variant="body" color="textMuted" align="center">
        {body}
      </AppText>
      {action ? (
        <View style={{ marginTop: theme.spacing.md, alignSelf: 'stretch' }}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

interface ErrorStateProps {
  title: string;
  body: string;
  onRetry?: () => void;
  retryLabel: string;
  offline?: boolean;
}

export function ErrorState({ title, body, onRetry, retryLabel, offline = false }: ErrorStateProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xxl,
      }}
    >
      {offline ? (
        <WifiSlash size={36} color={theme.colors.textSubtle} />
      ) : (
        <ArrowClockwise size={36} color={theme.colors.textSubtle} />
      )}
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText variant="body" color="textMuted" align="center">
        {body}
      </AppText>
      {onRetry ? (
        <View style={{ marginTop: theme.spacing.md, alignSelf: 'stretch' }}>
          <Button label={retryLabel} variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET - 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.sm,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
            }}
          >
            <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
