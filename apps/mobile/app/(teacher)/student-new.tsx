import { createStudentSchema, type Student } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { CheckCircle, Copy, IdentificationBadge } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Button,
  Card,
  OptionGroup,
  PageHeader,
  Screen,
  TextField,
  type Option,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Add a student.
 *
 * There is deliberately no admission-number field on this form. The number is
 * issued by the database when the row is inserted, and only then shown back —
 * which is why the success state below is a reveal rather than a confirmation.
 */
export default function NewStudent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const [values, setValues] = useState({
    fullName: '',
    dateOfBirth: '',
    gender: '' as '' | 'male' | 'female',
    classId: '' as string,
    guardianNotes: '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Student | null>(null);
  const [copied, setCopied] = useState(false);

  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });

  const create = useMutation({
    mutationFn: api.createStudent,
    onSuccess: (student) => {
      setCreated(student);
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: qk.teacherDashboard() });
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const setField = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const submit = () => {
    setFormError(null);
    const parsed = createStudentSchema.safeParse({
      fullName: values.fullName,
      dateOfBirth: values.dateOfBirth,
      gender: values.gender || undefined,
      classId: values.classId || null,
      guardianNotes: values.guardianNotes || undefined,
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
    create.mutate(parsed.data);
  };

  const classOptions: Option<string>[] = (classes.data ?? []).map((klass) => ({
    value: klass.id,
    label: klass.name,
  }));

  if (created) {
    return (
      <Screen>
        <PageHeader title={t('teacher.studentAdded', { name: created.fullName })} />
        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.xl }}>
          <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
            <CheckCircle size={52} color={theme.colors.success} weight="fill" />
            <AppText variant="heading" align="center">
              {t('teacher.admissionNoIssued')}
            </AppText>
            <AppText variant="body" color="textMuted" align="center">
              {t('teacher.admissionNoBody', { name: created.fullName })}
            </AppText>
          </View>

          <Card accent="accent">
            <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
              <IdentificationBadge size={28} color={theme.colors.accent} weight="duotone" />
              <AppText variant="display" color="accent">
                {created.admissionNo}
              </AppText>
              <Button
                label={copied ? t('common.copied') : t('common.copy')}
                variant="secondary"
                fullWidth={false}
                icon={<Copy size={16} color={theme.colors.text} />}
                onPress={() => {
                  void Clipboard.setStringAsync(created.admissionNo);
                  setCopied(true);
                }}
              />
            </View>
          </Card>

          <View style={{ gap: theme.spacing.md }}>
            <Button
              label={t('teacher.addStudent')}
              variant="secondary"
              onPress={() => {
                setCreated(null);
                setCopied(false);
                setValues({
                  fullName: '',
                  dateOfBirth: '',
                  gender: '',
                  classId: values.classId,
                  guardianNotes: '',
                });
              }}
            />
            <Button label={t('common.done')} onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        footer={
          <Button
            label={t('common.save')}
            size="lg"
            loading={create.isPending}
            onPress={submit}
          />
        }
      >
        <PageHeader
          title={t('teacher.addStudentTitle')}
          subtitle={t('teacher.addStudentBody')}
          showBack
        />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <TextField
            label={t('teacher.fullName')}
            value={values.fullName}
            onChangeText={(value) => setField('fullName', value)}
            error={fieldError(errors['fullName'])}
            autoCapitalize="words"
            required
          />
          <TextField
            label={t('teacher.dateOfBirth')}
            value={values.dateOfBirth}
            onChangeText={(value) => setField('dateOfBirth', value)}
            error={fieldError(errors['dateOfBirth'])}
            placeholder="2014-05-21"
            hint="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            required
          />
          <OptionGroup
            label={t('teacher.gender')}
            options={[
              { value: 'male', label: t('teacher.male') },
              { value: 'female', label: t('teacher.female') },
            ]}
            value={values.gender || null}
            onChange={(value) => setField('gender', value as 'male' | 'female')}
            error={fieldError(errors['gender'])}
          />
          {classOptions.length > 0 ? (
            <OptionGroup
              label={t('teacher.assignClass')}
              options={classOptions}
              value={values.classId || null}
              onChange={(value) => setField('classId', value)}
              error={fieldError(errors['classId'])}
            />
          ) : null}
          <TextField
            label={t('teacher.guardianNotes')}
            value={values.guardianNotes}
            onChangeText={(value) => setField('guardianNotes', value)}
            error={fieldError(errors['guardianNotes'])}
            multiline
            numberOfLines={3}
          />

          {formError ? (
            <AppText variant="caption" color="danger">
              {formError}
            </AppText>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
