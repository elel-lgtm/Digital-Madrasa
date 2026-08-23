import { I18nManager, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

type ColorKey =
  | 'text'
  | 'textMuted'
  | 'textSubtle'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'textOnAccent';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorKey;
  align?: TextStyle['textAlign'];
  /** Renders in Amiri and forces right-to-left flow, for Quranic text. */
  arabic?: boolean;
  /** Multiplies the Arabic size, driven by the reader's size slider. */
  scale?: number;
  uppercase?: boolean;
}

/**
 * The only text primitive in the app. Screens never reach for `<Text>` from
 * react-native directly, which is what keeps typography and colour consistent
 * and makes the light/dark and RTL passes possible.
 */
export function AppText({
  variant = 'body',
  color = 'text',
  align,
  arabic = false,
  scale = 1,
  uppercase = false,
  style,
  children,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const base = theme.typography[variant];

  const resolved: TextStyle = arabic
    ? {
        fontFamily: theme.fonts.arabic,
        fontSize: Math.round(base.fontSize * 1.6 * scale),
        lineHeight: Math.round(base.lineHeight * 2 * scale),
        writingDirection: 'rtl',
        textAlign: align ?? 'right',
      }
    : {
        fontFamily: base.fontFamily,
        fontSize: base.fontSize,
        lineHeight: base.lineHeight,
        ...(base.letterSpacing !== undefined ? { letterSpacing: base.letterSpacing } : {}),
        textAlign: align ?? (I18nManager.isRTL ? 'right' : 'left'),
      };

  return (
    <RNText
      {...rest}
      style={[
        resolved,
        { color: theme.colors[color] },
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
