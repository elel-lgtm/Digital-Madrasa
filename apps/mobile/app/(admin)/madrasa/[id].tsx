import {
  formatMoney,
  madrasaLifecycleSchema,
  type AdminMadrasa,
  type MadrasaLifecycleAction,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AuditList, STATUS_TONE } from '@/components/AdminAudit';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonList,
  StatTile,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/** What can be done next from each status. Mirrors the lifecycle function. */
const NEXT: Record<AdminMadrasa['status'], MadrasaLifecycleAction[]> = {
  active: ['suspend', 'schedule_deletion'],
  suspended: ['reinstate', 'schedule_deletion'],
  pending_deletion: ['reinstate', 'purge'],
  deleted: [],
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

export default function AdminMadrasaDetail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describe = useApiError();
  const client = useQueryClient();
  const { id = '' } = useLocalSearchParams<{ id: string }>();

  const list = useQuery({ queryKey: qk.adminMadrasas(), queryFn: () => api.listAdminMadrasas() });
  const audit = useQuery({ queryKey: qk.adminAudit(id), queryFn: () => api.listAdminAudit({ madrasaId: id }) });
  const m = list.data?.find((row) => row.id === id);

  const [action, setAction] = useState<MadrasaLifecycleAction | null>(null);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; confirmName?: string; form?: string }>({});
  const [done, setDone] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: api.changeMadrasaStatus,
    onSuccess: (result) => {
      setDone(t('admin.changed', { status: t(`admin.status.${result.status}`) }));
      setAction(null);
      setReason('');
      setConfirmName('');
      void client.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => setErrors({ form: describe(error).body }),
  });

  const start = (next: MadrasaLifecycleAction) => {
    setAction(next);
    setErrors({});
    setDone(null);
  };

  const submit = () => {
    if (!action || !m) return;
    const parsed = madrasaLifecycleSchema.safeParse({
      madrasaId: m.id,
      action,
      reason: reason.trim() || undefined,
      confirmName: confirmName.trim() || undefined,
    });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as 'reason' | 'confirmName';
        next[key] = t(issue.message);
      }
      setErrors(next);
      return;
    }
    // The server checks the typed name too; this only spares a round trip.
    if (action === 'purge' && parsed.data.confirmName !== m.name) {
      setErrors({ confirmName: t('admin.confirmMismatch') });
      return;
    }
    change.mutate(parsed.data);
  };

  return (
    <Screen>
      <PageHeader title={m?.name ?? t('admin.madrasa')} subtitle={m ? `${m.town}, ${m.county}` : undefined} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl, maxWidth: 1100 }}>
        {list.isPending ? (
          <SkeletonList count={4} />
        ) : list.isError ? (
          <ErrorState
            title={describe(list.error).title}
            body={describe(list.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void list.refetch()}
          />
        ) : !m ? (
          <EmptyState title={t('admin.notFound')} body={t('admin.notFoundBody')} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <Badge label={t(`admin.status.${m.status}`)} tone={STATUS_TONE[m.status]} />
              {m.subscriptionStatus ? (
                <Badge label={`${t('admin.subscription')}: ${t(`billing.status.${m.subscriptionStatus}`, { defaultValue: m.subscriptionStatus })}`} tone="neutral" />
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
              <View style={{ flexGrow: 1, flexBasis: 160 }}><StatTile label={t('admin.students')} value={String(m.students)} /></View>
              <View style={{ flexGrow: 1, flexBasis: 160 }}><StatTile label={t('admin.teachers')} value={String(m.teachers)} /></View>
              <View style={{ flexGrow: 1, flexBasis: 160 }}><StatTile label={t('admin.linkedParents')} value={String(m.parents)} /></View>
              <View style={{ flexGrow: 1, flexBasis: 160 }}>
                <StatTile label={t('admin.feesOutstanding')} value={formatMoney(m.feesOutstanding)} tone={m.feesOutstanding ? 'warning' : 'neutral'} />
              </View>
            </View>

            <View>
              <SectionHeader title={t('admin.details')} />
              <Card>
                <View style={{ gap: theme.spacing.sm }}>
                  {[
                    [t('admin.owner'), [m.ownerName, m.ownerEmail].filter(Boolean).join(' · ') || '—'],
                    [t('admin.phone'), m.contactPhone],
                    [t('admin.joined'), fmtDate(m.createdAt)],
                    [t('admin.trialEnds'), fmtDate(m.trialEndsAt)],
                    [t('admin.paidUntil'), fmtDate(m.currentPeriodEnd)],
                    [t('admin.lastActivity'), fmtDate(m.lastActivityAt)],
                    ...(m.deletionScheduledAt ? [[t('admin.deletionScheduled'), fmtDate(m.deletionScheduledAt)]] : []),
                    ...(m.deletionReason ? [[t('admin.deletionReason'), m.deletionReason]] : []),
                  ].map(([label, value]) => (
                    <View key={label} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                      <AppText variant="caption" color="textMuted" style={{ width: 150 }}>{label}</AppText>
                      <AppText variant="body" style={{ flex: 1 }}>{value}</AppText>
                    </View>
                  ))}
                </View>
              </Card>
            </View>

            <View>
              <SectionHeader title={t('admin.actions')} />
              <Card accent={action === 'purge' || action === 'schedule_deletion' ? 'danger' : undefined}>
                <View style={{ gap: theme.spacing.md }}>
                  {done ? <AppText color="success">{done}</AppText> : null}
                  {NEXT[m.status].length === 0 ? (
                    <AppText color="textMuted">{t('admin.noActions')}</AppText>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                      {NEXT[m.status].map((next) => (
                        <Button
                          key={next}
                          label={t(`admin.action.${next}`)}
                          variant={next === 'purge' || next === 'schedule_deletion' ? 'danger' : next === action ? 'primary' : 'secondary'}
                          fullWidth={false}
                          onPress={() => start(next)}
                        />
                      ))}
                    </View>
                  )}

                  {action ? (
                    <View style={{ gap: theme.spacing.md }}>
                      <AppText color="textMuted">{t(`admin.explain.${action}`)}</AppText>
                      {action !== 'reinstate' ? (
                        <TextField
                          label={t('admin.reason')}
                          value={reason}
                          onChangeText={setReason}
                          error={errors.reason}
                          hint={t('admin.reasonHint')}
                          multiline
                        />
                      ) : null}
                      {action === 'purge' ? (
                        <TextField
                          label={t('admin.typeName', { name: m.name })}
                          value={confirmName}
                          onChangeText={setConfirmName}
                          error={errors.confirmName}
                          autoCapitalize="none"
                        />
                      ) : null}
                      {errors.form ? <AppText color="danger">{errors.form}</AppText> : null}
                      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                        <Button
                          label={t(`admin.confirm.${action}`)}
                          variant={action === 'reinstate' || action === 'suspend' ? 'primary' : 'danger'}
                          fullWidth={false}
                          loading={change.isPending}
                          onPress={submit}
                        />
                        <Button label={t('common.cancel')} variant="ghost" fullWidth={false} onPress={() => setAction(null)} />
                      </View>
                    </View>
                  ) : null}
                </View>
              </Card>
            </View>

            <View>
              <SectionHeader title={t('admin.nav.audit')} />
              {audit.isPending ? <SkeletonList count={3} /> : <AuditList entries={audit.data ?? []} showMadrasa={false} />}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
