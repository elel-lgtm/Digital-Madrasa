import { formatMoney } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { AppText, Card, ErrorState, PageHeader, Screen, SkeletonList, StatTile } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * What ILMORA has done for learning, in totals only: for the platform admin
 * across every madrasa, for staff across their own (migration 0040).
 */
export function ImpactScreen({ showBack = true }: { showBack?: boolean }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const impact = useQuery({ queryKey: ['impact'], queryFn: () => api.getImpact() });
  const d = impact.data;

  const row = (items: [string, string, string?][]) => (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
      {items.map(([label, value, caption]) => (
        <StatTile key={label} label={label} value={value} caption={caption} />
      ))}
    </View>
  );
  const n = (v: number | null | undefined) => (v ?? 0).toLocaleString('en-US');
  const monthLabel = (ym: string) =>
    new Date(`${ym}-01T00:00:00`).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short' });

  return (
    <Screen refreshing={impact.isFetching} onRefresh={() => void impact.refetch()}>
      <PageHeader
        title={t('impact.title')}
        subtitle={d?.scope === 'platform' ? t('impact.subtitlePlatform') : t('impact.subtitleMadrasa')}
        showBack={showBack}
      />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        {impact.isPending ? (
          <SkeletonList count={4} />
        ) : impact.isError || !d ? (
          <ErrorState
            title={describeError(impact.error).title}
            body={describeError(impact.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void impact.refetch()}
          />
        ) : (
          <>
            {row([
              [t('impact.pupils'), n(d.pupils), d.scope === 'platform' ? t('impact.inMadrasas', { count: d.madrasas }) : undefined],
              [t('impact.teachers'), n(d.teachers)],
            ])}
            {row([
              [t('impact.surahs'), n(d.surahsMemorised), t('impact.byPupils', { count: d.pupilsMemorising })],
              [t('impact.attendance'), d.attendanceRate30d === null ? '—' : `${d.attendanceRate30d}%`, t('impact.last30')],
            ])}
            {row([
              [t('impact.recitations'), n(d.recitationsAssessed)],
              [t('impact.certificates'), n(d.certificates), t('impact.ijazahs', { count: d.ijazahs })],
            ])}
            {row([
              [t('impact.fees'), formatMoney(d.feesCollected), t('impact.viaMpesa', { amount: formatMoney(d.feesViaMpesa) })],
              [t('impact.sponsored'), n(d.pupilsSponsored), formatMoney(d.sponsoredAmount)],
            ])}
            {row([
              [t('impact.sessions'), n(d.liveSessions), t('impact.readings', { count: d.halaqaReadings })],
              [t('impact.messages'), n(d.messages)],
            ])}

            <Card>
              <View style={{ gap: theme.spacing.md }}>
                <AppText variant="subheading">{t('impact.trend')}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t('impact.trendHint')}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm, height: 120 }}>
                  {d.monthly.map((m) => {
                    const max = Math.max(1, ...d.monthly.map((x) => x.surahsMemorised));
                    return (
                      <View key={m.month} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                        <AppText variant="caption">{m.surahsMemorised}</AppText>
                        <View
                          style={{
                            width: '70%',
                            height: Math.max(4, (m.surahsMemorised / max) * 80),
                            backgroundColor: theme.colors.accent,
                            borderRadius: 4,
                          }}
                        />
                        <AppText variant="caption" color="textMuted">
                          {monthLabel(m.month)}
                        </AppText>
                      </View>
                    );
                  })}
                </View>
                <View style={{ gap: 2 }}>
                  {d.monthly.map((m) => (
                    <AppText key={m.month} variant="caption" color="textMuted">
                      {monthLabel(m.month)}: {t('impact.monthLine', {
                        attendance: m.attendanceRate === null ? '—' : `${m.attendanceRate}%`,
                        fees: formatMoney(m.feesCollected),
                      })}
                    </AppText>
                  ))}
                </View>
              </View>
            </Card>
            <AppText variant="caption" color="textSubtle">
              {t('impact.privacy')}
            </AppText>
          </>
        )}
      </View>
    </Screen>
  );
}
