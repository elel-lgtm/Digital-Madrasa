import type { InvoiceStatus } from '@digital-madrasa/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui';

const TONE: Record<InvoiceStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  paid: 'success',
  partially_paid: 'info',
  issued: 'warning',
  overdue: 'danger',
  draft: 'neutral',
  void: 'neutral',
};

const LABEL_KEY: Record<InvoiceStatus, string> = {
  paid: 'fees.paid',
  partially_paid: 'fees.partiallyPaid',
  issued: 'fees.issued',
  overdue: 'fees.overdue',
  draft: 'fees.draft',
  void: 'fees.void',
};

/** One chip for invoice state, so "overdue" always looks the same everywhere. */
export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation();
  return <Badge label={t(LABEL_KEY[status])} tone={TONE[status]} />;
}
