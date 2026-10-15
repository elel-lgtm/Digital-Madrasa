import { percent } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowRight, CalendarBlank, Flame, Microphone, Repeat } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { LiveSessionCard } from '@/components/LiveSessionCard';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
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
import { useHijriToday } from '@/hooks/useHijriToday';
import { AchievementsCard } from '@/components/AchievementsCard';
import { HifzPlanCard } from '@/components/HifzPlanCard';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDueLabel } from '@/utils/dates';

export default function StudentDashboard() {
  const { t } = useTranslation();
  const session = useRequiredSession();
  const hijriToday = useHijriToday();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const dashboard = useQuery({
    queryKey: qk.studentDashboard(),
    queryFn: () => api.getStudentDashboard(),
  });

  if (dashboard.isPending) {
    return (
      <Screen>
        <PageHeader title={t('common.loading')} />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      </Screen>
    );
  }

  if (dashboard.isError) {
    return (
      <Screen>
        <ErrorState
          {...describeError(dashboard.error)}
          retryLabel={t('common.retry')}
          onRetry={() => void dashboard.refetch()}
        />
      </Screen>
    );
  }

  const data = dashboard.data;
  const memorisedPercent = percent(data.hifzSummary.memorisedAyahs, data.hifzSummary.totalAyahs);

  return (
    <Screen refreshing={dashboard.isFetching} onRefresh={() => void dashboard.refetch()}>
      <PageHeader
        title={t('student.greeting', { name: data.studentName.split(' ')[0] })}
        subtitle={`${data.className ?? data.admissionNo} · ${hijriToday}`}
        right={
          data.streakDays > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 6,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.warningSoft,
              }}
            >
              <Flame size={16} color={theme.colors.warning} weight="fill" />
              <AppText variant="label" color="warning">
                {data.streakDays}
              </AppText>
            </View>
          ) : undefined
        }
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        {/* A class happening right now outranks everything else on the screen. */}
        {data.liveLesson ? <LiveSessionCard lesson={data.liveLesson} /> : null}

        {/* The primary action: everything else on this screen supports it. */}
        <Card accent="accent">
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <Repeat size={24} color={theme.colors.accent} weight="duotone" />
              <View style={{ flex: 1 }}>
                <AppText variant="subheading">{t('student.todaysRevision')}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t('student.todaysRevisionBody', { count: data.revisionDue.length })}
                </AppText>
              </View>
            </View>

            {data.revisionDue.slice(0, 3).map((item) => (
              <View
                key={item.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.colors.accent,
                  }}
                />
                <AppText variant="body" style={{ flex: 1 }}>
                  {item.surahName}
                </AppText>
                <Badge label={`Juz ${item.juzNo}`} />
              </View>
            ))}

            <Button
              label={t('student.startRecitation')}
              icon={<Microphone size={18} color={theme.colors.textOnAccent} weight="fill" />}
              onPress={() => router.push('/(student)/recite')}
            />
          </View>
        </Card>

        {session.student?.id ? <HifzPlanCard studentId={session.student.id} /> : null}

        {session.student?.id ? <AchievementsCard studentId={session.student.id} celebrate /> : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <StatTile
            label={t('student.memorised')}
            value={`${data.hifzSummary.juzCompleted}/30`}
            caption={t('student.juzComplete', { count: data.hifzSummary.juzCompleted })}
            tone="accent"
            onPress={() => router.push('/(student)/progress')}
          />
          <StatTile
            label={t('student.attendanceRate')}
            value={`${data.attendanceRate}%`}
            tone={data.attendanceRate >= 85 ? 'success' : 'warning'}
          />
        </View>

        <Card>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="bodyStrong">{t('student.myProgress')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('student.ayahsMemorised', { count: data.hifzSummary.memorisedAyahs })}
              </AppText>
            </View>
            <ProgressBar
              value={memorisedPercent}
              tone="accent"
              label={t('a11y.progressOf', { percent: memorisedPercent })}
            />
          </View>
        </Card>

        {data.nextLesson ? (
          <View>
            <SectionHeader title={t('student.nextClass')} />
            <Card>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
                <CalendarBlank size={22} color={theme.colors.info} weight="duotone" />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong">{data.nextLesson.title}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {data.nextLesson.className}
                  </AppText>
                </View>
                <ArrowRight size={18} color={theme.colors.textSubtle} />
              </View>
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader
            title={t('student.assignments')}
            action={{ label: t('common.seeAll'), onPress: () => router.push('/(student)/learn') }}
          />
          <Card padded={false}>
            {data.openAssignments.length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('empty.noAssignmentsBody')}
                </AppText>
              </View>
            ) : (
              data.openAssignments.slice(0, 4).map((assignment, index) => {
                const due = formatDueLabel(assignment.dueAt, t);
                return (
                  <View key={assignment.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={assignment.title}
                      subtitle={assignment.className}
                      right={<Badge label={due.label} tone={due.tone} />}
                      showChevron={false}
                    />
                  </View>
                );
              })
            )}
          </Card>
        </View>
      </View>
    </Screen>
  );
}
