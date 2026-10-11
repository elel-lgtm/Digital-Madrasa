import { BRAND } from '@digital-madrasa/shared';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { brand } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/*
 * The ILMORA mark: an eight-pointed Islamic star holding an open book, with
 * a point of light rising from its spine (the Qur'an, knowledge, guidance).
 * The same geometry as the vector sources in assets/brand, so the in-app mark
 * and the launcher icon are one drawing.
 */
const STAR =
  'M256 18.4 L325.6 88 L424 88 L424 186.4 L493.6 256 L424 325.6 L424 424 L325.6 424 L256 493.6 L186.4 424 L88 424 L88 325.6 L18.4 256 L88 186.4 L88 88 L186.4 88 Z';
const LEFT_PAGE = 'M248 238 C214 214 170 208 140 216 L140 338 C170 330 214 336 248 360 Z';
const RIGHT_PAGE = 'M264 238 C298 214 342 208 372 216 L372 338 C342 330 298 336 264 360 Z';
const LIGHT = 'M256 118 Q263 168 304 176 Q263 184 256 222 Q249 184 208 176 Q249 168 256 118 Z';

interface MarkProps {
  size?: number;
  /** Describe the mark to screen readers; leave unset when text beside it already says ILMORA. */
  accessibilityLabel?: string;
}

export function BrandMark({ size = 48, accessibilityLabel }: MarkProps) {
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 512 512">
        <Defs>
          <LinearGradient id="ilmoraGold" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={brand.goldLight} />
            <Stop offset="1" stopColor={brand.goldDeep} />
          </LinearGradient>
        </Defs>
        <Path d={STAR} fill={brand.tealStar} stroke="url(#ilmoraGold)" strokeWidth={20} strokeLinejoin="round" />
        <Path d={LEFT_PAGE} fill="url(#ilmoraGold)" />
        <Path d={RIGHT_PAGE} fill="url(#ilmoraGold)" />
        <Path d={LIGHT} fill={brand.ivory} />
      </Svg>
    </View>
  );
}

interface LogoProps {
  /** 'stacked' for welcome and about screens, 'inline' for headers. */
  layout?: 'stacked' | 'inline';
  /** Mark size; the wordmark scales with it. */
  size?: number;
  showDescriptor?: boolean;
}

/**
 * Mark, wordmark and descriptor. The wordmark is real text, so it is read
 * by screen readers and never blurs; the mark beside it stays silent.
 */
export function BrandLogo({ layout = 'stacked', size = 72, showDescriptor = true }: LogoProps) {
  const theme = useTheme();
  const stacked = layout === 'stacked';
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={showDescriptor ? `${BRAND.name}. ${BRAND.descriptor}` : BRAND.name}
      style={{
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'flex-start' : 'center',
        gap: stacked ? theme.spacing.md : theme.spacing.sm,
      }}
    >
      <BrandMark size={size} />
      <View style={{ gap: 2 }}>
        <AppText
          style={{
            fontFamily: theme.fonts.display,
            fontSize: Math.round(size * (stacked ? 0.5 : 0.62)),
            lineHeight: Math.round(size * (stacked ? 0.62 : 0.74)),
            letterSpacing: Math.max(2, Math.round(size * 0.06)),
            color: theme.colors.text,
          }}
        >
          {BRAND.name}
        </AppText>
        {showDescriptor ? (
          <AppText variant="caption" color="accent" style={{ letterSpacing: 0.4 }}>
            {BRAND.descriptor}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
