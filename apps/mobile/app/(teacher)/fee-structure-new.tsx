import { createFeeStructureSchema } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Button,
  OptionGroup,
  PageHeader,
  Screen,
  TextField,
  type Option,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

export default function NewFeeStructure() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const [name, setName] = useState('');
  const [term, setTerm] = useState('Term 1');
  const [amount, setAmount] = useState('');
  const [appliesTo, setAppliesTo] = useState<'all' | 'class'>('all');
  const [classId, setClassId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });

  const create = useMutation({
    mutationFn: api.createFeeStructure,
    onSuccess: () => {
      void queryClient.invalidateQueries();
      router.back();
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const submit = () => {
    setFormError(null);
    const parsed = createFeeStructureSchema.safeParse({
      name,
      academicYear: currentYear,
      term,
      amount: Number(amount),
      currency: 'KES',
      appliesTo,
      classId: appliesTo === 'class' ? classId : null,
      studentId: null,
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
    create.mutate(parsed.data);
  };

  const classOptions: Option<string>[] = (classes.data ?? []).map((klass) => ({
    value: klass.id,
    label: klass.name,
  }));

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
        <PageHeader title={t('teacher.createFeeStructure')} showBack />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <TextField
            label={t('teacher.className')}
            value={name}
            onChangeText={setName}
            error={fieldError(errors['name'])}
            placeholder={`Term 1 ${currentYear} tuition`}
            required
          />
          <OptionGroup
            label={t('teacher.term')}
            options={[
              { value: 'Term 1', label: 'Term 1' },
              { value: 'Term 2', label: 'Term 2' },
              { value: 'Term 3', label: 'Term 3' },
            ]}
            value={term}
            onChange={setTerm}
            columns={3}
          />
          <TextField
            label={`${t('fees.amountDue')} (KES)`}
            value={amount}
            onChangeText={setAmount}
            error={fieldError(errors['amount'])}
            keyboardType="number-pad"
            placeholder="3500"
            required
          />
          <OptionGroup
            label={t('teacher.audience')}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'class', label: t('nav.classes') },
            ]}
            value={appliesTo}
            onChange={(value) => setAppliesTo(value as 'all' | 'class')}
          />
          {appliesTo === 'class' ? (
            <OptionGroup
              label={t('teacher.assignClass')}
              options={classOptions}
              value={classId}
              onChange={setClassId}
              error={fieldError(errors['classId'])}
            />
          ) : null}

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
