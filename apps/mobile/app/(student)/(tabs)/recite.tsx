import { QIRAAH_STYLES, getSurah, type QiraahStyle, type Surah } from '@digital-madrasa/shared';
import { useMutation } from '@tanstack/react-query';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useRouter } from 'expo-router';
import { Microphone, Stop, WarningCircle } from 'phosphor-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { api } from '@/api';
import { SurahPicker } from '@/components/SurahPicker';
import {
  AppText,
  Button,
  Card,
  OptionGroup,
  PageHeader,
  Screen,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDuration } from '@/utils/dates';

type Phase = 'setup' | 'recording' | 'review';

export default function Recite() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();

  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 120);

  const [phase, setPhase] = useState<Phase>('setup');
  const [surah, setSurah] = useState<Surah>(() => getSurah(67)!);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ayahFrom, setAyahFrom] = useState('1');
  const [ayahTo, setAyahTo] = useState('10');
  const [qiraah, setQiraah] = useState<QiraahStyle>('hafs');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedMs, setRecordedMs] = useState(0);

  const from = Number(ayahFrom) || 1;
  const to = Number(ayahTo) || from;
  const rangeValid = from >= 1 && to >= from && to <= surah.ayahCount;

  useEffect(() => {
    // Clamp the range whenever the surah changes, so you can never ask for
    // ayah 200 of a 30-ayah surah.
    setAyahFrom('1');
    setAyahTo(String(Math.min(10, surah.ayahCount)));
  }, [surah]);

  const create = useMutation({
    mutationFn: () =>
      api.createRecitation({
        surahFrom: surah.number,
        ayahFrom: from,
        surahTo: surah.number,
        ayahTo: to,
        qiraahStyle: qiraah,
        durationMs: recordedMs,
        localUri: recordedUri ?? '',
      }),
    onSuccess: (recitation) => {
      resetLocal();
      router.push({ pathname: '/(student)/feedback/[id]', params: { id: recitation.id } });
    },
    onError: (err) => setError(describeError(err).body),
  });

  const resetLocal = () => {
    setPhase('setup');
    setRecordedUri(null);
    setRecordedMs(0);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      setError(t('errors.genericBody'));
    }
  };

  const stopRecording = async () => {
    try {
      const duration = recorderState.durationMillis ?? 0;
      await recorder.stop();
      setRecordedMs(duration);
      setRecordedUri(recorder.uri ?? null);
      setPhase('review');
    } catch {
      setError(t('errors.genericBody'));
      resetLocal();
    }
  };

  const qiraahOptions = useMemo(
    () =>
      QIRAAH_STYLES.slice(0, 3).map((style) => ({
        value: style,
        label: style.charAt(0).toUpperCase() + style.slice(1),
      })),
    [],
  );

  return (
    <Screen>
      <PageHeader title={t('student.recite')} subtitle={t('student.reciteBody')} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        {phase === 'setup' ? (
          <>
            <Card onPress={() => setPickerOpen(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label" color="textMuted" uppercase>
                    {t('student.chooseSurah')}
                  </AppText>
                  <AppText variant="subheading">
                    {surah.number}. {surah.name}
                  </AppText>
                </View>
                <AppText arabic scale={0.8} color="accent">
                  {surah.arabicName}
                </AppText>
              </View>
            </Card>

            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('student.fromAyah')}
                  value={ayahFrom}
                  onChangeText={setAyahFrom}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('student.toAyah')}
                  value={ayahTo}
                  onChangeText={setAyahTo}
                  keyboardType="number-pad"
                  error={rangeValid ? undefined : t('validation.ayah_range_invalid')}
                />
              </View>
            </View>

            <OptionGroup
              label={t('student.qiraah')}
              options={qiraahOptions}
              value={qiraah}
              onChange={setQiraah}
              columns={3}
            />

            {permissionDenied ? (
              <Card accent="warning">
                <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                  <WarningCircle size={22} color={theme.colors.warning} weight="duotone" />
                  <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                    Microphone access is needed to record your recitation. You can turn it on in
                    your device settings.
                  </AppText>
                </View>
              </Card>
            ) : null}

            <Button
              label={t('student.tapToRecord')}
              size="lg"
              disabled={!rangeValid}
              icon={<Microphone size={20} color={theme.colors.textOnAccent} weight="fill" />}
              onPress={() => void startRecording()}
            />
          </>
        ) : null}

        {phase === 'recording' ? (
          <View style={{ alignItems: 'center', gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
            <AppText variant="label" color="danger" uppercase>
              {t('student.recording')}
            </AppText>
            <AppText variant="display">
              {formatDuration(recorderState.durationMillis ?? 0)}
            </AppText>

            <LevelMeter level={recorderState.metering} />

            <AppText variant="body" color="textMuted" align="center">
              {surah.name} · {from}–{to}
            </AppText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('a11y.stopButton')}
              onPress={() => void stopRecording()}
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: theme.colors.dangerSoft,
                borderWidth: 2,
                borderColor: theme.colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Stop size={32} color={theme.colors.danger} weight="fill" />
            </Pressable>
          </View>
        ) : null}

        {phase === 'review' ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="subheading">
                  {surah.name} · {from}–{to}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {formatDuration(recordedMs)} · {qiraah}
                </AppText>
              </View>
            </Card>

            {error ? (
              <AppText variant="caption" color="danger">
                {error}
              </AppText>
            ) : null}

            <Button
              label={t('student.submitToTeacher')}
              size="lg"
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
            <Button
              label={t('student.recordAgain')}
              variant="secondary"
              onPress={resetLocal}
            />
          </View>
        ) : null}
      </View>

      <SurahPicker
        visible={pickerOpen}
        selected={surah.number}
        onClose={() => setPickerOpen(false)}
        onSelect={setSurah}
      />
    </Screen>
  );
}

/**
 * Live input level. When the platform doesn't report metering we show a
 * steady "listening" bar rather than inventing movement that isn't real.
 */
function LevelMeter({ level }: { level: number | undefined }) {
  const theme = useTheme();
  const bars = 24;

  // Metering is dBFS: roughly -60 (silence) to 0 (clipping).
  const normalised =
    level === undefined ? null : Math.max(0, Math.min(1, (level + 60) / 60));

  return (
    <View
      accessibilityElementsHidden
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 56 }}
    >
      {Array.from({ length: bars }, (_, index) => {
        const centre = Math.abs(index - bars / 2) / (bars / 2);
        const height =
          normalised === null ? 10 : Math.max(6, normalised * 52 * (1 - centre * 0.7));
        return (
          <View
            key={index}
            style={{
              width: 4,
              height,
              borderRadius: 2,
              backgroundColor: normalised === null ? theme.colors.border : theme.colors.accent,
            }}
          />
        );
      })}
    </View>
  );
}
