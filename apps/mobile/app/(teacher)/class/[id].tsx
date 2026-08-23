import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarCheck } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Avatar,
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
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

export default function ClassDetail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const { id } = useLocalSearchParams<{ id: string }>();

  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });
  const students = useQuery({
    queryKey: qk.students({ classId: id }),
    queryFn: () => api.listStudents({ classId: id, limit: 50 }),
    enabled: Boolean(id),
  });
  const lessons = useQuery({
    queryKey: qk.lessons(id),
    queryFn: () => api.listLessons({ classId: id }),
    enabled: Boolean(id),
  });

  const klass = (classes.data ?? []).find((entry) => entry.id === id);

  if (classes.isPending || students.isPending) {
    return (
      <Screen>
        <PageHeader title={t('nav.classes')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      </Screen>
    );
  }

  if (classes.isError || !klass) {
    return (
      <Screen>
        <PageHeader title={t('nav.classes')} showBack />
        <ErrorState
          {...describeError(classes.error)}
          retryLabel={t('common.retry')}
          onRetry={() => void classes.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen refreshing={students.isFetching} onRefresh={() => void students.refetch()}>
      <PageHeader title={klass.name} subtitle={klass.teacherName ?? undefined} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <Badge label={klass.level} tone="accent" />
              {klass.schedule.map((slot) => (
                <Badge
                  key={`${slot.day}-${slot.startTime}`}
                  label={`${slot.day.slice(0, 3)} ${slot.startTime}`}
                />
              ))}
            </View>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="caption" color="textMuted">
                  {t('teacher.studentsCount', { count: klass.studentCount })}
                </AppText>
                <AppText variant="caption" color="textSubtle">
                  {klass.studentCount} / {klass.capacity}
                </AppText>
              </View>
              <ProgressBar
                value={klass.studentCount}
                max={klass.capacity}
                label={t('teacher.capacity')}
                height={6}
              />
            </View>
          </View>
        </Card>

        <Button
          label={t('teacher.markAttendance')}
          icon={<CalendarCheck size={18} color={theme.colors.textOnAccent} weight="duotone" />}
          onPress={() =>
            router.push({ pathname: '/(teacher)/attendance', params: { classId: klass.id } })
          }
        />

        <View>
          <SectionHeader title={t('nav.students')} />
          <Card padded={false}>
            {(students.data?.items ?? []).length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('empty.noStudentsBody')}
                </AppText>
              </View>
            ) : (
              (students.data?.items ?? []).map((student, index) => (
                <View key={student.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={student.fullName}
                    subtitle={student.admissionNo}
                    left={<Avatar name={student.fullName} size={34} />}
                    onPress={() =>
                      router.push({
                        pathname: '/(teacher)/student/[id]',
                        params: { id: student.id },
                      })
                    }
                  />
                </View>
              ))
            )}
          </Card>
        </View>

        <View>
          <SectionHeader title={t('teacher.lessons')} />
          <Card padded={false}>
            {(lessons.data ?? []).length === 0 ? (
              <View style={{ padding: theme.spacing.lg }}>
                <AppText variant="body" color="textMuted">
                  {t('empty.noLessonsBody')}
                </AppText>
              </View>
            ) : (
              (lessons.data ?? []).map((lesson, index) => (
                <View key={lesson.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={lesson.title}
                    subtitle={`Surah ${lesson.surahFrom} · ${lesson.ayahFrom}–${lesson.ayahTo}`}
                    showChevron={false}
                    right={<Badge label={lesson.qiraahStyle} />}
                  />
                </View>
              ))
            )}
          </Card>
        </View>
      </View>
    </Screen>
  );
}
