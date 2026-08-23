import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { LiveLinkEditor } from '@/components/LiveLinkEditor';
import { LiveSessionRow } from '@/components/LiveSessionCard';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { shortDate } from '@/utils/dates';

export default function Lessons() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const session = useRequiredSession();

  const lessons = useQuery({ queryKey: qk.lessons(null), queryFn: () => api.listLessons({}) });

  return (
    <Screen refreshing={lessons.isFetching} onRefresh={() => void lessons.refetch()}>
      <PageHeader title={t('teacher.lessons')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        {lessons.isPending ? (
          <SkeletonList count={4} />
        ) : lessons.isError ? (
          <ErrorState
            {...describeError(lessons.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void lessons.refetch()}
          />
        ) : (lessons.data ?? []).length === 0 ? (
          <EmptyState
            icon={<BookOpen size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noLessons')}
            body={t('empty.noLessonsBody')}
          />
        ) : (
          (lessons.data ?? []).map((lesson) => (
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
                  <Badge label={lesson.qiraahStyle} tone="accent" />
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
                <LiveSessionRow lesson={lesson} viewer={session.teacher} />
                <LiveLinkEditor lesson={lesson} />
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
