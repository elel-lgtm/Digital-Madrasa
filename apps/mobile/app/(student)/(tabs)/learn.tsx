import { useQuery } from '@tanstack/react-query';
import { BookOpen, ClipboardText } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { LiveSessionRow } from '@/components/LiveSessionCard';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  Segmented,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDueLabel, shortDate } from '@/utils/dates';

type Tab = 'assignments' | 'lessons';

export default function Learn() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const [tab, setTab] = useState<Tab>('assignments');

  const assignments = useQuery({
    queryKey: qk.assignments(null),
    queryFn: () => api.listAssignments({}),
  });
  const lessons = useQuery({ queryKey: qk.lessons(null), queryFn: () => api.listLessons({}) });

  const active = tab === 'assignments' ? assignments : lessons;

  return (
    <Screen refreshing={active.isFetching} onRefresh={() => void active.refetch()}>
      <PageHeader title={t('nav.learn')} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Segmented
          options={[
            { value: 'assignments', label: t('student.assignments') },
            { value: 'lessons', label: t('teacher.lessons') },
          ]}
          value={tab}
          onChange={setTab}
        />

        {active.isPending ? (
          <SkeletonList count={4} />
        ) : active.isError ? (
          <ErrorState
            {...describeError(active.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void active.refetch()}
          />
        ) : tab === 'assignments' ? (
          (assignments.data ?? []).length === 0 ? (
            <EmptyState
              icon={<ClipboardText size={40} color={theme.colors.textSubtle} weight="duotone" />}
              title={t('empty.noAssignments')}
              body={t('empty.noAssignmentsBody')}
            />
          ) : (
            <View style={{ gap: theme.spacing.md }}>
              {(assignments.data ?? []).map((assignment) => {
                const due = formatDueLabel(assignment.dueAt, t);
                const submitted =
                  assignment.mySubmissionStatus && assignment.mySubmissionStatus !== 'not_submitted';
                return (
                  <Card
                    key={assignment.id}
                    accent={submitted ? 'success' : due.tone === 'danger' ? 'danger' : undefined}
                  >
                    <View style={{ gap: theme.spacing.sm }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: theme.spacing.md,
                        }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText variant="subheading">{assignment.title}</AppText>
                          <AppText variant="caption" color="textMuted">
                            {assignment.className} · {assignment.assignmentType}
                          </AppText>
                        </View>
                        <Badge
                          label={submitted ? t('student.submitted') : due.label}
                          tone={submitted ? 'success' : due.tone}
                        />
                      </View>
                      <AppText variant="body" color="textMuted" numberOfLines={3}>
                        {assignment.instructions}
                      </AppText>
                    </View>
                  </Card>
                );
              })}
            </View>
          )
        ) : (lessons.data ?? []).length === 0 ? (
          <EmptyState
            icon={<BookOpen size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noLessons')}
            body={t('empty.noLessonsBody')}
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {(lessons.data ?? []).map((lesson) => (
              <Card key={lesson.id}>
                <View style={{ gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="subheading">{lesson.title}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {lesson.className}
                        {lesson.scheduledFor ? ` · ${shortDate(lesson.scheduledFor)}` : ''}
                      </AppText>
                    </View>
                    <Badge label={lesson.qiraahStyle} />
                  </View>
                  <AppText variant="caption" color="textSubtle">
                    {lesson.surahFrom === lesson.surahTo
                      ? `Surah ${lesson.surahFrom} · ${lesson.ayahFrom}–${lesson.ayahTo}`
                      : `Surah ${lesson.surahFrom}:${lesson.ayahFrom} – ${lesson.surahTo}:${lesson.ayahTo}`}
                  </AppText>
                  {lesson.notes ? (
                    <AppText variant="body" color="textMuted">
                      {lesson.notes}
                    </AppText>
                  ) : null}
                  <LiveSessionRow lesson={lesson} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
