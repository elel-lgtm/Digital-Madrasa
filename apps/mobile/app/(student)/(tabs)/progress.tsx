import { TOTAL_JUZ, percent, type HifzStatus } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { Flame } from 'phosphor-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { CertificateCard } from '@/components/CertificateCard';
import {
  AppText,
  Card,
  ErrorState,
  PageHeader,
  ProgressBar,
  Screen,
  SectionHeader,
  SkeletonList,
  StatTile,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

export default function StudentProgress() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const describeError = useApiError();
  const studentId = session.student?.id ?? '';

  const dashboard = useQuery({
    queryKey: qk.studentDashboard(),
    queryFn: () => api.getStudentDashboard(),
  });
  const hifz = useQuery({
    queryKey: qk.hifz(studentId),
    queryFn: () => api.listHifzProgress(studentId),
    enabled: Boolean(studentId),
  });
  const certificates = useQuery({
    queryKey: qk.certificates(studentId),
    queryFn: () => api.listCertificates(studentId),
    enabled: Boolean(studentId),
  });

  /** Best status reached in each juz, for the 30-cell grid. */
  const juzStatus = useMemo(() => {
    const map = new Map<number, HifzStatus>();
    const rank: Record<HifzStatus, number> = {
      not_started: 0,
      learning: 1,
      revising: 2,
      memorised: 3,
      mastered: 4,
    };
    (hifz.data ?? []).forEach((row) => {
      const current = map.get(row.juzNo);
      if (!current || rank[row.status] > rank[current]) map.set(row.juzNo, row.status);
    });
    return map;
  }, [hifz.data]);

  const statusColour = (status: HifzStatus | undefined): string => {
    switch (status) {
      case 'mastered':
        return theme.colors.success;
      case 'memorised':
        return theme.colors.accent;
      case 'revising':
        return theme.colors.warning;
      case 'learning':
        return theme.colors.info;
      default:
        return theme.colors.surfaceAlt;
    }
  };

  if (dashboard.isError || hifz.isError) {
    return (
      <Screen>
        <PageHeader title={t('student.myProgress')} />
        <ErrorState
          {...describeError(dashboard.error ?? hifz.error)}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void dashboard.refetch();
            void hifz.refetch();
          }}
        />
      </Screen>
    );
  }

  const summary = dashboard.data?.hifzSummary;

  return (
    <Screen
      refreshing={hifz.isFetching}
      onRefresh={() => {
        void hifz.refetch();
        void dashboard.refetch();
      }}
    >
      <PageHeader title={t('student.myProgress')} />

      {dashboard.isPending || hifz.isPending ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <StatTile
              label={t('student.memorised')}
              value={`${summary?.juzCompleted ?? 0}/30`}
              caption={t('student.ayahsMemorised', { count: summary?.memorisedAyahs ?? 0 })}
              tone="accent"
            />
            <StatTile
              label={t('student.streak', { count: dashboard.data?.streakDays ?? 0 })}
              value={String(dashboard.data?.streakDays ?? 0)}
              tone="warning"
            />
          </View>

          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="bodyStrong">{t('student.juzComplete', {
                  count: summary?.juzCompleted ?? 0,
                })}</AppText>
                <AppText variant="caption" color="textMuted">
                  {percent(summary?.memorisedAyahs ?? 0, summary?.totalAyahs ?? 1)}%
                </AppText>
              </View>

              {/* 30-cell juz grid — the mental model students actually use. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {Array.from({ length: TOTAL_JUZ }, (_, index) => {
                  const juz = index + 1;
                  const status = juzStatus.get(juz);
                  return (
                    <View
                      key={juz}
                      accessible
                      accessibilityLabel={`Juz ${juz}: ${status ?? 'not started'}`}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: theme.radius.sm,
                        backgroundColor: statusColour(status),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AppText
                        variant="caption"
                        color={status ? 'textOnAccent' : 'textSubtle'}
                      >
                        {juz}
                      </AppText>
                    </View>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
                {(
                  [
                    ['mastered', t('student.mastered')],
                    ['memorised', t('student.memorised')],
                    ['revising', t('student.revising')],
                    ['learning', t('student.learning')],
                  ] as const
                ).map(([status, label]) => (
                  <View
                    key={status}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        backgroundColor: statusColour(status),
                      }}
                    />
                    <AppText variant="caption" color="textMuted">
                      {label}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Flame size={18} color={theme.colors.warning} weight="duotone" />
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {t('student.attendanceRate')}
                </AppText>
                <AppText variant="bodyStrong">{dashboard.data?.attendanceRate ?? 0}%</AppText>
              </View>
              <ProgressBar
                value={dashboard.data?.attendanceRate ?? 0}
                tone={(dashboard.data?.attendanceRate ?? 0) >= 85 ? 'success' : 'warning'}
                label={t('student.attendanceRate')}
              />
            </View>
          </Card>

          {(certificates.data ?? []).length > 0 ? (
            <View style={{ gap: theme.spacing.md }}>
              <SectionHeader title={t('learning.certificates')} />
              {(certificates.data ?? []).map((certificate) => (
                <CertificateCard key={certificate.id} certificate={certificate} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
