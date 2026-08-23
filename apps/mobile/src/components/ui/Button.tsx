import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { AppText } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = true,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled === true || loading;

  const palette: Record<Variant, { bg: string; border: string; fg: 'text' | 'textOnAccent' | 'danger' | 'accent' }> = {
    primary: { bg: theme.colors.accent, border: theme.colors.accent, fg: 'textOnAccent' },
    secondary: { bg: theme.colors.surfaceAlt, border: theme.colors.border, fg: 'text' },
    ghost: { bg: 'transparent', border: 'transparent', fg: 'accent' },
    danger: { bg: theme.colors.dangerSoft, border: theme.colors.danger, fg: 'danger' },
  };
  const tone = palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          borderRadius: theme.radius.md,
          minHeight: size === 'lg' ? 54 : MIN_TOUCH_TARGET + 4,
          paddingHorizontal: theme.spacing.lg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? theme.colors.textOnAccent : theme.colors.accent}
          />
        ) : (
          <>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <AppText variant={size === 'lg' ? 'subheading' : 'bodyStrong'} color={tone.fg}>
              {label}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { marginTop: 1 },
});
