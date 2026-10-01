import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText, Card, ErrorState, PageHeader, Screen, SkeletonList } from '@/components/ui';
import { librarySupported, readJuz } from '@/offline/quranLibrary';
import { usePreferences } from '@/store/preferences';
import { useTheme } from '@/theme/ThemeProvider';

const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';

/** Arabic-Indic digits for the ayah markers, as printed in a mushaf. */
const arabicNumber = (n: number) =>
  String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)] ?? d);

/**
 * Reads a downloaded juz entirely from the phone — no network involved. The
 * basmala is shown at the head of each surah except At-Tawbah, and not
 * repeated for Al-Fatihah, where it is the first ayah.
 */
export default function JuzReader() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = usePreferences((s) => s.quranFontScale);
  const { juz = '1' } = useLocalSearchParams<{ juz: string }>();
  const n = Number(juz);

  const book = useQuery({
    queryKey: ['offline-juz', n],
    queryFn: () => readJuz(n),
    enabled: librarySupported,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    // Local file: failure means it is not there, not that it might appear.
    retry: false,
  });

  return (
    <Screen>
      <PageHeader title={t('library.juz', { n })} showBack />
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
        {!librarySupported ? (
          <ErrorState
            title={t('library.phoneOnlyTitle')}
            body={t('library.phoneOnlyBody')}
            retryLabel={t('common.retry')}
          />
        ) : book.isPending ? (
          <SkeletonList count={4} />
        ) : book.isError ? (
          <ErrorState
            title={t('library.notDownloaded')}
            body={t('library.notDownloadedBody')}
            retryLabel={t('common.retry')}
            onRetry={() => void book.refetch()}
          />
        ) : (
          book.data.surahs.map((surah) => (
            <Card key={surah.number}>
              <View style={{ gap: theme.spacing.md }}>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <AppText arabic scale={scale * 1.1} align="center">
                    {surah.name}
                  </AppText>
                  <AppText variant="caption" color="textMuted" align="center">
                    {surah.number}. {surah.transliteration}
                  </AppText>
                </View>
                {surah.ayahs[0]?.n === 1 && surah.number !== 1 && surah.number !== 9 ? (
                  <AppText arabic scale={scale} align="center" color="textMuted">
                    {BASMALA}
                  </AppText>
                ) : null}
                <AppText arabic scale={scale} style={{ writingDirection: 'rtl' }}>
                  {surah.ayahs.map((ayah) => `${ayah.text} ﴿${arabicNumber(ayah.n)}﴾ `).join('')}
                </AppText>
              </View>
            </Card>
          ))
        )}
        <AppText variant="caption" color="textSubtle" align="center">
          {t('library.source')}
        </AppText>
      </View>
    </Screen>
  );
}
