import { TOTAL_JUZ, surahsInJuz } from '@digital-madrasa/shared';
import { useRouter } from 'expo-router';
import { BookOpenText, CheckCircle, DownloadSimple, Trash, WifiSlash } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
} from '@/components/ui';
import {
  LibraryError,
  librarySupported,
  downloadJuz,
  downloadedJuz,
  librarySizeBytes,
  removeJuz,
} from '@/offline/quranLibrary';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Offline practice library.
 *
 * Coverage in the north-east is intermittent, so a student downloads a juz
 * once and can then read it with no connection. The text is stored on the
 * phone (src/offline/quranLibrary.ts); nothing here needs the network except
 * the download itself.
 */
export default function OfflineLibrary() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const [downloaded, setDownloaded] = useState<number[]>(() => downloadedJuz());
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => setDownloaded(downloadedJuz()), []);

  const download = async (juz: number) => {
    setError(null);
    setBusy(juz);
    try {
      await downloadJuz(juz);
    } catch (e) {
      setError(
        e instanceof LibraryError && e.kind === 'corrupt'
          ? t('library.errorCorrupt')
          : t('library.errorOffline'),
      );
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const remove = (juz: number) =>
    Alert.alert(t('library.remove'), t('library.removeConfirm', { juz }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('library.remove'),
        style: 'destructive',
        onPress: () => {
          removeJuz(juz);
          refresh();
        },
      },
    ]);

  const kb = Math.round(librarySizeBytes() / 1024);

  if (!librarySupported) {
    return (
      <Screen>
        <PageHeader title={t('student.offlineLibrary')} showBack />
        <View style={{ marginTop: theme.spacing.lg }}>
          <EmptyState title={t('library.phoneOnlyTitle')} body={t('library.phoneOnlyBody')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={t('student.offlineLibrary')} subtitle={t('student.offlineLibraryBody')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card accent="info">
          <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
            <WifiSlash size={24} color={theme.colors.info} weight="duotone" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">
                {downloaded.length} / {TOTAL_JUZ}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t('library.storage', { size: `${kb} KB` })}
              </AppText>
            </View>
          </View>
        </Card>

        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}

        <View>
          <SectionHeader title={t('library.allJuz')} />
          <Card padded={false}>
            {Array.from({ length: TOTAL_JUZ }, (_, index) => {
              const juz = index + 1;
              const have = downloaded.includes(juz);
              const first = surahsInJuz(juz)[0];
              return (
                <View key={juz} style={{ paddingHorizontal: theme.spacing.lg }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={t('library.juz', { n: juz })}
                    subtitle={first ? first.name : undefined}
                    showChevron={have}
                    onPress={have ? () => router.push(`/(student)/reader/${juz}`) : undefined}
                    left={
                      have ? (
                        <CheckCircle size={20} color={theme.colors.success} weight="fill" />
                      ) : undefined
                    }
                    right={
                      busy === juz ? (
                        <ActivityIndicator color={theme.colors.accent} />
                      ) : have ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                          <Badge label={t('student.downloaded')} tone="success" />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${t('library.remove')} ${t('library.juz', { n: juz })}`}
                            hitSlop={8}
                            onPress={() => remove(juz)}
                            style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash size={18} color={theme.colors.textSubtle} />
                          </Pressable>
                        </View>
                      ) : (
                        <Button
                          label={t('student.download')}
                          variant="ghost"
                          fullWidth={false}
                          disabled={busy !== null}
                          icon={<DownloadSimple size={16} color={theme.colors.accent} weight="bold" />}
                          onPress={() => void download(juz)}
                        />
                      )
                    }
                  />
                </View>
              );
            })}
          </Card>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
          <BookOpenText size={16} color={theme.colors.textSubtle} />
          <AppText variant="caption" color="textSubtle" style={{ flex: 1 }}>
            {t('library.source')}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}
