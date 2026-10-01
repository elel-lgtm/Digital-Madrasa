import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AuditList } from '@/components/AdminAudit';
import { ErrorState, PageHeader, Screen, SkeletonList } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/** The platform-wide audit trail, newest first. Append-only at the source. */
export default function AdminAuditLog() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describe = useApiError();
  const audit = useQuery({ queryKey: qk.adminAudit(), queryFn: () => api.listAdminAudit({}) });

  return (
    <Screen refreshing={audit.isRefetching} onRefresh={() => void audit.refetch()}>
      <PageHeader title={t('admin.nav.audit')} subtitle={t('admin.auditSubtitle')} />
      <View style={{ marginTop: theme.spacing.lg, maxWidth: 1100 }}>
        {audit.isPending ? (
          <SkeletonList count={6} />
        ) : audit.isError ? (
          <ErrorState
            title={describe(audit.error).title}
            body={describe(audit.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void audit.refetch()}
          />
        ) : (
          <AuditList entries={audit.data} />
        )}
      </View>
    </Screen>
  );
}
