import { TOTAL_JUZ, surahsInJuz } from '@digital-madrasa/shared';
import { CheckCircle, DownloadSimple, WifiSlash } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  ListRow,
  PageHeader,
  ProgressBar,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

type DownloadState = 'idle' | 'downloading' | 'done';

/**
 * Offline practice library.
 *
 * Coverage in the north-east is intermittent, so a student downloads a juz
 * once and can then read and record without any connection. Uploads queue and
 * flush when they are back online.
 */
export default function OfflineLibrary() {
  const { t } = useTranslation();
  const theme = useTheme();

  const [states, setStates] = useState<Record<number, DownloadState>>({ 30: 'done' });
  const [progress, setProgress] = useState<Record<number, number>>({});

  const startDownload = (juz: number) => {
    setStates((current) => ({ ...current, [juz]: 'downloading' }));
    setProgress((current) => ({ ...current, [juz]: 0 }));

    // Placeholder for the real download manager: chunks the juz audio and
    // text into SQLite with resumable, backed-off requests.
    const timer = setInterval(() => {
      setProgress((current) => {
        const next = (current[juz] ?? 0) + 12;
        if (next >= 100) {
          clearInterval(timer);
          setStates((s) => ({ ...s, [juz]: 'done' }));
          return { ...current, [juz]: 100 };
        }
        return { ...current, [juz]: next };
      });
    }, 220);
  };

  const downloadedCount = Object.values(states).filter((state) => state === 'done').length;

  return (
    <Screen>
      <PageHeader
        title={t('student.offlineLibrary')}
        subtitle={t('student.offlineLibraryBody')}
        showBack
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card accent="info">
          <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
            <WifiSlash size={24} color={theme.colors.info} weight="duotone" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">
                {downloadedCount} / {TOTAL_JUZ}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t('common.offline')}
              </AppText>
            </View>
          </View>
        </Card>

        <View>
          <SectionHeader title={t('student.chooseSurah')} />
          <Card padded={false}>
            {Array.from({ length: TOTAL_JUZ }, (_, index) => {
              const juz = index + 1;
              const state = states[juz] ?? 'idle';
              const surahs = surahsInJuz(juz);
              const first = surahs[0];

              return (
                <View key={juz} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={`Juz ${juz}`}
                    subtitle={first ? first.name : undefined}
                    showChevron={false}
                    right={
                      state === 'done' ? (
                        <Badge label={t('student.downloaded')} tone="success" />
                      ) : state === 'downloading' ? (
                        <View style={{ width: 90 }}>
                          <ProgressBar
                            value={progress[juz] ?? 0}
                            label={`Juz ${juz}`}
                            height={6}
                          />
                        </View>
                      ) : (
                        <Button
                          label={t('student.download')}
                          variant="ghost"
                          fullWidth={false}
                          icon={
                            <DownloadSimple size={16} color={theme.colors.accent} weight="bold" />
                          }
                          onPress={() => startDownload(juz)}
                        />
                      )
                    }
                    left={
                      state === 'done' ? (
                        <CheckCircle size={20} color={theme.colors.success} weight="fill" />
                      ) : undefined
                    }
                  />
                </View>
              );
            })}
          </Card>
        </View>
      </View>
    </Screen>
  );
}
