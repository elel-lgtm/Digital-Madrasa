import { formatMoney, percent } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarCheck, Student as StudentIcon, UserPlus } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { ChildSwitcher } from '@/components/ChildSwitcher';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  PageHeader,
  ProgressBar,
  Screen,
  SectionHeader,
  SkeletonList,
  StatTile,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useChildren } from '@/hooks/useChildren';
import { useRequiredSession } from '@/hooks/useSession';
import { useHijriToday } from '@/hooks/useHijriToday';
import { useTheme } from '@/theme/ThemeProvider';
import { shortDate } from '@/utils/dates';

export default function ParentDashboard() {
  const { t } = useTranslation();
  const hijriToday = useHijriToday();
  const theme = useTheme();
  const router = useRouter();
  const session = useRequiredSession();
  const describeError = useApiError();
  const { children, activeId, setActiveId, isPending, isError, error, refetch, isFetching } =
    useChildren();

  const overview = useQuery({
    queryKey: qk.childOverview(activeId ?? ''),
    queryFn: () => api.getChildOverview(activeId ?? ''),
    enabled: Boolean(activeId),
  });

  if (isPending) {
    return (
      <Screen>
        <PageHeader title={t('parent.greeting', { name: session.user.fullName.split(' ')[0] })} />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState
          {...describeError(error)}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </Screen>
    );
  }

  // A parent with no approved link has exactly one useful next step.
  if (children.length === 0) {
    return (
      <Screen>
        <PageHeader title={t('parent.greeting', { name: session.user.fullName.split(' ')[0] })} />
        <EmptyState
          icon={<UserPlus size={44} color={theme.colors.accent} weight="duotone" />}
          title={t('empty.noChildren')}
          body={t('empty.noChildrenBody')}
          action={{
            label: t('parent.addChild'),
            onPress: () => router.push('/(parent)/link-child'),
          }}
        />
      </Screen>
    );
  }

  const data = overview.data;

  return (
    <Screen
      refreshing={isFetching || overview.isFetching}
      onRefresh={() => {
        void refetch();
        void overview.refetch();
      }}
    >
      <PageHeader
        title={t('parent.greeting', { name: session.user.fullName.split(' ')[0] })}
        subtitle={[session.madrasa?.name, hijriToday].filter(Boolean).join(' · ')}
      />

      <View style={{ marginTop: theme.spacing.md }}>
        <ChildSwitcher children={children} activeId={activeId} onChange={setActiveId} />
      </View>

      {overview.isPending || !data ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <StudentIcon size={24} color={theme.colors.accent} weight="duotone" />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="subheading">{data.student.fullName}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {data.student.className ?? '—'}
                  </AppText>
                </View>
                <Badge label={data.student.admissionNo} />
              </View>

              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" color="textMuted">
                    {t('student.memorised')}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {t('student.juzComplete', { count: data.hifzSummary.juzCompleted })}
                  </AppText>
                </View>
                <ProgressBar
                  value={percent(data.hifzSummary.memorisedAyahs, data.hifzSummary.totalAyahs)}
                  tone="accent"
                  label={t('parent.progress')}
                />
              </View>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <StatTile
              label={t('parent.attendance')}
              value={`${data.attendanceRate}%`}
              tone={data.attendanceRate >= 85 ? 'success' : 'warning'}
            />
            <StatTile
              label={t('parent.balance')}
              value={formatMoney(data.outstandingBalance)}
              tone={data.outstandingBalance > 0 ? 'danger' : 'success'}
              caption={data.outstandingBalance === 0 ? t('parent.allSettled') : undefined}
              onPress={() => router.push('/(parent)/fees')}
            />
          </View>

          {data.outstandingBalance > 0 ? (
            <Button
              label={t('parent.payWithMpesa')}
              onPress={() => router.push('/(parent)/fees')}
            />
          ) : null}

          <View>
            <SectionHeader
              title={t('parent.attendance')}
              action={{
                label: t('common.seeAll'),
                onPress: () =>
                  router.push({
                    pathname: '/(parent)/child/[id]',
                    params: { id: data.student.id },
                  }),
              }}
            />
            <Card padded={false}>
              {data.recentAttendance.slice(0, 5).map((record, index) => (
                <View key={record.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={shortDate(record.sessionDate)}
                    left={
                      <CalendarCheck
                        size={20}
                        color={
                          record.status === 'present'
                            ? theme.colors.success
                            : record.status === 'absent'
                              ? theme.colors.danger
                              : theme.colors.warning
                        }
                        weight="duotone"
                      />
                    }
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
                    showChevron={false}
                  />
                </View>
              ))}
            </Card>
          </View>

          <Button
            label={t('parent.addChild')}
            variant="secondary"
            onPress={() => router.push('/(parent)/link-child')}
          />
        </View>
      )}
    </Screen>
  );
}
