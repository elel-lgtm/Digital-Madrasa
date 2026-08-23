import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Card,
  Divider,
  ErrorState,
  ListRow,
  PageHeader,
  ProgressBar,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate } from '@/utils/dates';

export default function StudentAttendance() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const describeError = useApiError();
  const studentId = session.student?.id ?? '';

  const overview = useQuery({
    queryKey: qk.childOverview(studentId),
    queryFn: () => api.getChildOverview(studentId),
    enabled: Boolean(studentId),
  });

  return (
    <Screen refreshing={overview.isFetching} onRefresh={() => void overview.refetch()}>
      <PageHeader title={t('student.attendanceRate')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        {overview.isPending ? (
          <SkeletonList count={4} />
        ) : overview.isError ? (
          <ErrorState
            {...describeError(overview.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void overview.refetch()}
          />
        ) : (
          <>
            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="bodyStrong">{t('student.attendanceRate')}</AppText>
                  <AppText variant="bodyStrong">{overview.data.attendanceRate}%</AppText>
                </View>
                <ProgressBar
                  value={overview.data.attendanceRate}
                  tone={overview.data.attendanceRate >= 85 ? 'success' : 'warning'}
                  label={t('student.attendanceRate')}
                />
              </View>
            </Card>

            <Card padded={false}>
              {overview.data.recentAttendance.map((record, index) => (
                <View key={record.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={longDate(record.sessionDate)}
                    subtitle={record.method === 'qr' ? 'QR' : undefined}
                    showChevron={false}
                    right={
                      <Badge
                        label={t(`teacher.${record.status}`)}
                        tone={
                          record.status === 'present'
                            ? 'success'
                            : record.status === 'absent'
                              ? 'danger'
                              : 'warning'
                        }
                      />
                    }
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
