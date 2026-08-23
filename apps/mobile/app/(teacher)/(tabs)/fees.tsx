import { formatMoney, type Invoice } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Plus, Receipt } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { InvoiceStatusChip } from '@/components/InvoiceStatusChip';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
  Segmented,
  SkeletonList,
  StatTile,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Filter = 'all' | 'overdue' | 'issued' | 'paid';

export default function FeesTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const [filter, setFilter] = useState<Filter>('all');

  const summary = useQuery({ queryKey: qk.feesSummary(), queryFn: () => api.getFeesSummary() });
  const invoices = useQuery({
    queryKey: qk.invoices({ scope: 'madrasa' }),
    queryFn: () => api.listInvoices({}),
  });

  const filtered: Invoice[] = (invoices.data ?? []).filter((invoice) => {
    if (filter === 'all') return true;
    if (filter === 'issued') return invoice.status === 'issued' || invoice.status === 'partially_paid';
    return invoice.status === filter;
  });

  return (
    <Screen
      refreshing={invoices.isFetching}
      onRefresh={() => {
        void invoices.refetch();
        void summary.refetch();
      }}
    >
      <PageHeader title={t('nav.fees')} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <StatTile
            label={t('teacher.collected')}
            value={summary.data ? formatMoney(summary.data.collected) : '—'}
            tone="success"
          />
          <StatTile
            label={t('teacher.outstanding')}
            value={summary.data ? formatMoney(summary.data.outstanding) : '—'}
            caption={
              summary.data ? t('fees.overdue') + ': ' + summary.data.overdueCount : undefined
            }
            tone={summary.data && summary.data.outstanding > 0 ? 'danger' : 'neutral'}
          />
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Button
            label={t('teacher.createFeeStructure')}
            variant="secondary"
            icon={<Plus size={18} color={theme.colors.text} weight="bold" />}
            onPress={() => router.push('/(teacher)/fee-structure-new')}
          />
          <Button
            label={t('teacher.issueInvoices')}
            variant="secondary"
            icon={<Receipt size={18} color={theme.colors.text} />}
            onPress={() => router.push('/(teacher)/issue-invoices')}
          />
        </View>

        <View>
          <SectionHeader title={t('parent.invoices')} />
          <Segmented
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'overdue', label: t('fees.overdue') },
              { value: 'issued', label: t('fees.issued') },
              { value: 'paid', label: t('fees.paid') },
            ]}
            value={filter}
            onChange={setFilter}
          />

          <View style={{ marginTop: theme.spacing.md }}>
            {invoices.isPending ? (
              <SkeletonList count={4} />
            ) : invoices.isError ? (
              <ErrorState
                {...describeError(invoices.error)}
                retryLabel={t('common.retry')}
                onRetry={() => void invoices.refetch()}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Receipt size={40} color={theme.colors.textSubtle} weight="duotone" />}
                title={t('empty.noInvoices')}
                body={t('empty.noInvoicesBody')}
              />
            ) : (
              <Card padded={false}>
                {filtered.map((invoice, index) => (
                  <View key={invoice.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={invoice.studentName}
                      subtitle={`${invoice.description} · ${invoice.invoiceNo}`}
                      showChevron={false}
                      right={
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <AppText variant="bodyStrong">
                            {formatMoney(invoice.amountDue - invoice.amountPaid, invoice.currency)}
                          </AppText>
                          <InvoiceStatusChip status={invoice.status} />
                        </View>
                      }
                    />
                  </View>
                ))}
              </Card>
            )}
          </View>
        </View>
      </View>
    </Screen>
  );
}
