import { getSurah, teacherInsights, type Insight } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Lightbulb, Star } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { api } from '@/api';
import { AppText, Card, Divider, SectionHeader } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The teacher's co-pilot: this week's pupils worth a word, worked out from
 * attendance, memorisation and recitation scores (`teacherInsights`). Each
 * line opens that pupil's page.
 */
export function InsightsCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [all, setAll] = useState(false);

  const signals = useQuery({ queryKey: ['teacher-signals'], queryFn: () => api.getTeacherSignals() });
  const insights = useMemo(() => teacherInsights(signals.data ?? [], new Date()), [signals.data]);

  if (!signals.data) return null;

  const sentence = (i: Insight) =>
    t(`insights.${i.kind}`, {
      name: i.name,
      ...i.values,
      surah: i.values.surah ? getSurah(i.values.surah)?.name : undefined,
    });

  const shown = [...insights.concerns.slice(0, all ? 50 : 4), ...insights.praise.slice(0, all ? 50 : 2)];
  const hidden = insights.concerns.length + insights.praise.length - shown.length;

  return (
    <View>
      <SectionHeader title={t('insights.title')} />
      <Card>
        {shown.length === 0 ? (
          <AppText variant="body" color="textMuted">
            {t('insights.allWell')}
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {shown.map((i, index) => (
              <View key={`${i.kind}-${i.studentId}`}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(teacher)/student/[id]', params: { id: i.studentId } })}
                  style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}
                >
                  {i.tone === 'concern' ? (
                    <Lightbulb size={20} color={theme.colors.warning} weight="duotone" />
                  ) : (
                    <Star size={20} color={theme.colors.success} weight="duotone" />
                  )}
                  <AppText variant="body" style={{ flex: 1 }}>
                    {sentence(i)}
                  </AppText>
                </Pressable>
              </View>
            ))}
            {hidden > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => setAll(true)}>
                <AppText variant="label" color="accent">
                  {t('insights.more', { count: hidden })}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        )}
      </Card>
    </View>
  );
}
