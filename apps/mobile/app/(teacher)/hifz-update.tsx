import {
  HIFZ_STATUSES,
  MEMORISED_STATUSES,
  getSurah,
  updateHifzProgressSchema,
  type HifzStatus,
  type Surah,
} from '@digital-madrasa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { SurahPicker } from '@/components/SurahPicker';
import {
  AppText,
  Button,
  Card,
  ListRow,
  OptionGroup,
  PageHeader,
  Screen,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Staff record where a student has reached in one surah.
 *
 * A row per surah: memorised, revising and mastered cover the whole surah,
 * learning covers ayahs 1 to the one entered. The same rule drives every
 * total shown to the student and parent (packages/shared/src/hifz.ts).
 */
export default function HifzUpdate() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ studentId: string; surahNo?: string; name?: string }>();

  const [surah, setSurah] = useState<Surah | undefined>(
    params.surahNo ? getSurah(Number(params.surahNo)) : undefined,
  );
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState<HifzStatus>('learning');
  const [ayah, setAyah] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);

  const whole = MEMORISED_STATUSES.includes(status);

  const save = useMutation({
    mutationFn: api.upsertHifzProgress,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.student(params.studentId ?? '') });
      void queryClient.invalidateQueries({ queryKey: qk.hifz(params.studentId ?? '') });
      void queryClient.invalidateQueries({ queryKey: qk.childOverview(params.studentId ?? '') });
      // Opened by a link there is nothing to go back to; land on the pupil.
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/(teacher)/student/[id]', params: { id: params.studentId ?? '' } });
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const submit = () => {
    setFormError(null);
    if (!surah) {
      setFormError(t('learning.chooseSurah'));
      return;
    }
    const parsed = updateHifzProgressSchema.safeParse({
      studentId: params.studentId,
      surahNo: surah.number,
      ayahNo: whole ? surah.ayahCount : Math.min(Number(ayah) || 1, surah.ayahCount),
      status,
    });
    if (!parsed.success) {
      setFormError(t('validation.ayah_range_invalid'));
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          <Button label={t('learning.saveProgress')} size="lg" loading={save.isPending} onPress={submit} />
        }
      >
        <PageHeader
          title={t('learning.updateMemorisation')}
          subtitle={params.name ?? undefined}
          showBack
        />

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title={surah ? `${surah.number}. ${surah.name}` : t('learning.chooseSurah')}
                subtitle={surah ? `${surah.arabicName} · ${surah.ayahCount} ayahs` : t('learning.surah')}
                onPress={() => setPicking(true)}
              />
            </View>
          </Card>

          <OptionGroup
            label={t('learning.status')}
            options={HIFZ_STATUSES.map((value) => ({ value, label: t(`learning.status_${value}`) }))}
            value={status}
            onChange={setStatus}
          />

          {whole ? (
            <AppText variant="caption" color="textMuted">
              {t('learning.wholeSurahNote')}
            </AppText>
          ) : status === 'learning' ? (
            <TextField
              label={t('learning.upToAyah')}
              value={ayah}
              onChangeText={setAyah}
              keyboardType="number-pad"
              hint={surah ? `1–${surah.ayahCount}` : undefined}
            />
          ) : null}

          {formError ? (
            <AppText variant="caption" color="danger">
              {formError}
            </AppText>
          ) : null}
        </View>

        <SurahPicker
          visible={picking}
          selected={surah?.number}
          onClose={() => setPicking(false)}
          onSelect={(chosen) => {
            setSurah(chosen);
            setPicking(false);
          }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
