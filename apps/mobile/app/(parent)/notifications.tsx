import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferences,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Card,
  Divider,
  ErrorState,
  PageHeader,
  Screen,
  SkeletonList,
  ToggleRow,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  fees: 'parent.fees',
  attendance: 'parent.attendance',
  grades: 'parent.grades',
  announcements: 'teacher.announcements',
  messages: 'nav.messages',
  progress: 'parent.progress',
};

/**
 * Per-category channel preferences. In-app delivery is always on and has no
 * switch — a parent must never be able to silence a fee notice entirely and
 * then be surprised by arrears.
 */
export default function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();

  const prefs = useQuery({
    queryKey: qk.notificationPrefs(),
    queryFn: () => api.getNotificationPreferences(),
  });

  const save = useMutation({
    mutationFn: (next: NotificationPreferences) => api.saveNotificationPreferences(next),
    onMutate: async (next) => {
      // Optimistic: a toggle should feel instant even on a slow connection.
      await queryClient.cancelQueries({ queryKey: qk.notificationPrefs() });
      const previous = queryClient.getQueryData<NotificationPreferences>(
        qk.notificationPrefs(),
      );
      queryClient.setQueryData(qk.notificationPrefs(), next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(qk.notificationPrefs(), context.previous);
      }
    },
  });

  const toggle = (
    category: NotificationCategory,
    channel: 'push' | 'email' | 'sms',
    value: boolean,
  ) => {
    const current = prefs.data;
    if (!current) return;
    const entry = current[category];
    if (!entry) return;
    save.mutate({ ...current, [category]: { ...entry, [channel]: value } });
  };

  return (
    <Screen>
      <PageHeader
        title={t('parent.notificationPrefs')}
        subtitle={t('parent.notificationPrefsBody')}
        showBack
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        {prefs.isPending ? (
          <SkeletonList count={4} />
        ) : prefs.isError ? (
          <ErrorState
            {...describeError(prefs.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void prefs.refetch()}
          />
        ) : (
          NOTIFICATION_CATEGORIES.map((category) => {
            const entry = prefs.data[category];
            if (!entry) return null;
            return (
              <Card key={category}>
                <View style={{ gap: theme.spacing.xs }}>
                  <AppText variant="subheading">{t(CATEGORY_LABEL[category])}</AppText>
                  <Divider />
                  <ToggleRow
                    label="Push"
                    value={entry.push}
                    onChange={(value) => toggle(category, 'push', value)}
                  />
                  <ToggleRow
                    label="Email"
                    value={entry.email}
                    onChange={(value) => toggle(category, 'email', value)}
                  />
                  <ToggleRow
                    label="SMS"
                    description={
                      category === 'fees' || category === 'attendance'
                        ? 'Sent even without a data connection'
                        : undefined
                    }
                    value={entry.sms}
                    onChange={(value) => toggle(category, 'sms', value)}
                  />
                </View>
              </Card>
            );
          })
        )}

        <AppText variant="caption" color="textSubtle">
          In-app messages are always delivered and cannot be turned off.
        </AppText>
      </View>
    </Screen>
  );
}
