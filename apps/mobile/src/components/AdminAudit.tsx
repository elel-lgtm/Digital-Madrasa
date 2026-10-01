import type { AdminAuditEntry, MadrasaStatus } from '@digital-madrasa/shared';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText, Card, Divider, EmptyState } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export const STATUS_TONE: Record<MadrasaStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  pending_deletion: 'danger',
  deleted: 'neutral',
};

/**
 * The audit trail as the admin console shows it: who, what, where, when, and
 * the written reason for lifecycle actions. Row images are never shown — the
 * server does not send them (migration 0026).
 */
export function AuditList({ entries, showMadrasa = true }: { entries: AdminAuditEntry[]; showMadrasa?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (entries.length === 0) {
    return <EmptyState title={t('admin.noAudit')} body={t('admin.noAuditBody')} />;
  }

  return (
    <Card padded={false}>
      {entries.map((e, index) => (
        <View key={e.id} style={{ paddingHorizontal: theme.spacing.lg }}>
          {index > 0 ? <Divider /> : null}
          <View style={{ paddingVertical: theme.spacing.md, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
              <AppText variant="bodyStrong" style={{ flex: 1 }}>
                {e.action}
              </AppText>
              <AppText variant="caption" color="textSubtle">
                {new Date(e.createdAt).toLocaleString()}
              </AppText>
            </View>
            <AppText variant="caption" color="textMuted">
              {[e.actorName, e.actorRole, showMadrasa ? e.madrasaName : null].filter(Boolean).join(' · ')}
            </AppText>
            {e.reason ? (
              <AppText variant="caption" color="text">
                {t('admin.reasonLabel', { reason: e.reason })}
              </AppText>
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
