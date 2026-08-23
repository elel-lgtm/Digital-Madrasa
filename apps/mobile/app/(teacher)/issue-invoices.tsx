import { formatMoney, issueInvoicesSchema, isoDate } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CheckCircle, Receipt } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Screen,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Issues one invoice per matching student and queues the parent notice for
 * each. Re-running it is safe: students who already have an invoice for this
 * fee structure are skipped rather than double-charged.
 */
export default function IssueInvoices() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const defaultDue = isoDate(new Date(Date.now() + 14 * 86_400_000));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  const structures = useQuery({
    queryKey: qk.feeStructures(),
    queryFn: () => api.listFeeStructures(),
  });

  const issue = useMutation({
    mutationFn: api.issueInvoices,
    onSuccess: (result) => {
      setCreated(result.created);
      void queryClient.invalidateQueries();
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const submit = () => {
    setFormError(null);
    const parsed = issueInvoicesSchema.safeParse({ feeStructureId: selectedId, dueDate });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue_) => {
        const key = issue_.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue_.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    issue.mutate(parsed.data);
  };

  if (created !== null) {
    return (
      <Screen>
        <PageHeader title={t('teacher.issueInvoices')} />
        <View style={{ alignItems: 'center', gap: theme.spacing.md, paddingTop: theme.spacing.xxl }}>
          <CheckCircle size={52} color={theme.colors.success} weight="fill" />
          <AppText variant="title" align="center">
            {created}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            {t('parent.invoices')}
          </AppText>
          <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg }}>
            <Button label={t('common.done')} onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label={t('teacher.issueInvoices')}
          size="lg"
          disabled={!selectedId}
          loading={issue.isPending}
          onPress={submit}
        />
      }
    >
      <PageHeader title={t('teacher.issueInvoices')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        {structures.isPending ? (
          <SkeletonList count={3} />
        ) : (structures.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('teacher.feeStructures')}
            body={t('teacher.createFeeStructure')}
            action={{
              label: t('teacher.createFeeStructure'),
              onPress: () => router.replace('/(teacher)/fee-structure-new'),
            }}
          />
        ) : (
          <>
            <View style={{ gap: theme.spacing.md }}>
              {(structures.data ?? []).map((structure) => {
                const selected = structure.id === selectedId;
                return (
                  <Card
                    key={structure.id}
                    accent={selected ? 'accent' : undefined}
                    onPress={() => setSelectedId(structure.id)}
                    accessibilityLabel={structure.name}
                  >
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="subheading">{structure.name}</AppText>
                        <AppText variant="caption" color="textMuted">
                          {structure.term} · {structure.academicYear} ·{' '}
                          {structure.appliesTo === 'all' ? t('common.all') : t('nav.classes')}
                        </AppText>
                      </View>
                      <Badge
                        label={formatMoney(structure.amount, structure.currency)}
                        tone={selected ? 'accent' : 'neutral'}
                      />
                    </View>
                  </Card>
                );
              })}
            </View>

            <TextField
              label={t('parent.dueOn', { date: '' }).trim()}
              value={dueDate}
              onChangeText={setDueDate}
              error={fieldError(errors['dueDate'])}
              hint="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              required
            />

            {formError ? (
              <AppText variant="caption" color="danger">
                {formError}
              </AppText>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
