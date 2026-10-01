import { formatMoney, type MadrasaStatus } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  PageHeader,
  Screen,
  Segmented,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { STATUS_TONE } from '@/components/AdminAudit';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Filter = 'all' | MadrasaStatus;

/** Every school on the platform, searchable, with its standing at a glance. */
export default function AdminMadrasas() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describe = useApiError();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const list = useQuery({ queryKey: qk.adminMadrasas(), queryFn: () => api.listAdminMadrasas() });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (list.data ?? []).filter(
      (m) =>
        (filter === 'all' || m.status === filter) &&
        (!needle ||
          [m.name, m.town, m.county, m.ownerName ?? '', m.ownerEmail ?? ''].some((v) =>
            v.toLowerCase().includes(needle),
          )),
    );
  }, [list.data, search, filter]);

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <PageHeader title={t('admin.madrasas')} subtitle={t('admin.madrasasSubtitle')} />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg, maxWidth: 1100 }}>
        <TextField label={t('admin.search')} value={search} onChangeText={setSearch} placeholder={t('admin.searchHint')} />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('admin.all') },
            { value: 'active', label: t('admin.status.active') },
            { value: 'suspended', label: t('admin.status.suspended') },
            { value: 'pending_deletion', label: t('admin.status.pending_deletion') },
          ]}
        />
        {list.isPending ? (
          <SkeletonList count={5} />
        ) : list.isError ? (
          <ErrorState
            title={describe(list.error).title}
            body={describe(list.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void list.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('admin.noMadrasas')} body={t('admin.noMadrasasBody')} />
        ) : (
          <Card padded={false}>
            {rows.map((m, index) => (
              <View key={m.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  title={m.name}
                  subtitle={`${m.town}, ${m.county} · ${t('admin.counts', { students: m.students, teachers: m.teachers })}`}
                  meta={m.feesOutstanding > 0 ? t('admin.outstanding', { amount: formatMoney(m.feesOutstanding) }) : undefined}
                  right={<Badge label={t(`admin.status.${m.status}`)} tone={STATUS_TONE[m.status]} />}
                  showChevron
                  onPress={() => router.push(`/(admin)/madrasa/${m.id}`)}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
