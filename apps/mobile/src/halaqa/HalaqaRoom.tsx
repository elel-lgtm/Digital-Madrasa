import {
  chooseReader,
  endTurn,
  handQueue,
  initialHalaqa,
  moveAyah,
  newer,
  type HalaqaMark,
  type HalaqaParticipant,
  type HalaqaState,
  type Lesson,
} from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import { CaretLeft, CaretRight, HandWaving, Microphone, Users } from 'phosphor-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { api } from '@/api';
import { AppText, Badge, Button, Card, PageHeader, Screen, SkeletonList } from '@/components/ui';
import { openHalaqaChannel, type HalaqaChannel, type HalaqaEvent } from '@/halaqa/channel';
import { BUNDLED_SURAHS, loadSurahText, type SurahText } from '@/halaqa/text';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The live halaqa: everyone in the lesson sees the same surah; pupils raise
 * their hands; the teacher chooses who reads; every phone shows who is
 * reading and highlights the ayah; the teacher marks each reading, which is
 * kept on the pupil's record. The teacher's phone holds the room's state.
 */
export function HalaqaRoom({ lesson, video }: { lesson: Lesson; video?: React.ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const isTeacher = session.user.role === 'teacher';
  const me = useMemo<HalaqaParticipant>(
    () => ({
      userId: session.user.id,
      name: session.user.fullName,
      role: session.user.role,
      studentId: session.student?.id ?? null,
      handRaisedAt: null,
    }),
    [session],
  );

  const [people, setPeople] = useState<HalaqaParticipant[]>([me]);
  const [state, setState] = useState<HalaqaState | null>(isTeacher ? initialHalaqa(lesson.surahFrom, lesson.ayahFrom) : null);
  const [text, setText] = useState<SurahText | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const channel = useRef<HalaqaChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Classmates, so demo mode can show a room with pupils in it.
  const classmates = useQuery({
    queryKey: ['halaqa-classmates', lesson.classId],
    queryFn: async () => {
      try {
        const page = await api.listStudents({ classId: lesson.classId });
        return page.items.map((s) => ({ userId: s.profileId, name: s.fullName, studentId: s.id }));
      } catch {
        return [];
      }
    },
  });

  const ayahCount = text?.ayahs.length ?? 1;

  // The teacher is the source of truth: apply, then tell everyone.
  const publish = (next: HalaqaState) => {
    setState(next);
    channel.current?.send({ type: 'state', state: next });
  };

  useEffect(() => {
    if (!classmates.isFetched) return;
    let live = true;
    void openHalaqaChannel(lesson.id, me, classmates.data ?? [])
      .then((ch) => {
        if (!live) return ch.close();
        channel.current = ch;
        ch.onPeople(setPeople);
        ch.onEvent((event: HalaqaEvent) => {
          if (event.type === 'state') setState((cur) => newer(cur, event.state));
          else if (event.type === 'hello' && isTeacher && stateRef.current) ch.send({ type: 'state', state: stateRef.current });
          else if (event.type === 'advance' && isTeacher && stateRef.current?.readerUserId === event.fromUserId) {
            publish(moveAyah(stateRef.current, event.by, ayahCountRef.current));
          } else if (event.type === 'marked') {
            setToast(t('halaqa.markedToast', { name: event.studentName, mark: t(`halaqa.mark_${event.mark}`) }));
          }
        });
        if (isTeacher && stateRef.current) ch.send({ type: 'state', state: stateRef.current });
        else ch.send({ type: 'hello' });
      })
      .catch(() => setFailed(true));
    return () => {
      live = false;
      channel.current?.close();
      channel.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, classmates.isFetched]);

  const ayahCountRef = useRef(ayahCount);
  ayahCountRef.current = ayahCount;

  useEffect(() => {
    if (!state) return;
    let live = true;
    void loadSurahText(state.surahNo).then((s) => live && setText(s));
    return () => {
      live = false;
    };
  }, [state?.surahNo]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const myHandUp = people.find((p) => p.userId === me.userId)?.handRaisedAt != null;
  const iAmReading = state?.readerUserId === me.userId;
  const queue = handQueue(people);
  const pupilsHere = people.filter((p) => p.role === 'student');

  const mark = async (value: HalaqaMark) => {
    if (!state?.readerStudentId) return;
    try {
      await api.markHalaqaReading({
        lessonId: lesson.id,
        studentId: state.readerStudentId,
        surahNo: state.surahNo,
        ayahFrom: state.startAyah,
        ayahTo: Math.max(state.startAyah, state.ayah),
        mark: value,
      });
      channel.current?.send({ type: 'marked', studentName: state.readerName ?? '', mark: value });
      setToast(t('halaqa.markedToast', { name: state.readerName ?? '', mark: t(`halaqa.mark_${value}`) }));
      publish(endTurn(state, ayahCount));
    } catch {
      setToast(t('halaqa.markFailed'));
    }
  };

  return (
    <Screen>
      <PageHeader title={lesson.title} subtitle={t('halaqa.subtitle')} showBack />
      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge label={t('live.liveNow')} tone="danger" />
          <Badge label={t('halaqa.present', { count: people.length })} tone="neutral" />
          {failed ? <Badge label={t('halaqa.offline')} tone="warning" /> : null}
        </View>

        {video}

        {/* Who is reading */}
        <Card accent={state?.readerUserId ? 'success' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Microphone size={26} color={state?.readerUserId ? theme.colors.success : theme.colors.textMuted} weight="duotone" />
            <View style={{ flex: 1 }}>
              <AppText variant="subheading">
                {iAmReading
                  ? t('halaqa.yourTurn')
                  : state?.readerName
                    ? t('halaqa.nowReading', { name: state.readerName })
                    : state
                      ? t('halaqa.nobodyReading')
                      : t('halaqa.waitingTeacher')}
              </AppText>
              {state && text ? (
                <AppText variant="caption" color="textMuted">
                  {text.transliteration} · {t('halaqa.ayahOf', { ayah: state.ayah, count: ayahCount })}
                </AppText>
              ) : null}
            </View>
          </View>
        </Card>

        {toast ? (
          <Card accent="accent">
            <AppText variant="body">{toast}</AppText>
          </Card>
        ) : null}

        {/* The page everyone reads from */}
        <Card>
          {!state ? (
            <SkeletonList count={2} />
          ) : !text ? (
            <AppText variant="body" color="textMuted">
              {t('halaqa.noText')}
            </AppText>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
              <View style={{ gap: theme.spacing.sm }}>
                {text.ayahs.map((a) => {
                  const current = a.n === state.ayah;
                  const read = state.readerUserId && a.n >= state.startAyah && a.n < state.ayah;
                  return (
                    <View
                      key={a.n}
                      style={{
                        borderRadius: theme.radius.md,
                        padding: theme.spacing.sm,
                        backgroundColor: current ? theme.colors.accentSoft : 'transparent',
                        borderWidth: current ? 1 : 0,
                        borderColor: theme.colors.accent,
                      }}
                    >
                      <AppText arabic style={{ fontSize: 24, lineHeight: 44, color: read ? theme.colors.success : theme.colors.text }}>
                        {a.text} ﴿{a.n.toLocaleString('ar-EG')}﴾
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </Card>

        {/* Pupil controls */}
        {!isTeacher ? (
          iAmReading ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Button label={t('halaqa.prevAyah')} variant="secondary" style={{ flex: 1 }} onPress={() => channel.current?.send({ type: 'advance', by: -1, fromUserId: me.userId })} />
              <Button label={t('halaqa.nextAyah')} style={{ flex: 1 }} onPress={() => channel.current?.send({ type: 'advance', by: 1, fromUserId: me.userId })} />
            </View>
          ) : (
            <Button
              label={myHandUp ? t('halaqa.lowerHand') : t('halaqa.raiseHand')}
              variant={myHandUp ? 'secondary' : 'primary'}
              icon={<HandWaving size={20} color={myHandUp ? theme.colors.text : theme.colors.textOnAccent} weight="fill" />}
              onPress={() => channel.current?.updateMe({ handRaisedAt: myHandUp ? null : Date.now() })}
            />
          )
        ) : null}

        {/* Teacher controls */}
        {isTeacher && state ? (
          <>
            {state.readerUserId ? (
              <Card>
                <View style={{ gap: theme.spacing.md }}>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                    <Button label={t('halaqa.prevAyah')} variant="secondary" icon={<CaretLeft size={16} color={theme.colors.text} />} style={{ flex: 1 }} onPress={() => publish(moveAyah(state, -1, ayahCount))} />
                    <Button label={t('halaqa.nextAyah')} variant="secondary" icon={<CaretRight size={16} color={theme.colors.text} />} style={{ flex: 1 }} onPress={() => publish(moveAyah(state, 1, ayahCount))} />
                  </View>
                  <AppText variant="label" color="textMuted" uppercase>
                    {t('halaqa.markReading', { name: state.readerName ?? '' })}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                    <Button label={t('halaqa.mark_excellent')} style={{ flex: 1 }} onPress={() => void mark('excellent')} />
                    <Button label={t('halaqa.mark_good')} variant="secondary" style={{ flex: 1 }} onPress={() => void mark('good')} />
                  </View>
                  <Button label={t('halaqa.mark_needs_work')} variant="secondary" onPress={() => void mark('needs_work')} />
                </View>
              </Card>
            ) : null}

            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <HandWaving size={20} color={theme.colors.accent} weight="duotone" />
                  <AppText variant="subheading">{t('halaqa.hands', { count: queue.length })}</AppText>
                </View>
                {queue.length === 0 ? (
                  <AppText variant="caption" color="textMuted">
                    {t('halaqa.noHands')}
                  </AppText>
                ) : (
                  queue.map((p, i) => (
                    <Pressable
                      key={p.userId}
                      accessibilityRole="button"
                      onPress={() => publish(chooseReader(state, p))}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.xs }}
                    >
                      <AppText variant="body">
                        {i + 1}. {p.name}
                      </AppText>
                      <Badge label={t('halaqa.letRead')} tone="success" />
                    </Pressable>
                  ))
                )}
              </View>
            </Card>

            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Users size={20} color={theme.colors.textMuted} weight="duotone" />
                  <AppText variant="subheading">{t('halaqa.pupilsHere', { count: pupilsHere.length })}</AppText>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {pupilsHere.map((p) => (
                    <Pressable key={p.userId} accessibilityRole="button" onPress={() => publish(chooseReader(state, p))}>
                      <Badge label={p.name} tone={state.readerUserId === p.userId ? 'success' : 'neutral'} />
                    </Pressable>
                  ))}
                </View>
                <AppText variant="label" color="textMuted" uppercase style={{ marginTop: theme.spacing.sm }}>
                  {t('halaqa.surah')}
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                    {[lesson.surahFrom, ...BUNDLED_SURAHS.map((s) => s.number).filter((n) => n !== lesson.surahFrom)].slice(0, 40).map((n) => (
                      <Pressable key={n} accessibilityRole="button" onPress={() => publish({ ...initialHalaqa(n), version: state.version + 1 })}>
                        <Badge label={String(n)} tone={state.surahNo === n ? 'accent' : 'neutral'} />
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </Card>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
