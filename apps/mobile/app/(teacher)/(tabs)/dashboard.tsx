import { formatMoney } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  CalendarCheck,
  CheckCircle,
  Circle,
  Megaphone,
  UserPlus,
  WaveTriangle,
} from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { LiveSessionCard } from '@/components/LiveSessionCard';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  ListRow,
  PageHeader,
  ProgressBar,
  Screen,
  SectionHeader,
  SkeletonList,
  StatTile,
  ErrorState,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

export default function TeacherDashboard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useRequiredSession();
  const describeError = useApiError();

  const dashboard = useQuery({
    queryKey: qk.teacherDashboard(),
    queryFn: () => api.getTeacherDashboard(),
  });

  const subscription = useQuery({
    queryKey: qk.subscription(),
    queryFn: () => api.getSubscription(),
  });

  if (dashboard.isPending) {
    return (
      <Screen>
        <PageHeader title={t('teacher.greeting', { name: firstName(session.user.fullName) })} />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      </Screen>
    );
  }

  if (dashboard.isError) {
    const friendly = describeError(dashboard.error);
    return (
      <Screen>
        <ErrorState
          title={friendly.title}
          body={friendly.body}
          offline={friendly.offline}
          retryLabel={t('common.retry')}
          onRetry={() => void dashboard.refetch()}
        />
      </Screen>
    );
  }

  const data = dashboard.data;
  const onboardingDone = data.onboarding.filter((task) => task.done).length;
  const onboardingIncomplete = onboardingDone < data.onboarding.length;

  return (
    <Screen refreshing={dashboard.isFetching} onRefresh={() => void dashboard.refetch()}>
      <PageHeader
        title={t('teacher.greeting', { name: firstName(session.user.fullName) })}
        subtitle={data.madrasaName}
      />

      <View style={{ gap: theme.spacing.xl, marginTop: theme.spacing.lg }}>
        {/* Billing sits above everything: if the subscription lapses, the
            madrasa loses the ability to enrol and invoice. */}
        {subscription.data ? <SubscriptionBanner subscription={subscription.data} /> : null}

        {/* A class due to start now outranks the work queue below it. */}
        {data.liveLesson ? (
          <LiveSessionCard lesson={data.liveLesson} viewer={session.teacher} />
        ) : null}

        {/* Things waiting on the teacher come first — this is a work queue. */}
        {(data.pendingReviewCount > 0 || data.pendingLinkRequests > 0) && (
          <View style={{ gap: theme.spacing.md }}>
            {data.pendingReviewCount > 0 ? (
              <Card accent="accent" onPress={() => router.push('/(teacher)/review')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
                  <WaveTriangle size={26} color={theme.colors.accent} weight="duotone" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="subheading">{t('teacher.pendingReviews')}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {data.pendingReviewCount}
                    </AppText>
                  </View>
                  <Badge label={String(data.pendingReviewCount)} tone="accent" />
                </View>
              </Card>
            ) : null}

            {data.pendingLinkRequests > 0 ? (
              <Card accent="info" onPress={() => router.push('/(teacher)/link-requests')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
                  <UserPlus size={26} color={theme.colors.info} weight="duotone" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="subheading">{t('teacher.pendingRequests')}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {t('teacher.linkRequests')}
                    </AppText>
                  </View>
                  <Badge label={String(data.pendingLinkRequests)} tone="info" />
                </View>
              </Card>
            ) : null}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <StatTile
            label={t('nav.students')}
            value={String(data.studentCount)}
            onPress={() => router.push('/(teacher)/students')}
          />
          <StatTile
            label={t('teacher.attendance')}
            value={`${data.attendanceRateThisWeek}%`}
            caption={t('common.thisWeek')}
            tone={data.attendanceRateThisWeek >= 80 ? 'success' : 'warning'}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <StatTile
            label={t('teacher.collected')}
            value={formatMoney(data.feesCollected)}
            tone="success"
            onPress={() => router.push('/(teacher)/fees')}
          />
          <StatTile
            label={t('teacher.outstanding')}
            value={formatMoney(data.feesOutstanding)}
            tone={data.feesOutstanding > 0 ? 'danger' : 'neutral'}
            onPress={() => router.push('/(teacher)/fees')}
          />
        </View>

        <View>
          <SectionHeader title={t('teacher.todaysClasses')} />
          <Card padded={false}>
            {data.todaysClasses.length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('empty.noClassesBody')}
                </AppText>
              </View>
            ) : (
              data.todaysClasses.map((entry, index) => (
                <View key={entry.klass.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={entry.klass.name}
                    subtitle={t('teacher.studentsCount', { count: entry.klass.studentCount })}
                    left={
                      <CalendarCheck
                        size={22}
                        color={
                          entry.attendanceMarked ? theme.colors.success : theme.colors.warning
                        }
                        weight="duotone"
                      />
                    }
                    right={
                      entry.attendanceMarked ? (
                        <Badge label={t('common.done')} tone="success" />
                      ) : (
                        <Badge label={t('teacher.markAttendance')} tone="warning" />
                      )
                    }
                    onPress={() =>
                      router.push({
                        pathname: '/(teacher)/attendance',
                        params: { classId: entry.klass.id },
                      })
                    }
                  />
                </View>
              ))
            )}
          </Card>
        </View>

        {onboardingIncomplete ? (
          <View>
            <SectionHeader
              title={t('teacher.onboardingTitle')}
              subtitle={t('teacher.onboardingBody', {
                done: onboardingDone,
                total: data.onboarding.length,
              })}
            />
            <Card>
              <View style={{ gap: theme.spacing.md }}>
                <ProgressBar
                  value={onboardingDone}
                  max={data.onboarding.length}
                  label={t('teacher.onboardingTitle')}
                />
                {data.onboarding.map((task) => (
                  <View
                    key={task.key}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                  >
                    {task.done ? (
                      <CheckCircle size={20} color={theme.colors.success} weight="fill" />
                    ) : (
                      <Circle size={20} color={theme.colors.textSubtle} />
                    )}
                    <AppText
                      variant="body"
                      color={task.done ? 'textSubtle' : 'text'}
                      style={task.done ? { textDecorationLine: 'line-through' } : undefined}
                    >
                      {t(`teacher.onboarding_${task.key}`)}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader
            title={t('teacher.announcements')}
            action={{
              label: t('common.seeAll'),
              onPress: () => router.push('/(teacher)/announcements'),
            }}
          />
          {data.recentAnnouncements.length === 0 ? (
            <Card>
              <AppText variant="body" color="textMuted">
                {t('empty.noAnnouncementsBody')}
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: theme.spacing.md }}>
              {data.recentAnnouncements.map((announcement) => (
                <Card key={announcement.id}>
                  <View
                    style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}
                  >
                    <Megaphone size={20} color={theme.colors.accent} weight="duotone" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyStrong">{announcement.title}</AppText>
                      <AppText variant="caption" color="textMuted" numberOfLines={2}>
                        {announcement.body}
                      </AppText>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        <Button
          label={t('teacher.addStudent')}
          variant="secondary"
          onPress={() => router.push('/(teacher)/student-new')}
        />
      </View>
    </Screen>
  );
}

function firstName(fullName: string): string {
  const parts = fullName.split(' ');
  // Honorifics like "Ustadh" read oddly on their own, so keep the given name.
  if (parts.length > 1 && /^(ustadh|ustadha|sheikh|mwalimu)$/i.test(parts[0] ?? '')) {
    return parts[1] ?? fullName;
  }
  return parts[0] ?? fullName;
}
