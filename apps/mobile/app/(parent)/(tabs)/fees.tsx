import { daysBetween, formatMoney } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Receipt } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { InvoiceStatusChip } from '@/components/InvoiceStatusChip';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate, shortDate } from '@/utils/dates';

export default function ParentFees() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const balances = useQuery({
    queryKey: qk.childBalances(),
    queryFn: () => api.getChildBalances(),
  });
  const invoices = useQuery({
    queryKey: qk.invoices({ scope: 'parent' }),
    queryFn: () => api.listInvoices({}),
  });
  const payments = useQuery({
    queryKey: qk.payments({ scope: 'parent' }),
    queryFn: () => api.listPayments({}),
  });

  const totalOutstanding = (balances.data ?? []).reduce((sum, b) => sum + b.outstanding, 0);
  const unpaid = (invoices.data ?? []).filter(
    (invoice) => invoice.status !== 'paid' && invoice.status !== 'void',
  );

  const refresh = () => {
    void balances.refetch();
    void invoices.refetch();
    void payments.refetch();
  };

  if (invoices.isError) {
    return (
      <Screen>
        <PageHeader title={t('parent.fees')} />
        <ErrorState
          {...describeError(invoices.error)}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen refreshing={invoices.isFetching} onRefresh={refresh}>
      <PageHeader title={t('parent.fees')} />

      {invoices.isPending || balances.isPending ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
          <Card accent={totalOutstanding > 0 ? 'danger' : 'success'}>
            <View style={{ gap: theme.spacing.md }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('parent.balance')}
              </AppText>
              <AppText variant="display" color={totalOutstanding > 0 ? 'danger' : 'success'}>
                {formatMoney(totalOutstanding)}
              </AppText>

              {(balances.data ?? []).length > 1 ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {(balances.data ?? []).map((balance) => (
                    <View
                      key={balance.studentId}
                      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                    >
                      <AppText variant="caption" color="textMuted">
                        {balance.studentName}
                      </AppText>
                      <AppText variant="caption">{formatMoney(balance.outstanding)}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}

              {totalOutstanding > 0 ? (
                <Button
                  label={
                    (balances.data ?? []).length > 1
                      ? t('parent.payAll')
                      : t('parent.payWithMpesa')
                  }
                  onPress={() =>
                    router.push({
                      pathname: '/(parent)/pay',
                      params: { invoiceIds: unpaid.map((i) => i.id).join(',') },
                    })
                  }
                />
              ) : (
                <AppText variant="body" color="success">
                  {t('parent.allSettled')}
                </AppText>
              )}
            </View>
          </Card>

          <View>
            <SectionHeader title={t('parent.invoices')} />
            {(invoices.data ?? []).length === 0 ? (
              <EmptyState
                icon={<Receipt size={40} color={theme.colors.textSubtle} weight="duotone" />}
                title={t('empty.noInvoices')}
                body={t('empty.noInvoicesBody')}
              />
            ) : (
              <View style={{ gap: theme.spacing.md }}>
                {(invoices.data ?? []).map((invoice) => {
                  const remaining = invoice.amountDue - invoice.amountPaid;
                  const days = daysBetween(new Date(), invoice.dueDate);
                  const dueLabel =
                    invoice.status === 'paid'
                      ? longDate(invoice.dueDate)
                      : days < 0
                        ? t('parent.overdueBy', { count: Math.abs(days) })
                        : t('parent.dueInDays', { count: days });

                  return (
                    <Card
                      key={invoice.id}
                      accent={invoice.status === 'overdue' ? 'danger' : undefined}
                    >
                      <View style={{ gap: theme.spacing.md }}>
                        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <AppText variant="subheading">{invoice.description}</AppText>
                            <AppText variant="caption" color="textMuted">
                              {invoice.studentName} · {invoice.invoiceNo}
                            </AppText>
                          </View>
                          <InvoiceStatusChip status={invoice.status} />
                        </View>

                        <View
                          style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                        >
                          <AppText variant="caption" color="textMuted">
                            {dueLabel}
                          </AppText>
                          <AppText variant="bodyStrong">
                            {formatMoney(remaining, invoice.currency)}
                          </AppText>
                        </View>

                        {remaining > 0 ? (
                          <Button
                            label={t('parent.payNow')}
                            variant="secondary"
                            onPress={() =>
                              router.push({
                                pathname: '/(parent)/pay',
                                params: { invoiceIds: invoice.id },
                              })
                            }
                          />
                        ) : null}
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>

          {(payments.data ?? []).length > 0 ? (
            <View>
              <SectionHeader title={t('parent.paymentHistory')} />
              <Card padded={false}>
                {(payments.data ?? []).slice(0, 8).map((payment, index) => (
                  <View key={payment.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={formatMoney(payment.amount, payment.currency)}
                      subtitle={`${t(`fees.method_${payment.method}`)} · ${shortDate(payment.createdAt)}`}
                      right={
                        payment.receiptNo ? <Badge label={payment.receiptNo} tone="success" /> : null
                      }
                      showChevron={false}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
