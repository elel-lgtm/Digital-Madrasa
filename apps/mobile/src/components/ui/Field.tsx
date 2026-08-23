import { Check, Eye, EyeSlash } from 'phosphor-react-native';
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { AppText } from './Text';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Localised error message. Presence of this drives the error styling. */
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  secure?: boolean;
  right?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function TextField({
  label,
  error,
  hint,
  required = false,
  secure = false,
  right,
  containerStyle,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      <AppText variant="label" color="textMuted" uppercase>
        {label}
        {required ? ' *' : ''}
      </AppText>

      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            minHeight: MIN_TOUCH_TARGET + 6,
          },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={theme.colors.textSubtle}
          secureTextEntry={secure && !revealed}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
              fontSize: theme.typography.body.fontSize,
            },
          ]}
          {...rest}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={10}
          >
            {revealed ? (
              <EyeSlash size={20} color={theme.colors.textMuted} />
            ) : (
              <Eye size={20} color={theme.colors.textMuted} />
            )}
          </Pressable>
        ) : null}
        {right}
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

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface OptionGroupProps<T extends string> {
  label?: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | undefined;
  columns?: number;
}

/** A chip-style picker; used everywhere a native select would be clumsy. */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: OptionGroupProps<T>) {
  const theme = useTheme();
  const basis = columns === 1 ? '100%' : `${Math.floor(100 / columns) - 2}%`;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? (
        <AppText variant="label" color="textMuted" uppercase>
          {label}
        </AppText>
      ) : null}
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={{
                minWidth: basis as ViewStyle['minWidth'],
                flexGrow: 1,
                minHeight: MIN_TOUCH_TARGET,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surfaceAlt,
              }}
            >
              <AppText variant="bodyStrong" color={selected ? 'accent' : 'text'}>
                {option.label}
              </AppText>
              {option.hint ? (
                <AppText variant="caption" color="textSubtle">
                  {option.hint}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string | undefined;
}

export function Checkbox({ label, checked, onChange, error }: CheckboxProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        onPress={() => onChange(!checked)}
        style={[styles.checkboxRow, { gap: theme.spacing.md, minHeight: MIN_TOUCH_TARGET }]}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: theme.radius.sm,
            borderWidth: 1.5,
            borderColor: checked ? theme.colors.accent : theme.colors.borderStrong,
            backgroundColor: checked ? theme.colors.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? <Check size={16} weight="bold" color={theme.colors.textOnAccent} /> : null}
        </View>
        <AppText variant="caption" style={styles.grow}>
          {label}
        </AppText>
      </Pressable>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.toggleRow,
        { paddingVertical: theme.spacing.md, gap: theme.spacing.md, minHeight: MIN_TOUCH_TARGET },
      ]}
    >
      <View style={styles.grow}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="caption" color="textMuted">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accent }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, gap: 8 },
  input: { flex: 1, paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});
