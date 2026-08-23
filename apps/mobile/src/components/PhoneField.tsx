import { KENYA_DIAL_CODE, KENYA_SUBSCRIBER_DIGITS, toLocalKenyanDigits } from '@digital-madrasa/shared';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

interface PhoneFieldProps {
  label: string;
  /** Full E.164 value, e.g. "+254712345678". Empty string when unset. */
  value: string;
  onChangeText: (e164: string) => void;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  placeholder?: string;
}

/**
 * Kenyan phone entry with a fixed +254 prefix.
 *
 * The country code is rendered as a non-editable affix rather than as part of
 * the input, so it cannot be deleted, doubled up, or replaced with 0 — the
 * three ways a free-text phone box goes wrong. The caller always receives a
 * normalised E.164 string; the user only ever types the nine subscriber
 * digits, and a pasted 0712…, 254712… or +254712… is reduced to those nine.
 */
export function PhoneField({
  label,
  value,
  onChangeText,
  error,
  hint,
  required = false,
  placeholder = '712 345 678',
}: PhoneFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const digits = toLocalKenyanDigits(value);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border;

  const handleChange = (next: string) => {
    const local = toLocalKenyanDigits(next);
    // An empty box means "no number", not "+254" — otherwise a cleared field
    // would still validate as a partial value.
    onChangeText(local ? `${KENYA_DIAL_CODE}${local}` : '');
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="label" color="textMuted" uppercase>
        {label}
        {required ? ' *' : ''}
      </AppText>

      <View
        style={[
          styles.wrap,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor,
            borderRadius: theme.radius.md,
            minHeight: MIN_TOUCH_TARGET + 6,
          },
        ]}
      >
        <View
          style={[
            styles.prefix,
            {
              borderRightColor: theme.colors.border,
              paddingHorizontal: theme.spacing.md,
            },
          ]}
        >
          <AppText variant="bodyStrong" color="textMuted">
            {KENYA_DIAL_CODE}
          </AppText>
        </View>

        <TextInput
          accessibilityLabel={label}
          // Screen readers announce the affix separately, so the value they
          // read back is the full international number, not nine bare digits.
          accessibilityValue={{ text: digits ? `${KENYA_DIAL_CODE} ${digits}` : '' }}
          value={digits}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSubtle}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={KENYA_SUBSCRIBER_DIGITS}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
              fontSize: theme.typography.body.fontSize,
              paddingHorizontal: theme.spacing.md,
            },
          ]}
        />
      </View>

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSubtle">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, overflow: 'hidden' },
  prefix: { justifyContent: 'center', borderRightWidth: 1 },
  input: { flex: 1, paddingVertical: 10 },
});
