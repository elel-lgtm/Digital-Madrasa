/**
 * Digital Madrasa design tokens.
 *
 * The palette is built from coffee tones: espresso grounds for backgrounds,
 * warm cream for text and surfaces, muted gold for accent, sage for success
 * and terracotta for anything overdue or destructive. Dark is the default
 * scheme; light is a first-class alternative, not an afterthought.
 *
 * Screens must never hardcode a hex value — always read from the theme so the
 * light/dark swap and the contrast audit stay honest.
 */

export interface Palette {
  /** App background, the darkest/lightest ground. */
  background: string;
  /** Slightly raised ground: headers, tab bars. */
  backgroundElevated: string;
  /** Cards and sheets. */
  surface: string;
  /** Nested surfaces inside a card: inputs, chips, list rows. */
  surfaceAlt: string;
  /** A pressed / hovered state for interactive surfaces. */
  surfacePressed: string;

  border: string;
  borderStrong: string;

  text: string;
  textMuted: string;
  textSubtle: string;
  /** Text that sits on top of `accent`. */
  textOnAccent: string;

  accent: string;
  accentSoft: string;
  accentMuted: string;

  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
}

const dark: Palette = {
  background: '#12100E',
  backgroundElevated: '#1A1613',
  surface: '#221D18',
  surfaceAlt: '#2C251E',
  surfacePressed: '#372E26',

  border: '#3A3029',
  borderStrong: '#4E4137',

  text: '#F5EDE3',
  textMuted: '#BCAA98',
  textSubtle: '#8C7A69',
  textOnAccent: '#1A1408',

  accent: '#C9A227',
  accentSoft: '#3A2F13',
  accentMuted: '#E3C76F',

  success: '#84B080',
  successSoft: '#22301F',
  warning: '#D9A05B',
  warningSoft: '#33260F',
  danger: '#D07354',
  dangerSoft: '#361B12',
  info: '#7FA0C4',
  infoSoft: '#182430',

  overlay: 'rgba(8, 6, 5, 0.72)',
  skeleton: '#2A231D',
  skeletonHighlight: '#372E26',
};

const light: Palette = {
  background: '#FAF5EE',
  backgroundElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F2E9DD',
  surfacePressed: '#E8DCCC',

  border: '#E3D6C5',
  borderStrong: '#CDBBA4',

  text: '#241A13',
  textMuted: '#6A5747',
  textSubtle: '#8E7C6C',
  textOnAccent: '#1A1408',

  accent: '#A67C12',
  accentSoft: '#F6EAC9',
  accentMuted: '#8A6710',

  success: '#487A45',
  successSoft: '#E1EFDF',
  warning: '#9A6512',
  warningSoft: '#F8ECD6',
  danger: '#A8492A',
  dangerSoft: '#F7E2DA',
  info: '#3D6489',
  infoSoft: '#E1EAF3',

  overlay: 'rgba(36, 26, 19, 0.45)',
  skeleton: '#EDE2D4',
  skeletonHighlight: '#F7F0E6',
};

export const palettes = { dark, light } as const;
export type ColorScheme = keyof typeof palettes;

/** 4pt base scale. Use these names, not raw numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Font families. Fraunces carries display and headings, Work Sans carries all
 * UI text, and Amiri is reserved for Quranic and Arabic text.
 */
export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'WorkSans_400Regular',
  bodyMedium: 'WorkSans_500Medium',
  bodySemibold: 'WorkSans_600SemiBold',
  arabic: 'Amiri_400Regular',
  arabicBold: 'Amiri_700Bold',
} as const;

export type TypographyVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'mono';

export const typography: Record<
  TypographyVariant,
  { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number }
> = {
  display: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 38, letterSpacing: -0.4 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 31, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.display, fontSize: 19, lineHeight: 26 },
  subheading: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 23 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 23 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  mono: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20, letterSpacing: 1.2 },
};

/**
 * ILMORA brand colours, for the logo and launch surfaces only. They are the
 * same in light and dark schemes: a logo does not change with the theme. The
 * app's own surfaces keep reading from the palettes below.
 */
export const brand = {
  teal: '#0E3B3A',
  tealDeep: '#0A2B2A',
  tealStar: '#14514D',
  gold: '#D4AF37',
  goldLight: '#E8CB6E',
  goldDeep: '#A8811C',
  ivory: '#F7F0E1',
} as const;

/** WCAG AA needs 44pt; we use it as the floor for every tappable element. */
export const MIN_TOUCH_TARGET = 44;

export const durations = {
  fast: 150,
  base: 220,
  slow: 320,
} as const;

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  fonts: typeof fonts;
  typography: typeof typography;
  durations: typeof durations;
  /** Elevation presets, since RN shadows differ per platform. */
  shadow: {
    card: object;
    raised: object;
  };
}

export function buildTheme(scheme: ColorScheme): Theme {
  const colors = palettes[scheme];
  const shadowColor = scheme === 'dark' ? '#000000' : '#40301F';
  return {
    scheme,
    colors,
    spacing,
    radius,
    fonts,
    typography,
    durations,
    shadow: {
      card: {
        shadowColor,
        shadowOpacity: scheme === 'dark' ? 0.35 : 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      },
      raised: {
        shadowColor,
        shadowOpacity: scheme === 'dark' ? 0.45 : 0.14,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      },
    },
  };
}
