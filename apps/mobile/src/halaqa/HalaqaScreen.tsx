import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { EmptyState, PageHeader, Screen, SkeletonList } from '@/components/ui';
import { HalaqaRoom } from '@/halaqa/HalaqaRoom';
import { LiveVideo } from '@/halaqa/LiveVideo';
import { useTheme } from '@/theme/ThemeProvider';

/** Route wrapper: finds the lesson, then opens its live room. */
export function HalaqaScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lessons = useQuery({ queryKey: ['lessons', 'all'], queryFn: () => api.listLessons({}) });
  const lesson = (lessons.data ?? []).find((l) => l.id === id);

  if (!lesson) {
    return (
      <Screen>
        <PageHeader title={t('halaqa.title')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          {lessons.isPending ? <SkeletonList count={3} /> : <EmptyState title={t('halaqa.notFound')} body={t('halaqa.notFoundBody')} />}
        </View>
      </Screen>
    );
  }
  return <HalaqaRoom lesson={lesson} video={<LiveVideo lessonId={lesson.id} />} />;
}
