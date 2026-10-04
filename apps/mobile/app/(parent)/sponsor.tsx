import { formatMoney } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { HandHeart } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { AppText, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Screen, SkeletonList } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Sponsor a pupil (sadaqah). Each card is a pupil whose guardian agreed to be
 * listed, described without a name or photo. A sponsorship pays that pupil's
 * next unpaid invoice; the family is told a sponsor paid, never who.
 */
export default function SponsorScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const pupils = useQuery({ queryKey: ['sponsorable'], queryFn: () => api.listSponsorable() });

  return (
    <Screen>
      <PageHeader title={t('sponsor.title')} subtitle={t('sponsor.subtitle')} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card accent="accent">
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <HandHeart size={28} color={theme.colors.accent} weight="duotone" />
            <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
              {t('sponsor.intro')}
            </AppText>
          </View>
        </Card>

        {pupils.isPending ? (
          <SkeletonList count={3} />
        ) : pupils.isError ? (
          <ErrorState
            title={describeError(pupils.error).title}
            body={describeError(pupils.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void pupils.refetch()}
          />
        ) : (pupils.data ?? []).length === 0 ? (
          <EmptyState title={t('sponsor.emptyTitle')} body={t('sponsor.emptyBody')} />
        ) : (
          (pupils.data ?? []).map((p) => (
            <Card key={p.studentId}>
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="subheading">
                  {t(p.gender === 'female' ? 'sponsor.girl' : 'sponsor.boy', { klass: p.className ?? t('sponsor.aClass') })}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {p.madrasaName} · {p.town}
                </AppText>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                  <Badge label={t('sponsor.memorised', { count: p.memorised })} tone="success" />
                  <Badge label={t('sponsor.needs', { amount: formatMoney(p.needed) })} tone="warning" />
                </View>
                {p.note ? (
                  <AppText variant="body" style={{ fontStyle: 'italic' }}>
                    “{p.note}”
                  </AppText>
                ) : null}
                <Button
                  label={t('sponsor.pay', { amount: formatMoney(p.invoiceOwed) })}
                  onPress={() => router.push({ pathname: '/(parent)/pay', params: { sponsor: p.studentId } })}
                />
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
