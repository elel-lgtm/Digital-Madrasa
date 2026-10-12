import {
  MASTER_AUDIO_CREDIT,
  getSurah,
  masterAyahUrl,
  passageAyahs,
  recitersFor,
  type MasterReciter,
  type QiraahStyle,
} from '@digital-madrasa/shared';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Play, SpeakerHigh, Stop } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { AppText, Button, Card, Segmented } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/*
 * One master-reciter player for the whole app, so starting a passage on one
 * card stops any other. Listeners let each card show what is playing.
 */
type Now = { key: string; ayah: number } | null;
let player: AudioPlayer | null = null;
let queue: { key: string; urls: { url: string; ayah: number }[] } | null = null;
let now: Now = null;
const listeners = new Set<(n: Now) => void>();
const emit = () => listeners.forEach((l) => l(now));

function stopAll() {
  queue = null;
  now = null;
  player?.pause();
  player?.remove();
  player = null;
  emit();
}

function playNext() {
  const next = queue?.urls.shift();
  if (!queue || !next) {
    stopAll();
    return;
  }
  player?.remove();
  const p = createAudioPlayer({ uri: next.url });
  player = p;
  now = { key: queue.key, ayah: next.ayah };
  emit();
  p.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish && player === p) playNext();
  });
  p.play();
}

function playSequence(key: string, urls: { url: string; ayah: number }[]) {
  stopAll();
  void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  queue = { key, urls: [...urls] };
  playNext();
}

function useNowPlaying(): Now {
  const [state, setState] = useState<Now>(now);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

// Stop playback when the last card using it goes away.
let mounted = 0;
function useStopOnLastUnmount() {
  useEffect(() => {
    mounted += 1;
    return () => {
      mounted -= 1;
      if (mounted === 0) stopAll();
    };
  }, []);
}

interface CardProps {
  surahNo: number;
  ayahFrom: number;
  ayahTo: number;
  qiraah: QiraahStyle;
}

/**
 * "Compare with a master reciter": the same passage the pupil recited, from
 * a renowned qari in the same qiraah, ayah by ayah, beside their recording.
 */
export function MasterReciterCard({ surahNo, ayahFrom, ayahTo, qiraah }: CardProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  useStopOnLastUnmount();
  const reciters = recitersFor(qiraah);
  const [reciterId, setReciterId] = useState(reciters[0]?.id ?? '');
  const reciter = reciters.find((r) => r.id === reciterId) ?? reciters[0];
  const playing = useNowPlaying();
  const key = `passage:${surahNo}:${ayahFrom}`;
  const active = playing?.key === key;
  const surah = getSurah(surahNo);
  const label = (r: MasterReciter) => (i18n.language === 'ar' ? r.nameAr : r.name);

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <SpeakerHigh size={22} color={theme.colors.accent} weight="duotone" />
          <AppText variant="subheading" style={{ flex: 1 }}>
            {t('master.title')}
          </AppText>
        </View>
        {!reciter ? (
          <AppText variant="body" color="textMuted">
            {t('master.unavailable')}
          </AppText>
        ) : (
          <>
            <AppText variant="caption" color="textMuted">
              {t('master.hint', {
                surah: surah?.name ?? surahNo,
                from: ayahFrom,
                to: ayahTo,
              })}
            </AppText>
            {reciters.length > 1 ? (
              <Segmented
                options={reciters.map((r) => ({ value: r.id, label: label(r) }))}
                value={reciter.id}
                onChange={(value) => {
                  if (active) stopAll();
                  setReciterId(value);
                }}
              />
            ) : (
              <AppText variant="bodyStrong">{label(reciter)}</AppText>
            )}
            {active ? (
              <Button
                label={t('master.stopAt', { ayah: playing.ayah })}
                variant="secondary"
                icon={<Stop size={18} color={theme.colors.text} />}
                onPress={stopAll}
              />
            ) : (
              <Button
                label={t('master.play')}
                icon={<Play size={18} color={theme.colors.textOnAccent} weight="fill" />}
                onPress={() =>
                  playSequence(
                    key,
                    passageAyahs(ayahFrom, ayahTo).map((ayah) => ({ ayah, url: masterAyahUrl(reciter, surahNo, ayah) })),
                  )
                }
              />
            )}
            <AppText variant="caption" color="textSubtle">
              {MASTER_AUDIO_CREDIT}
            </AppText>
          </>
        )}
      </View>
    </Card>
  );
}

/**
 * On a tajweed finding: hear that ayah from the master reciter, so a mark
 * becomes something to imitate rather than only something wrong.
 */
export function MasterAyahButton({ surahNo, ayahNo, qiraah }: { surahNo: number; ayahNo: number; qiraah: QiraahStyle }) {
  const { t } = useTranslation();
  const theme = useTheme();
  useStopOnLastUnmount();
  const reciter = recitersFor(qiraah)[0];
  const playing = useNowPlaying();
  if (!reciter) return null;
  const key = `ayah:${surahNo}:${ayahNo}`;
  const active = playing?.key === key;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? t('master.stop') : t('master.hearAyah', { ayah: ayahNo })}
      hitSlop={8}
      onPress={() =>
        active ? stopAll() : playSequence(key, [{ ayah: ayahNo, url: masterAyahUrl(reciter, surahNo, ayahNo) }])
      }
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft,
      }}
    >
      {active ? (
        <Stop size={14} color={theme.colors.accent} weight="fill" />
      ) : (
        <Play size={14} color={theme.colors.accent} weight="fill" />
      )}
      <AppText variant="caption" color="accent">
        {active ? t('master.stop') : t('master.hearAyah', { ayah: ayahNo })}
      </AppText>
    </Pressable>
  );
}
