import {
  QIRAAH_STYLES,
  inviteTeacherSchema,
  type QiraahStyle,
  type Teacher,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Screen,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

export default function Staff() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();
  const session = useRequiredSession();

  // Adding staff is the owner's alone — `requireOwner` on the function and
  // the "teachers: owner invites" policy both say so. The server stays the
  // authority; hiding the control only avoids offering an ordinary teacher
  // an action that would come back 403.
  const canInvite = session.teacher?.isOwner === true;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [specialisation, setSpecialisation] = useState('');
  const [styles, setStyles] = useState<QiraahStyle[]>(['hafs']);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [justInvited, setJustInvited] = useState<Teacher | null>(null);

  const teachers = useQuery({ queryKey: qk.teachers(), queryFn: () => api.listTeachers() });

  const invite = useMutation({
    mutationFn: api.inviteTeacher,
    onSuccess: (teacher) => {
      void queryClient.invalidateQueries({ queryKey: qk.teachers() });
      setInviteOpen(false);
      // Kept on the list behind them: nothing was emailed, so the owner is the
      // only one who can tell the new teacher how to get in.
      setJustInvited(teacher);
      setFullName('');
      setEmail('');
      setSpecialisation('');
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const submit = () => {
    setFormError(null);
    const parsed = inviteTeacherSchema.safeParse({
      fullName,
      email,
      specialisation: specialisation || undefined,
      qiraahStyles: styles,
    });
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
    invite.mutate(parsed.data);
  };

  return (
    <Screen refreshing={teachers.isFetching} onRefresh={() => void teachers.refetch()}>
      <PageHeader
        title={t('teacher.staff')}
        showBack
        right={
          canInvite ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('teacher.inviteTeacher')}
              onPress={() => setInviteOpen(true)}
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
          ) : null
        }
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        {justInvited ? (
          <Card accent="success">
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="bodyStrong">
                {t('teacher.inviteAdded', { name: justInvited.fullName })}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {justInvited.email}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t('teacher.inviteNoEmail')}
              </AppText>
            </View>
          </Card>
        ) : null}

        {teachers.isPending ? (
          <SkeletonList count={3} />
        ) : teachers.isError ? (
          <ErrorState
            {...describeError(teachers.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void teachers.refetch()}
          />
        ) : (
          (teachers.data ?? []).map((teacher) => (
            <Card key={teacher.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <Avatar name={teacher.fullName} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong">{teacher.fullName}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {teacher.specialisation ?? teacher.email}
                  </AppText>
                  <AppText variant="caption" color="textSubtle">
                    {teacher.employeeNo} · {teacher.qiraahStyles.join(', ')}
                  </AppText>
                  <AppText variant="caption" color="textSubtle">
                    {teacher.classCount > 0
                      ? t('teacher.staffClasses', { count: teacher.classCount })
                      : t('teacher.staffNoClasses')}
                  </AppText>
                </View>
                <View style={{ gap: 4, alignItems: 'flex-end' }}>
                  {teacher.isOwner ? <Badge label={t('teacher.staffOwner')} tone="accent" /> : null}
                  {/* Not `parent.requestPending`: nobody is approving a
                      teacher. The account exists and is waiting for them to
                      set a password and sign in. */}
                  {teacher.status === 'invited' ? (
                    <Badge label={t('teacher.staffInvited')} tone="warning" />
                  ) : null}
                  {/* The schema has three states; only two were ever shown, so
                      a suspended account looked like an ordinary one. */}
                  {teacher.status === 'suspended' ? (
                    <Badge label={t('teacher.staffSuspended')} tone="danger" />
                  ) : null}
                </View>
              </View>
            </Card>
          ))
        )}
      </View>

      <Modal
        visible={inviteOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviteOpen(false)}
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
                {t('teacher.inviteTeacher')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('a11y.closeSheet')}
                onPress={() => setInviteOpen(false)}
                hitSlop={10}
                style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
              >
                <AppText variant="bodyStrong" color="accent">
                  {t('common.close')}
                </AppText>
              </Pressable>
            </View>

            <TextField
              label={t('auth.fullName')}
              value={fullName}
              onChangeText={setFullName}
              error={fieldError(errors['fullName'])}
              autoCapitalize="words"
              required
            />
            <TextField
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              error={fieldError(errors['email'])}
              autoCapitalize="none"
              keyboardType="email-address"
              required
            />
            <TextField
              label={t('teacher.level')}
              value={specialisation}
              onChangeText={setSpecialisation}
              placeholder="Tajweed"
            />

            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('student.qiraah')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {QIRAAH_STYLES.slice(0, 3).map((style) => {
                  const selected = styles.includes(style);
                  return (
                    <Pressable
                      key={style}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={style}
                      onPress={() =>
                        setStyles((current) =>
                          current.includes(style)
                            ? current.filter((value) => value !== style)
                            : [...current, style],
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
                        {style}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {errors['qiraahStyles'] ? (
                <AppText variant="caption" color="danger">
                  {fieldError(errors['qiraahStyles'])}
                </AppText>
              ) : null}
            </View>

            {formError ? (
              <AppText variant="caption" color="danger">
                {formError}
              </AppText>
            ) : null}

            <Button
              label={t('teacher.inviteTeacher')}
              size="lg"
              loading={invite.isPending}
              onPress={submit}
            />
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}
