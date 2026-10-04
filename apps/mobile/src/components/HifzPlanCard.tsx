import { dailyHifzPlan, getSurah, type Portion } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AppText, Badge, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Today's plan in the madrasa's own three parts: sabaq (the new lesson),
 * sabqi (recent revision) and manzil (old revision on a weekly cycle).
 * Worked out from the memorisation record by `dailyHifzPlan`, so the pupil,
 * the parent and the teacher see the same plan.
 */
export function HifzPlanCard({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();

  const hifz = useQuery({
    queryKey: qk.hifz(studentId),
    queryFn: () => api.listHifzProgress(studentId),
    enabled: Boolean(studentId),
  });
  const plan = useMemo(() => dailyHifzPlan(hifz.data ?? [], new Date()), [hifz.data]);

  if (!hifz.data) return null;

  const portion = (p: Portion) => {
    const whole = p.fromAyah === 1 && p.toAyah === (getSurah(p.surahNo)?.ayahCount ?? 0);
    return whole ? `${p.surahName} · ${t('plan.whole')}` : `${p.surahName} ${p.fromAyah}–${p.toAyah}`;
  };

  const section = (label: string, hint: string, items: Portion[], tone: 'accent' | 'success' | 'warning') => (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Badge label={label} tone={tone} />
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
          {hint}
        </AppText>
      </View>
      {items.length === 0 ? (
        <AppText variant="body" color="textSubtle">
          {t('plan.nothing')}
        </AppText>
      ) : (
        items.slice(0, 6).map((p) => (
          <AppText key={`${label}-${p.surahNo}-${p.fromAyah}`} variant="body">
            • {portion(p)}
          </AppText>
        ))
      )}
      {items.length > 6 ? (
        <AppText variant="caption" color="textMuted">
          {t('plan.more', { count: items.length - 6 })}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <AppText variant="subheading">{t('plan.title')}</AppText>
        {section(t('plan.sabaq'), t('plan.sabaqHint'), plan.sabaq ? [plan.sabaq] : [], 'accent')}
        {section(t('plan.sabqi'), t('plan.sabqiHint'), plan.sabqi, 'warning')}
        {section(t('plan.manzil'), t('plan.manzilHint', { days: plan.manzilCycleDays }), plan.manzil, 'success')}
      </View>
    </Card>
  );
}
