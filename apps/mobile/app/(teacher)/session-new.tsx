import {
  createLessonSchema,
  getSurah,
  meetingProvider,
  MEETING_PROVIDER_LABEL,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AppText, Button, Card, OptionGroup, PageHeader, Screen, TextField } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/** The next seven days, starting today, as YYYY-MM-DD in the phone's time. */
function nextDays(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ value, label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) });
  }
  return out;
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Schedule a live session: which class, when, what will be read, and the
 * Google Meet or Zoom link. The link is checked against the allowed meeting
 * hosts here and again by the database. Only that class, their parents and
 * staff can see the session; they are told in their inbox.
 */
export default function NewSession() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const days = useMemo(nextDays, []);

  const classes = useQuery({ queryKey: qk.classes(), queryFn: () => api.listClasses() });
  const [classId, setClassId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(days[0]!.value);
  const [time, setTime] = useState('18:00');
  const [surah, setSurah] = useState('112');
  const [ayahFrom, setAyahFrom] = useState('1');
  const [ayahTo, setAyahTo] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const surahNo = Number(surah);
  const surahInfo = getSurah(surahNo);
  const provider = link.trim() ? meetingProvider(link.trim()) : null;
  const scheduled = TIME.test(time) ? new Date(`${day}T${time.padStart(5, '0')}:00`) : null;

  const create = useMutation({
    mutationFn: api.createLesson,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lessons'] });
      router.back();
    },
    onError: (err) => setError(describeError(err).body),
  });

  const submit = () => {
    setError(null);
    if (!classId) return setError(t('session.chooseClass'));
    if (!scheduled) return setError(t('session.timeInvalid'));
    if (scheduled.getTime() < Date.now() - 60_000) return setError(t('session.inPast'));
    const parsed = createLessonSchema.safeParse({
      classId,
      title: title.trim(),
      qiraahStyle: 'hafs',
      scheduledFor: scheduled.toISOString(),
      notes: notes.trim() || undefined,
      meetingUrl: link.trim() || null,
      surahFrom: surahNo,
      ayahFrom: Number(ayahFrom) || 1,
      surahTo: surahNo,
      ayahTo: Number(ayahTo) || surahInfo?.ayahCount || 1,
    });
    if (!parsed.success) {
      return setError(t(parsed.error.issues[0]?.message ?? 'validation.invalid', { defaultValue: t('session.checkFields') }));
    }
    create.mutate(parsed.data);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={<Button label={t('session.schedule')} size="lg" loading={create.isPending} onPress={submit} />}
      >
        <PageHeader title={t('session.newTitle')} subtitle={t('session.newSubtitle')} showBack />
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <OptionGroup
            label={t('session.class')}
            options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={classId}
            onChange={setClassId}
          />
          <TextField label={t('session.titleLabel')} value={title} onChangeText={setTitle} placeholder={t('session.titlePlaceholder')} maxLength={120} />
          <OptionGroup label={t('session.day')} options={days} value={day} onChange={setDay} />
          <TextField
            label={t('session.time')}
            value={time}
            onChangeText={setTime}
            placeholder="18:00"
            keyboardType="numbers-and-punctuation"
            hint={t('session.timeHint')}
            error={time && !TIME.test(time) ? t('session.timeInvalid') : undefined}
          />

          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <AppText variant="label" color="textMuted" uppercase>
                {t('session.reading')}
              </AppText>
              <TextField
                label={t('session.surah')}
                value={surah}
                onChangeText={(v) => setSurah(v.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad"
                hint={surahInfo ? `${surahInfo.name} · ${t('session.ayahs', { count: surahInfo.ayahCount })}` : t('session.surahHint')}
                error={surah && !surahInfo ? t('session.surahInvalid') : undefined}
              />
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <TextField label={t('session.fromAyah')} value={ayahFrom} onChangeText={(v) => setAyahFrom(v.replace(/\D/g, ''))} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={t('session.toAyah')}
                    value={ayahTo}
                    onChangeText={(v) => setAyahTo(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    placeholder={surahInfo ? String(surahInfo.ayahCount) : ''}
                  />
                </View>
              </View>
            </View>
          </Card>

          <TextField
            label={t('session.link')}
            value={link}
            onChangeText={setLink}
            placeholder="https://meet.google.com/abc-defg-hij"
            autoCapitalize="none"
            keyboardType="url"
            hint={provider ? t('session.linkOk', { provider: MEETING_PROVIDER_LABEL[provider] }) : t('session.linkHint')}
            error={link.trim() && !provider ? t('session.linkInvalid') : undefined}
          />
          <TextField label={t('session.notes')} value={notes} onChangeText={setNotes} maxLength={1000} multiline />

          <AppText variant="caption" color="textMuted">
            {t('session.whoSees')}
          </AppText>
          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

