import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { PaymentReceipt } from '@/components/payments/PaymentReceipt';
import { EmptyState, PageHeader, Screen, SkeletonList } from '@/components/ui';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/** A past payment's receipt; the same screen for parents and staff. */
export function ReceiptScreen({ scope }: { scope: 'parent' | 'madrasa' }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const payments = useQuery({ queryKey: qk.payments({ scope }), queryFn: () => api.listPayments({}) });
  const invoices = useQuery({ queryKey: qk.invoices({ scope }), queryFn: () => api.listInvoices({}) });
  const payment = (payments.data ?? []).find((p) => p.id === id);

  return (
    <Screen>
      <PageHeader title={t('receipt.title')} showBack />
      <View style={{ marginTop: theme.spacing.lg }}>
        {payments.isPending || invoices.isPending ? (
          <SkeletonList count={3} />
        ) : !payment ? (
          <EmptyState title={t('receipt.notFound')} body={t('receipt.notFoundBody')} />
        ) : (
          <PaymentReceipt payment={payment} invoices={invoices.data ?? []} madrasaName={session.madrasa?.name ?? ''} />
        )}
      </View>
    </Screen>
  );
}
