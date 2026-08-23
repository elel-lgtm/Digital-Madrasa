import { createAnnouncementSchema } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { longDate } from '@/utils/dates';

type Audience = 'students' | 'parents' | 'teachers';
const AUDIENCES: Audience[] = ['students', 'parents', 'teachers'];

export default function Announcements() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience[]>(['parents']);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const announcements = useQuery({
    queryKey: qk.announcements(),
    queryFn: () => api.listAnnouncements(),
  });

  const create = useMutation({
    mutationFn: api.createAnnouncement,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      setComposeOpen(false);
      setTitle('');
      setBody('');
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const submit = () => {
    setFormError(null);
    const parsed = createAnnouncementSchema.safeParse({ title, body, audience });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <Screen refreshing={announcements.isFetching} onRefresh={() => void announcements.refetch()}>
      <PageHeader
        title={t('teacher.announcements')}
        showBack
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('teacher.createAnnouncement')}
            onPress={() => setComposeOpen(true)}
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
        {announcements.isPending ? (
          <SkeletonList count={3} />
        ) : announcements.isError ? (
          <ErrorState
            {...describeError(announcements.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void announcements.refetch()}
          />
        ) : (announcements.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Megaphone size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noAnnouncements')}
            body={t('empty.noAnnouncementsBody')}
            action={{
              label: t('teacher.createAnnouncement'),
              onPress: () => setComposeOpen(true),
            }}
          />
        ) : (
          (announcements.data ?? []).map((announcement) => (
            <Card key={announcement.id}>
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="subheading">{announcement.title}</AppText>
                <AppText variant="body" color="textMuted">
                  {announcement.body}
                </AppText>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                  {announcement.audience.map((group) => (
                    <Badge key={group} label={t(`nav.${group === 'teachers' ? 'more' : group}`)} />
                  ))}
                  <AppText variant="caption" color="textSubtle">
                    {longDate(announcement.publishAt)}
                  </AppText>
                </View>
              </View>
            </Card>
          ))
        )}
      </View>

      <Modal
        visible={composeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setComposeOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingTop: theme.spacing.lg,
              }}
            >
              <AppText variant="heading" style={{ flex: 1 }}>
                {t('teacher.createAnnouncement')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('a11y.closeSheet')}
                onPress={() => setComposeOpen(false)}
                hitSlop={10}
                style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
              >
                <AppText variant="bodyStrong" color="accent">
                  {t('common.close')}
                </AppText>
              </Pressable>
            </View>

            <TextField
              label={t('teacher.className')}
              value={title}
              onChangeText={setTitle}
              error={fieldError(errors['title'])}
              required
            />
            <TextField
              label={t('teacher.teacherRemarks')}
              value={body}
              onChangeText={setBody}
              error={fieldError(errors['body'])}
              multiline
              numberOfLines={6}
              required
            />

            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('teacher.audience')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {AUDIENCES.map((group) => {
                  const selected = audience.includes(group);
                  return (
                    <Pressable
                      key={group}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={group}
                      onPress={() =>
                        setAudience((current) =>
                          current.includes(group)
                            ? current.filter((value) => value !== group)
                            : [...current, group],
                        )
                      }
                      style={{
                        paddingHorizontal: theme.spacing.lg,
                        paddingVertical: theme.spacing.sm,
                        minHeight: MIN_TOUCH_TARGET - 8,
                        justifyContent: 'center',
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.accent : theme.colors.border,
                        backgroundColor: selected ? theme.colors.accentSoft : 'transparent',
                      }}
                    >
                      <AppText variant="caption" color={selected ? 'accent' : 'textMuted'}>
                        {group}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {errors['audience'] ? (
                <AppText variant="caption" color="danger">
                  {fieldError(errors['audience'])}
                </AppText>
              ) : null}
            </View>

            {formError ? (
              <AppText variant="caption" color="danger">
                {formError}
              </AppText>
            ) : null}

            <Button
              label={t('common.save')}
              size="lg"
              loading={create.isPending}
              onPress={submit}
            />
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}
