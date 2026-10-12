import { VideoCamera } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The room's video and audio. Filled in once the video service is set up;
 * until then the reading room works on its own, alongside any Meet/Zoom call.
 */
export function LiveVideo(_props: { lessonId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <VideoCamera size={24} color={theme.colors.textMuted} weight="duotone" />
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
          {t('halaqa.videoSoon')}
        </AppText>
      </View>
    </Card>
  );
}
