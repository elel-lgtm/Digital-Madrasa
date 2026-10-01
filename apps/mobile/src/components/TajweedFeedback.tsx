import type { TajweedFinding } from '@digital-madrasa/shared';
import { Info } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppText, Badge, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/** Circular score dial. Colour and number both carry the meaning. */
/** A null score (not assessed) draws an empty ring with a dash, never a number. */
export function ScoreRing({ score, size = 132 }: { score: number | null; size?: number }) {
  const theme = useTheme();
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = score === null ? 0 : Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;

  const colour =
    clamped >= 85 ? theme.colors.success : clamped >= 65 ? theme.colors.accent : theme.colors.danger;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={score === null ? { text: '—' } : { min: 0, max: 100, now: Math.round(clamped) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.surfaceAlt}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          fill="none"
          // Start the arc at 12 o'clock instead of 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <AppText variant="display">{score === null ? '—' : Math.round(clamped)}</AppText>
    </View>
  );
}

const SEVERITY_TONE = {
  minor: 'info',
  moderate: 'warning',
  major: 'danger',
} as const;

interface FindingListProps {
  findings: TajweedFinding[];
  /** Teachers can strike findings off; students only read them. */
  dismissed?: number[];
  onToggleDismiss?: (index: number) => void;
}

export function FindingList({ findings, dismissed = [], onToggleDismiss }: FindingListProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (findings.length === 0) {
    return (
      <Card accent="success">
        <AppText variant="body">{t('student.noFindings')}</AppText>
      </Card>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {findings.map((finding, index) => {
        const isDismissed = dismissed.includes(index);
        return (
          <Card
            key={`${finding.ayahNo}-${finding.wordIndex}-${finding.rule}`}
            accent={SEVERITY_TONE[finding.severity] === 'danger' ? 'danger' : 'warning'}
            onPress={onToggleDismiss ? () => onToggleDismiss(index) : undefined}
          >
            <View style={{ gap: theme.spacing.sm, opacity: isDismissed ? 0.45 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Badge
                  label={finding.rule.toUpperCase()}
                  tone={SEVERITY_TONE[finding.severity]}
                />
                <AppText variant="caption" color="textSubtle">
                  Ayah {finding.ayahNo} · word {finding.wordIndex + 1}
                </AppText>
                {isDismissed ? <Badge label={t('common.remove')} /> : null}
              </View>
              <AppText variant="body" color="textMuted">
                {finding.note}
              </AppText>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

/**
 * The standing reminder that the model assists practice and does not rule on
 * it. It is deliberately quiet, permanent, and never dismissible.
 */
export function AiDisclaimer() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.sm,
        alignItems: 'flex-start',
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <Info size={16} color={theme.colors.textSubtle} />
      <AppText variant="caption" color="textSubtle" style={{ flex: 1 }}>
        {t('student.aiDisclaimer')}
      </AppText>
    </View>
  );
}
