import { summariseHeatmap, type HeatmapAyah } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { api } from '@/api';
import { AppText, Badge, Card, EmptyState, ErrorState, PageHeader, ProgressBar, Screen, Segmented, SkeletonList } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Period = '30' | '90' | '365';

/**
 * The madrasa's tajweed mistake map. Every assessed recitation's findings,
 * counted per ayah: the darker a square, the more pupils slip there. Tap a
 * square for the rules behind it. Dismissed findings and recordings that were
 * not assessed are left out (migration 0031).
 */
export default function MistakeMapScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const [period, setPeriod] = useState<Period>('90');
  const [rule, setRule] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ surahNo: number; ayah: HeatmapAyah } | null>(null);

  const map = useQuery({
    queryKey: ['tajweed-heatmap', period],
    queryFn: () => api.getTajweedHeatmap(Number(period)),
  });
  const summary = useMemo(() => summariseHeatmap(map.data ?? [], rule), [map.data, rule]);

  // One colour at three strengths, so "more" always reads as "darker red"
  // in light and dark themes alike. Tokens are #RRGGBB; the suffix is alpha.
  const LEVELS = ['55', 'AA', ''];
  const level = (count: number) => Math.min(2, Math.floor((count / Math.max(summary.maxPerAyah, 1)) * 3 - 0.0001));
  const shade = (count: number) =>
    count === 0 ? theme.colors.surfaceAlt : `${theme.colors.danger}${LEVELS[Math.max(0, level(count))]}`;

  return (
    <Screen>
      <PageHeader title={t('heatmap.title')} subtitle={t('heatmap.subtitle')} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Segmented<Period>
          options={[
            { value: '30', label: t('heatmap.days', { count: 30 }) },
            { value: '90', label: t('heatmap.days', { count: 90 }) },
            { value: '365', label: t('heatmap.year') },
          ]}
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setSelected(null);
          }}
        />

        {map.isPending ? (
          <SkeletonList count={3} />
        ) : map.isError ? (
          <ErrorState
            title={describeError(map.error).title}
            body={describeError(map.error).body}
            retryLabel={t('common.retry')}
            onRetry={() => void map.refetch()}
          />
        ) : summary.rules.length === 0 ? (
          <EmptyState title={t('heatmap.emptyTitle')} body={t('heatmap.emptyBody')} />
        ) : (
          <>
            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="label" color="textMuted" uppercase>
                  {t('heatmap.commonRules')}
                </AppText>
                {summary.rules.slice(0, 5).map((r) => (
                  <Pressable
                    key={r.rule}
                    accessibilityRole="button"
                    accessibilityState={{ selected: rule === r.rule }}
                    onPress={() => {
                      setRule(rule === r.rule ? null : r.rule);
                      setSelected(null);
                    }}
                    style={{ gap: 4, opacity: rule && rule !== r.rule ? 0.45 : 1 }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="body">{r.rule.toUpperCase()}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {t('heatmap.mistakes', { count: r.mistakes })}
                      </AppText>
                    </View>
                    <ProgressBar value={r.mistakes} max={summary.rules[0]?.mistakes ?? 1} tone="warning" />
                  </Pressable>
                ))}
                <AppText variant="caption" color="textSubtle">
                  {rule ? t('heatmap.filtered', { rule: rule.toUpperCase() }) : t('heatmap.tapRule')}
                </AppText>
              </View>
            </Card>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant="caption" color="textMuted">
                {t('heatmap.fewer')}
              </AppText>
              {[0, ...LEVELS.map((_, i) => i + 1)].map((i) => (
                <View
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    backgroundColor: i === 0 ? theme.colors.surfaceAlt : `${theme.colors.danger}${LEVELS[i - 1]}`,
                  }}
                />
              ))}
              <AppText variant="caption" color="textMuted">
                {t('heatmap.more')}
              </AppText>
            </View>

            {summary.surahs.slice(0, 12).map((s) => (
              <Card key={s.surahNo}>
                <View style={{ gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="subheading">
                      {s.surahNo}. {s.surahName}
                    </AppText>
                    <Badge label={t('heatmap.mistakes', { count: s.mistakes })} tone="warning" />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {Array.from({ length: s.ayahCount }, (_, i) => {
                      const ayah = s.ayahs.find((a) => a.ayahNo === i + 1);
                      const count = ayah?.mistakes ?? 0;
                      const isSelected = selected?.surahNo === s.surahNo && selected.ayah.ayahNo === i + 1;
                      return (
                        <Pressable
                          key={i}
                          disabled={!ayah}
                          accessibilityLabel={`${s.surahName} ${i + 1}: ${t('heatmap.mistakes', { count })}`}
                          onPress={() => ayah && setSelected(isSelected ? null : { surahNo: s.surahNo, ayah })}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 5,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: shade(count),
                            borderWidth: isSelected ? 2 : 0,
                            borderColor: theme.colors.text,
                          }}
                        >
                          <AppText variant="caption" style={{ fontSize: 10 }} color={count > 0 ? 'text' : 'textSubtle'}>
                            {i + 1}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {selected?.surahNo === s.surahNo ? (
                    <View style={{ gap: 2, paddingTop: theme.spacing.xs }}>
                      <AppText variant="label">
                        {t('heatmap.ayah', { surah: s.surahName, ayah: selected.ayah.ayahNo })}
                      </AppText>
                      {selected.ayah.rules.map((r) => (
                        <AppText key={r.rule} variant="body" color="textMuted">
                          • {r.rule.toUpperCase()} — {t('heatmap.mistakes', { count: r.mistakes })},{' '}
                          {t('heatmap.pupils', { count: r.students })}
                        </AppText>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Card>
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}
