import { followRecitation, mushafWords, type MushafWord } from '@digital-madrasa/shared';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { Microphone, Stop } from 'phosphor-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { AppText, Badge, Button, Card, ListRow, PageHeader, Screen } from '@/components/ui';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

// Al-Fatihah and Juz 'Amma ship with the app, so practice works offline.
const BOOK = require('../../assets/quran/recite-along.json') as {
  surahs: { number: number; name: string; transliteration: string; ayahs: { n: number; text: string }[] }[];
};

/**
 * Recite along: the pupil recites and the words light up as they are heard,
 * so they can see where they are and what they skipped. Practice only:
 * nothing is recorded, uploaded or scored.
 *
 * Recognition runs on the phone where it can (Android 13+ with the Arabic
 * on-device model). Where it would have to use Google's online service, it is
 * offered only if the parent has agreed to AI processing of the child's voice
 * (the same consent as tajweed feedback, migration 0028).
 */
export default function ReciteAlongScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const [surahNo, setSurahNo] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finals = useRef<string[]>([]);
  const wantListening = useRef(false);

  const surah = BOOK.surahs.find((s) => s.number === surahNo) ?? null;
  const words = useMemo<MushafWord[]>(() => (surah ? mushafWords(surah.ayahs) : []), [surah]);
  const follow = useMemo(() => followRecitation(words, heard), [words, heard]);

  // On the phone only if the Arabic offline pack is actually installed;
  // "supports on-device" alone says nothing about which languages are.
  const [onDevice, setOnDevice] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let live = true;
    ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' })
      .then((r) => {
        if (live) setOnDevice(r.installedLocales.some((l) => l.toLowerCase().startsWith('ar')));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const consented = Boolean(session.student?.aiFeedbackConsent);
  const allowed = onDevice || consented;
  const useOnDevice = useRef(false);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      finals.current.push(text);
      setHeard(finals.current.join(' '));
    } else {
      setHeard([...finals.current, text].join(' '));
    }
  });
  useSpeechRecognitionEvent('end', () => {
    // Recognisers stop after a pause; carry on until the pupil presses stop.
    if (wantListening.current) void begin();
    else setListening(false);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'no-speech' && wantListening.current) return;
    // The offline pack failed: carry on with the online service, but only
    // where the parent has agreed to the child's voice being processed.
    if (useOnDevice.current && consented && wantListening.current && event.error !== 'not-allowed') {
      useOnDevice.current = false;
      void begin();
      return;
    }
    wantListening.current = false;
    setListening(false);
    setError(
      event.error === 'not-allowed'
        ? t('reciteAlong.noPermission')
        : `${t('reciteAlong.unavailable')} (${event.error})`,
    );
  });

  useEffect(() => {
    if (follow.done && wantListening.current) stop();
  }, [follow.done]);

  useEffect(() => () => {
    wantListening.current = false;
    ExpoSpeechRecognitionModule.abort();
  }, []);

  async function begin() {
    ExpoSpeechRecognitionModule.start({
      lang: 'ar-SA',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: useOnDevice.current,
      addsPunctuation: false,
      androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000 },
    });
  }

  async function start() {
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError(t('reciteAlong.noPermission'));
      return;
    }
    finals.current = [];
    setHeard('');
    useOnDevice.current = onDevice;
    wantListening.current = true;
    setListening(true);
    await begin();
  }

  function stop() {
    wantListening.current = false;
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  }

  if (!surah) {
    return (
      <Screen>
        <PageHeader title={t('reciteAlong.title')} subtitle={t('reciteAlong.subtitle')} showBack />
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          {!allowed ? (
            <Card accent="warning">
              <AppText variant="body">{t('reciteAlong.needsConsent')}</AppText>
            </Card>
          ) : null}
          <Card padded={false}>
            {BOOK.surahs.map((s) => (
              <View key={s.number} style={{ paddingHorizontal: theme.spacing.lg }}>
                <ListRow
                  title={`${s.number}. ${s.transliteration}`}
                  subtitle={t('reciteAlong.ayahs', { count: s.ayahs.length })}
                  right={<AppText variant="bodyStrong">{s.name}</AppText>}
                  onPress={allowed ? () => setSurahNo(s.number) : undefined}
                />
              </View>
            ))}
          </Card>
        </View>
      </Screen>
    );
  }

  const missed = follow.states.filter((s) => s === 'missed').length;

  return (
    <Screen
      footer={
        follow.done ? (
          <Button
            label={t('reciteAlong.again')}
            size="lg"
            onPress={() => {
              finals.current = [];
              setHeard('');
            }}
          />
        ) : listening ? (
          <Button label={t('reciteAlong.stop')} size="lg" variant="secondary" icon={<Stop size={18} color={theme.colors.text} />} onPress={stop} />
        ) : (
          <Button label={t('reciteAlong.start')} size="lg" icon={<Microphone size={18} color={theme.colors.textOnAccent} />} onPress={() => void start()} />
        )
      }
    >
      <PageHeader title={surah.transliteration} subtitle={surah.name} showBack />
      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <Badge label={t('reciteAlong.progress', { done: follow.cursor, total: words.length })} tone="accent" />
          {missed > 0 ? <Badge label={t('reciteAlong.missed', { count: missed })} tone="warning" /> : null}
          {listening ? <Badge label={t('reciteAlong.listening')} tone="success" /> : null}
          <Badge label={onDevice ? t('reciteAlong.onDevice') : t('reciteAlong.online')} tone="neutral" />
        </View>

        {follow.done ? (
          <Card accent="success">
            <AppText variant="subheading">
              {missed === 0 ? t('reciteAlong.perfect') : t('reciteAlong.finished', { count: missed })}
            </AppText>
          </Card>
        ) : null}

        <Card>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, rowGap: 10 }}>
            {words.map((w, i) => {
              const state = follow.states[i];
              const current = i === follow.cursor && listening;
              const color =
                state === 'recited' ? theme.colors.success : state === 'missed' ? theme.colors.danger : theme.colors.text;
              const endOfAyah = words[i + 1]?.ayah !== w.ayah;
              return (
                <Pressable key={i} accessibilityLabel={w.display}>
                  <AppText
                    style={{
                      fontSize: 26,
                      lineHeight: 46,
                      color,
                      opacity: state === 'pending' && !current ? 0.75 : 1,
                      backgroundColor: current ? theme.colors.accentSoft : 'transparent',
                      textDecorationLine: state === 'missed' ? 'underline' : 'none',
                      borderRadius: 6,
                      paddingHorizontal: 2,
                    }}
                  >
                    {w.display}
                    {endOfAyah ? ` ﴿${w.ayah.toLocaleString('ar-EG')}﴾` : ''}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <AppText variant="caption" color="textSubtle">
          {t('reciteAlong.note')}
        </AppText>
        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
