import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarBlank, ChalkboardTeacher, Plus } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

const DAY_LABEL: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export default function ClassesTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });

  return (
    <Screen refreshing={classes.isFetching} onRefresh={() => void classes.refetch()}>
      <PageHeader
        title={t('nav.classes')}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('teacher.createClass')}
            onPress={() => router.push('/(teacher)/class-new')}
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={22} color={theme.colors.textOnAccent} weight="bold" />
          </Pressable>
        }
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        {classes.isPending ? (
          <SkeletonList count={3} />
        ) : classes.isError ? (
          <ErrorState
            {...describeError(classes.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void classes.refetch()}
          />
        ) : classes.data.length === 0 ? (
          <EmptyState
            icon={<ChalkboardTeacher size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noClasses')}
            body={t('empty.noClassesBody')}
            action={{
              label: t('teacher.createClass'),
              onPress: () => router.push('/(teacher)/class-new'),
            }}
          />
        ) : (
          classes.data.map((klass) => {
            const full = klass.studentCount >= klass.capacity;
            return (
              <Card
                key={klass.id}
                onPress={() =>
                  router.push({ pathname: '/(teacher)/class/[id]', params: { id: klass.id } })
                }
              >
                <View style={{ gap: theme.spacing.md }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="subheading">{klass.name}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {klass.teacherName ?? t('teacher.assignTeacher')}
                      </AppText>
                    </View>
                    <Badge label={klass.level} />
                  </View>

                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="caption" color="textMuted">
                        {t('teacher.studentsCount', { count: klass.studentCount })}
                      </AppText>
                      <AppText variant="caption" color={full ? 'warning' : 'textSubtle'}>
                        {klass.studentCount} / {klass.capacity}
                      </AppText>
                    </View>
                    <ProgressBar
                      value={klass.studentCount}
                      max={klass.capacity}
                      tone={full ? 'warning' : 'accent'}
                      label={t('teacher.capacity')}
                      height={6}
                    />
                  </View>

                  {klass.schedule.length > 0 ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        flexWrap: 'wrap',
                      }}
                    >
                      <CalendarBlank size={16} color={theme.colors.textSubtle} />
                      {klass.schedule.map((slot) => (
                        <AppText
                          key={`${slot.day}-${slot.startTime}`}
                          variant="caption"
                          color="textSubtle"
                        >
                          {DAY_LABEL[slot.day] ?? slot.day} {slot.startTime}
                        </AppText>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}
