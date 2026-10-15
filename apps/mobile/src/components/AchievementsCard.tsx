import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BadgeId, BadgeProgress } from '@digital-madrasa/shared';
import { useQuery } from '@tanstack/react-query';
import {
  BookBookmark,
  BookOpen,
  Books,
  CalendarCheck,
  Crown,
  Flame,
  Medal,
  Microphone,
  SealCheck,
  Sparkle,
  Star,
  type IconProps,
} from 'phosphor-react-native';
import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const ICONS: Record<BadgeId, ComponentType<IconProps>> = {
  first_surah: BookOpen,
  surahs_10: Books,
  juz_amma: BookBookmark,
  first_juz: Star,
  juz_5: Medal,
  hafidh: Crown,
  first_recitation: Microphone,
  recitations_20: Sparkle,
  streak_7: Flame,
  weeks_4: CalendarCheck,
  full_month: SealCheck,
};

const seenKey = (studentId: string) => `dm.badges.seen.v1.${studentId}`;

/**
 * Streaks and badges, worked out from the pupil's own records
 * (shared/achievements.ts): nothing is awarded by hand.
 *
 * With `celebrate` (the pupil's own screen) a badge earned since the last
 * visit is announced once. The first visit only remembers what is already
 * earned, so a pupil is not greeted with a list of old badges.
 */
export function AchievementsCard({ studentId, celebrate = false }: { studentId: string; celebrate?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [fresh, setFresh] = useState<BadgeId[]>([]);

  const query = useQuery({
    queryKey: qk.achievements(studentId),
    queryFn: () => api.getAchievements(studentId),
    enabled: Boolean(studentId),
  });

  useEffect(() => {
    if (!celebrate || !query.data) return;
    const earned = query.data.badges.filter((b) => b.earned).map((b) => b.id);
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(seenKey(studentId));
        if (raw !== null) {
          const seen = new Set<string>(JSON.parse(raw) as string[]);
          const added = earned.filter((id) => !seen.has(id));
          if (added.length) setFresh(added);
        }
        await AsyncStorage.setItem(seenKey(studentId), JSON.stringify(earned));
      } catch {
        // Only the celebration is lost; the badges themselves still show.
      }
    })();
  }, [celebrate, query.data, studentId]);

  if (!query.data) return null;
  const { streak, badges, earnedCount, next } = query.data;
  const name = (id: BadgeId) => t(`badges.${id}_name`);

  const stat = (value: number, label: string, highlight = false) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {highlight ? <Flame size={20} color={theme.colors.warning} weight="fill" /> : null}
        <AppText variant="heading" color={highlight ? 'warning' : 'text'}>
          {value}
        </AppText>
      </View>
      <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
        {label}
      </AppText>
    </View>
  );

  const tile = (b: BadgeProgress) => {
    const Icon = ICONS[b.id];
    return (
      <View
        key={b.id}
        style={{ width: '33.33%', alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.sm }}
        accessible
        accessibilityLabel={
          b.earned
            ? t('badges.earnedA11y', { name: name(b.id) })
            : t('badges.lockedA11y', { name: name(b.id), current: b.current, target: b.target })
        }
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: b.earned ? theme.colors.accentSoft : theme.colors.surfaceAlt,
            borderWidth: b.earned ? 2 : 1,
            borderColor: b.earned ? theme.colors.accent : theme.colors.border,
            opacity: b.earned ? 1 : 0.55,
          }}
        >
          <Icon size={26} color={b.earned ? theme.colors.accent : theme.colors.textSubtle} weight={b.earned ? 'fill' : 'regular'} />
        </View>
        <AppText
          variant="caption"
          color={b.earned ? 'text' : 'textMuted'}
          style={{ textAlign: 'center' }}
          numberOfLines={2}
        >
          {name(b.id)}
        </AppText>
        {b.earned ? null : (
          <AppText variant="label" color="textSubtle">
            {`${b.current}/${b.target}`}
          </AppText>
        )}
      </View>
    );
  };

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <AppText variant="subheading" style={{ flex: 1 }}>
            {t('badges.title')}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {t('badges.earned', { earned: earnedCount, total: badges.length })}
          </AppText>
        </View>

        {fresh.length ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.accentSoft,
            }}
            accessibilityLiveRegion="polite"
          >
            <Sparkle size={22} color={theme.colors.accent} weight="fill" />
            <AppText variant="bodyStrong" color="accent" style={{ flex: 1 }}>
              {t('badges.newBadge', { name: fresh.map(name).join(', ') })}
            </AppText>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {stat(streak.current, t('badges.daysInRow'), streak.current > 0)}
          {stat(streak.best, t('badges.best'))}
          {stat(streak.weeks, t('badges.weeksInRow'))}
        </View>
        <AppText variant="caption" color="textMuted">
          {t('badges.streakHint')}
        </AppText>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{badges.map(tile)}</View>

        <AppText variant="body" color={next ? 'textMuted' : 'success'}>
          {next
            ? `${t('badges.next', { name: name(next.id), current: next.current, target: next.target })} · ${t(`badges.${next.id}_hint`)}`
            : t('badges.allEarned')}
        </AppText>
      </View>
    </Card>
  );
}
