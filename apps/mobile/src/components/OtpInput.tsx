import { OTP_LENGTH } from '@digital-madrasa/shared';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

interface OtpInputProps {
  value: string;
  onChangeText: (code: string) => void;
  /** Fired when the last digit lands, so the user needn't hunt for a button. */
  onComplete?: (code: string) => void;
  error?: string | undefined;
  label: string;
  autoFocus?: boolean;
}

/**
 * Six-digit one-time code entry.
 *
 * Rendered as boxes but backed by a single hidden input rather than one input
 * per digit: that keeps SMS/email autofill working, makes paste behave, and
 * avoids the focus-juggling bugs that per-box implementations attract.
 */
export function OtpInput({
  value,
  onChangeText,
  onComplete,
  error,
  label,
  autoFocus = true,
}: OtpInputProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChangeText(digits);
    if (digits.length === OTP_LENGTH) onComplete?.(digits);
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="label" color="textMuted" uppercase>
        {label}
      </AppText>

      <Pressable
        accessibilityRole="none"
        // The boxes are decoration; the real control is the input behind them,
        // which screen readers focus directly.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={() => inputRef.current?.focus()}
        style={{ flexDirection: 'row', gap: theme.spacing.sm }}
      >
        {Array.from({ length: OTP_LENGTH }, (_, index) => {
          const char = value[index] ?? '';
          const isCursor = focused && index === Math.min(value.length, OTP_LENGTH - 1);
          return (
            <View
              key={index}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET + 8,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                borderWidth: isCursor || char ? 2 : 1,
                borderColor: error
                  ? theme.colors.danger
                  : isCursor
                    ? theme.colors.accent
                    : char
                      ? theme.colors.border
                      : theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
              }}
            >
              <AppText variant="heading">{char}</AppText>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        style={{
          position: 'absolute',
          opacity: 0,
          // Kept on-screen rather than off it: an input positioned outside the
          // viewport is skipped by some Android keyboards.
          top: 0,
          left: 0,
          right: 0,
          height: MIN_TOUCH_TARGET,
        }}
      />

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
