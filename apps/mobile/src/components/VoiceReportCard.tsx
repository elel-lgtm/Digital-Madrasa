import { VOICE_LANGS, type VoiceLang } from '@digital-madrasa/shared';
import { useMutation } from '@tanstack/react-query';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { SpeakerHigh, Stop } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { api } from '@/api';
import { AppText, Button, Card, Segmented } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/** BCP-47 tags for the phone's own voice, used when there is no recording. */
const SPEECH_TAGS: Record<VoiceLang, string> = { en: 'en-GB', sw: 'sw-KE', so: 'so-SO', ar: 'ar-SA' };
const LABELS: Record<VoiceLang, string> = { en: 'English', sw: 'Kiswahili', so: 'Soomaali', ar: 'العربية' };

/**
 * "Listen to the report": the child's progress spoken in the parent's
 * language, for families who would rather hear it than read it. The server
 * builds the sentences from the child's records and records them; when it
 * cannot, the phone reads the same sentences with its own voice.
 */
export function VoiceReportCard({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const start = (VOICE_LANGS as readonly string[]).includes(i18n.language) ? (i18n.language as VoiceLang) : 'en';
  const [lang, setLang] = useState<VoiceLang>(start);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const cache = useRef(new Map<VoiceLang, { text: string; uri: string | null }>());

  const stop = () => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    void Speech.stop();
    setPlaying(false);
  };
  useEffect(() => stop, []);

  const play = (text: string, uri: string | null) => {
    setPlaying(true);
    if (uri) {
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const p = createAudioPlayer({ uri });
      player.current = p;
      p.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) stop();
      });
      p.play();
    } else {
      Speech.speak(text, { language: SPEECH_TAGS[lang], rate: 0.9, onDone: () => setPlaying(false), onStopped: () => setPlaying(false) });
    }
  };

  const report = useMutation({
    mutationFn: () => api.getVoiceReport(studentId, lang),
    onSuccess: (r) => {
      let uri: string | null = null;
      if (r.audio && Platform.OS !== 'web') {
        const file = new File(Paths.cache, `voice-report-${studentId}-${lang}.wav`);
        if (file.exists) file.delete();
        file.create();
        file.write(r.audio, { encoding: 'base64' });
        uri = file.uri;
      } else if (r.audio) {
        uri = `data:audio/wav;base64,${r.audio}`;
      }
      cache.current.set(lang, { text: r.text, uri });
      play(r.text, uri);
    },
    onError: (err) => setError(describeError(err).body),
  });

  const current = cache.current.get(lang);

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <SpeakerHigh size={22} color={theme.colors.accent} weight="duotone" />
          <AppText variant="subheading" style={{ flex: 1 }}>
            {t('voice.title')}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {t('voice.hint')}
        </AppText>
        <Segmented<VoiceLang>
          options={VOICE_LANGS.map((l) => ({ value: l, label: LABELS[l] }))}
          value={lang}
          onChange={(value) => {
            stop();
            setLang(value);
          }}
        />
        {playing ? (
          <Button label={t('voice.stop')} variant="secondary" icon={<Stop size={18} color={theme.colors.text} />} onPress={stop} />
        ) : (
          <Button
            label={report.isPending ? t('voice.preparing') : t('voice.listen')}
            loading={report.isPending}
            onPress={() => {
              setError(null);
              if (current) play(current.text, current.uri);
              else report.mutate();
            }}
          />
        )}
        {current ? (
          <AppText variant="body" color="textMuted" style={{ writingDirection: lang === 'ar' ? 'rtl' : 'ltr' }}>
            {current.text}
          </AppText>
        ) : null}
        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}
