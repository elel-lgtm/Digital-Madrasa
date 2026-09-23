import {
  formatMoney,
  isoDate,
  issueInvoicesSchema,
  type BillingScope,
  type FeeStructure,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CheckCircle, Receipt, Users, User, Buildings, Warning } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ListRow,
  OptionGroup,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError, useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Step = 'setup' | 'review' | 'done';

/**
 * Issues invoices to a target the issuer has named.
 *
 * The previous version of this screen sent nothing but a fee structure and a
 * due date. The server read an absent target as "every enrolled student", so
 * the single button on the screen could only ever bill the whole madrasa —
 * including when the chosen fee belonged to one pupil. Choosing who to bill is
 * now the first decision, and the button that commits says how many invoices
 * it will raise and for how much.
 *
 * Nothing on this screen decides who is billable. The counts in the review
 * come from the server, which resolves the target against the database under
 * the caller's own permissions; the roster loaded here is only so the issuer
 * can point at a pupil or a class by name.
 */
export default function IssueInvoices() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const defaultDue = isoDate(new Date(Date.now() + 14 * 86_400_000));
  const [structureId, setStructureId] = useState<string | null>(null);
  const [scope, setScope] = useState<BillingScope | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [step, setStep] = useState<Step>('setup');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const structures = useQuery({
    queryKey: qk.feeStructures(),
    queryFn: () => api.listFeeStructures(),
  });
  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });
  const students = useQuery({
    queryKey: qk.students({ billing: true }),
    queryFn: () => api.listStudents({ limit: 100 }),
  });

  const structure = (structures.data ?? []).find((s) => s.id === structureId) ?? null;

  /**
   * A fee that exists for one class or one pupil already names its target, so
   * the scope is read off the structure rather than asked for. Only a fee that
   * applies to everyone leaves a real choice.
   */
  const fixedScope: BillingScope | null =
    structure?.appliesTo === 'class' ? 'class' : structure?.appliesTo === 'student' ? 'student' : null;
  const effectiveScope = fixedScope ?? scope;

  const effectiveStudentId =
    structure?.appliesTo === 'student' ? (structure.studentId ?? null) : studentId;
  const effectiveClassId = structure?.appliesTo === 'class' ? structure.classId : classId;

  const input = useMemo(() => {
    if (!structureId || !effectiveScope) return null;
    const parsed = issueInvoicesSchema.safeParse({
      feeStructureId: structureId,
      dueDate,
      scope: effectiveScope,
      studentId: effectiveScope === 'student' ? (effectiveStudentId ?? undefined) : undefined,
      classId: effectiveScope === 'class' ? (effectiveClassId ?? undefined) : undefined,
    });
    return parsed.success ? parsed.data : null;
  }, [structureId, effectiveScope, effectiveStudentId, effectiveClassId, dueDate]);

  const preview = useQuery({
    queryKey: ['invoice-preview', input],
    queryFn: () => api.previewInvoices(input!),
    enabled: step === 'review' && Boolean(input),
    retry: false,
    // Recounted each time the review is opened: another member of staff may
    // have issued some of these between the two steps.
    staleTime: 0,
  });

  const issue = useMutation({
    mutationFn: () => api.issueInvoices(input!),
    onSuccess: () => {
      setStep('done');
      void queryClient.invalidateQueries();
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const targetName = () => {
    if (effectiveScope === 'student') {
      const s = (students.data?.items ?? []).find((x) => x.id === effectiveStudentId);
      return s ? `${s.fullName} · ${s.admissionNo}` : '';
    }
    if (effectiveScope === 'class') {
      return (classes.data ?? []).find((c) => c.id === effectiveClassId)?.name ?? '';
    }
    // The scope label above already reads "Entire madrasa"; repeating it as the
    // target name says the same thing twice.
    return '';
  };

  const toReview = () => {
    setFormError(null);
    if (!input) {
      // `structureId` cannot be missing here — the button is disabled without
      // one — so only the choices the issuer can still have skipped are named.
      const next: Record<string, string> = {};
      if (!effectiveScope) next['scope'] = t('validation.scope_required');
      if (effectiveScope === 'student' && !effectiveStudentId)
        next['studentId'] = t('validation.student_required');
      if (effectiveScope === 'class' && !effectiveClassId)
        next['classId'] = t('validation.class_required');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) next['dueDate'] = t('validation.date_invalid');
      setErrors(next);
      return;
    }
    setErrors({});
    setStep('review');
  };

  // ------------------------------------------------------------------- done
  if (step === 'done' && issue.data) {
    const result = issue.data;
    return (
      <Screen footer={<Button label={t('common.done')} size="lg" onPress={() => router.back()} />}>
        <PageHeader title={t('invoicing.issued')} />
        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.lg }}>
          <Card accent={result.created > 0 ? 'success' : undefined}>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <CheckCircle
                size={52}
                color={result.created > 0 ? theme.colors.success : theme.colors.textMuted}
                weight="fill"
              />
              <AppText variant="title">{result.created}</AppText>
              <AppText variant="body" color="textMuted" align="center">
                {t('invoicing.invoicesIssued', { count: result.created })}
              </AppText>
              {result.created > 0 ? (
                <Badge label={formatMoney(result.total, result.currency)} tone="accent" />
              ) : null}
            </View>
          </Card>

          {/* Nothing was raised because every pupil in the target already had
              this fee. Saying so is more use than a success screen showing a
              zero with no explanation. */}
          {result.created === 0 ? (
            <Card>
              <AppText variant="body" color="textMuted">
                {t('invoicing.allAlreadyBilled', { count: result.alreadyBilled })}
              </AppText>
            </Card>
          ) : null}

          {result.invoices.length ? (
            <View>
              <SectionHeader title={t('invoicing.invoiceNumbers')} />
              <Card padded={false}>
                <View style={{ paddingHorizontal: theme.spacing.lg }}>
                  {result.invoices.map((invoice, index) => (
                    <View key={invoice.invoiceNo}>
                      {index > 0 ? <Divider /> : null}
                      <ListRow
                        title={invoice.invoiceNo}
                        subtitle={`${invoice.studentName} · ${t('parent.dueOn', { date: invoice.dueDate })}`}
                        right={
                          <AppText variant="bodyStrong">
                            {formatMoney(invoice.amount, result.currency)}
                          </AppText>
                        }
                      />
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          ) : null}
        </View>
      </Screen>
    );
  }

  // ----------------------------------------------------------------- review
  if (step === 'review') {
    const data = preview.data;
    const broad = effectiveScope === 'madrasa';

    return (
      <Screen
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              label={
                data
                  ? t('invoicing.confirmIssue', {
                      count: data.toIssue,
                      total: formatMoney(data.total, data.currency),
                    })
                  : t('common.loading')
              }
              size="lg"
              variant={broad ? 'danger' : 'primary'}
              disabled={!data || data.toIssue === 0}
              loading={issue.isPending}
              onPress={() => issue.mutate()}
            />
            <Button
              label={t('common.back')}
              variant="secondary"
              onPress={() => {
                setFormError(null);
                setStep('setup');
              }}
            />
          </View>
        }
      >
        <PageHeader title={t('invoicing.review')} subtitle={t('invoicing.reviewBody')} showBack />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          {/* The target first and largest: it is the thing that is easy to get
              wrong and expensive to undo. */}
          <Card accent={broad ? 'danger' : 'accent'}>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('invoicing.target')}
              </AppText>
              <AppText variant="subheading">{t(`invoicing.scope.${effectiveScope}`)}</AppText>
              {targetName() ? (
                <AppText variant="body" color="textMuted">
                  {targetName()}
                </AppText>
              ) : null}
            </View>
          </Card>

          {broad ? (
            <Card accent="danger">
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Warning size={20} color={theme.colors.danger} weight="fill" />
                <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
                  {t('invoicing.wholeMadrasaWarning')}
                </AppText>
              </View>
            </Card>
          ) : null}

          {preview.isPending ? (
            <SkeletonList count={2} />
          ) : preview.isError ? (
            <Card accent="danger">
              <AppText variant="body" color="danger">
                {describeError(preview.error).body}
              </AppText>
            </Card>
          ) : data ? (
            <Card padded={false}>
              <View style={{ paddingHorizontal: theme.spacing.lg }}>
                <ListRow title={t('teacher.feeStructures')} subtitle={structure?.name ?? ''} />
                <Divider />
                <ListRow
                  title={t('invoicing.eligibleStudents')}
                  right={<AppText variant="bodyStrong">{String(data.eligible)}</AppText>}
                />
                <Divider />
                {/* Shown even when zero: the difference between "nobody was
                    skipped" and "we did not check" matters to whoever signs
                    off on the run. */}
                <ListRow
                  title={t('invoicing.alreadyBilled')}
                  right={<AppText variant="bodyStrong">{String(data.alreadyBilled)}</AppText>}
                />
                <Divider />
                <ListRow
                  title={t('invoicing.amountPerStudent')}
                  right={
                    <AppText variant="bodyStrong">
                      {formatMoney(data.amount, data.currency)}
                    </AppText>
                  }
                />
                <Divider />
                <ListRow
                  title={t('invoicing.invoicesToIssue')}
                  right={<AppText variant="bodyStrong">{String(data.toIssue)}</AppText>}
                />
                <Divider />
                <ListRow
                  title={t('parent.dueOn', { date: dueDate })}
                  right={
                    <Badge label={formatMoney(data.total, data.currency)} tone="accent" />
                  }
                />
              </View>
            </Card>
          ) : null}

          {data && data.toIssue === 0 ? (
            <Card>
              <AppText variant="body" color="textMuted">
                {t('invoicing.nothingToIssue')}
              </AppText>
            </Card>
          ) : null}

          {formError ? (
            <AppText variant="caption" color="danger">
              {formError}
            </AppText>
          ) : null}
        </View>
      </Screen>
    );
  }

  // ------------------------------------------------------------------ setup
  const scopeOptions = [
    { value: 'student' as const, label: t('invoicing.scope.student') },
    { value: 'class' as const, label: t('invoicing.scope.class') },
    { value: 'madrasa' as const, label: t('invoicing.scope.madrasa') },
  ];

  return (
    <Screen
      footer={
        <Button
          label={t('invoicing.continueToReview')}
          size="lg"
          disabled={!structureId}
          onPress={toReview}
        />
      }
    >
      <PageHeader title={t('teacher.issueInvoices')} subtitle={t('invoicing.setupBody')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
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
              <SectionHeader title={t('invoicing.chooseFee')} />
              {(structures.data ?? []).map((item: FeeStructure) => {
                const selected = item.id === structureId;
                return (
                  <Card
                    key={item.id}
                    accent={selected ? 'accent' : undefined}
                    onPress={() => {
                      setStructureId(item.id);
                      setScope(null);
                      setStudentId(null);
                      setClassId(null);
                    }}
                    accessibilityLabel={item.name}
                  >
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="subheading">{item.name}</AppText>
                        <AppText variant="caption" color="textMuted">
                          {item.term} · {item.academicYear} · {t(`invoicing.appliesTo.${item.appliesTo}`)}
                        </AppText>
                      </View>
                      <Badge
                        label={formatMoney(item.amount, item.currency)}
                        tone={selected ? 'accent' : 'neutral'}
                      />
                    </View>
                  </Card>
                );
              })}
            </View>

            {structure ? (
              <View style={{ gap: theme.spacing.md }}>
                <SectionHeader title={t('invoicing.chooseTarget')} />

                {fixedScope ? (
                  // The fee itself decides. Offering a choice here would let
                  // the issuer contradict the structure, and the server would
                  // refuse it anyway.
                  <Card>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                      {fixedScope === 'class' ? (
                        <Users size={22} color={theme.colors.accent} weight="duotone" />
                      ) : (
                        <User size={22} color={theme.colors.accent} weight="duotone" />
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="bodyStrong">{t(`invoicing.scope.${fixedScope}`)}</AppText>
                        <AppText variant="caption" color="textMuted">
                          {targetName() || t('invoicing.fixedByFee')}
                        </AppText>
                      </View>
                    </View>
                  </Card>
                ) : (
                  <OptionGroup<BillingScope>
                    options={scopeOptions}
                    value={scope}
                    onChange={(value) => {
                      setScope(value);
                      setStudentId(null);
                      setClassId(null);
                    }}
                    columns={1}
                    error={fieldError(errors['scope'])}
                  />
                )}

                {effectiveScope === 'madrasa' && !fixedScope ? (
                  <Card accent="danger">
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                      <Buildings size={20} color={theme.colors.danger} weight="duotone" />
                      <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                        {t('invoicing.wholeMadrasaWarning')}
                      </AppText>
                    </View>
                  </Card>
                ) : null}

                {effectiveScope === 'class' && !fixedScope ? (
                  <Card padded={false}>
                    <View style={{ paddingHorizontal: theme.spacing.lg }}>
                      {(classes.data ?? []).map((klass, index) => (
                        <View key={klass.id}>
                          {index > 0 ? <Divider /> : null}
                          <ListRow
                            title={klass.name}
                            subtitle={t('invoicing.studentsInClass', { count: klass.studentCount })}
                            right={classId === klass.id ? <Badge label="✓" tone="accent" /> : null}
                            onPress={() => setClassId(klass.id)}
                          />
                        </View>
                      ))}
                    </View>
                  </Card>
                ) : null}

                {effectiveScope === 'student' && !fixedScope ? (
                  students.isPending ? (
                    <SkeletonList count={3} />
                  ) : (
                    <Card padded={false}>
                      <View style={{ paddingHorizontal: theme.spacing.lg }}>
                        {(students.data?.items ?? []).map((pupil, index) => (
                          <View key={pupil.id}>
                            {index > 0 ? <Divider /> : null}
                            {/* Admission number and class alongside the name:
                                two pupils can share a name, and billing the
                                wrong family is not a silent mistake. */}
                            <ListRow
                              title={pupil.fullName}
                              subtitle={`${pupil.admissionNo}${pupil.className ? ` · ${pupil.className}` : ''}`}
                              right={
                                studentId === pupil.id ? <Badge label="✓" tone="accent" /> : null
                              }
                              onPress={() => setStudentId(pupil.id)}
                            />
                          </View>
                        ))}
                      </View>
                    </Card>
                  )
                ) : null}

                {errors['studentId'] || errors['classId'] ? (
                  <AppText variant="caption" color="danger">
                    {fieldError(errors['studentId'] ?? errors['classId'])}
                  </AppText>
                ) : null}
              </View>
            ) : null}

            <TextField
              label={t('parent.dueOn', { date: '' }).trim()}
              value={dueDate}
              onChangeText={setDueDate}
              error={fieldError(errors['dueDate'])}
              hint="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              required
            />
          </>
        )}
      </View>
    </Screen>
  );
}
