import type { PaymentStatus } from '@digital-madrasa/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui';

const TONE: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  success: 'success',
  pending: 'warning',
  initiated: 'warning',
  failed: 'danger',
  reversed: 'neutral',
};

/** A payment's state in a list. Words carry the meaning, not only colour. */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  return <Badge label={t(`receipt.status_${status}`)} tone={TONE[status] ?? 'neutral'} />;
}
