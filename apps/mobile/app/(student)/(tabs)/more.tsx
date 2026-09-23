import { useRouter } from 'expo-router';
import { CalendarCheck, DownloadSimple, Info, Microphone, QrCode, Question, ShieldCheck, Sparkle } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  AppearanceSettings,
  ProfileCard,
  SignOutCard,
} from '@/components/SettingsSections';
import { Card, Divider, ListRow, PageHeader, Screen, SectionHeader } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function StudentMore() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <PageHeader title={t('nav.more')} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <ProfileCard />

        <View>
          <SectionHeader title={t('nav.learn')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title={t('ai.title')}
                subtitle={t('ai.subtitle')}
                left={<Sparkle size={20} color={theme.colors.accent} weight="duotone" />}
                onPress={() => router.push('/(student)/assistant')}
              />
              <Divider />
              <ListRow
                title={t('scan.title')}
                subtitle={t('scan.intro')}
                left={<QrCode size={20} color={theme.colors.accent} weight="duotone" />}
                onPress={() => router.push('/(student)/scan')}
              />
              <Divider />
              <ListRow
                title={t('student.myRecitations')}
                left={<Microphone size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(student)/recitations')}
              />
              <Divider />
              <ListRow
                title={t('student.attendanceRate')}
                left={<CalendarCheck size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(student)/attendance')}
              />
              <Divider />
              <ListRow
                title={t('student.offlineLibrary')}
                subtitle={t('student.offlineLibraryBody')}
                left={<DownloadSimple size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(student)/library')}
              />
            </View>
          </Card>
        </View>

        <AppearanceSettings />

        <View>
          <SectionHeader title={t('settings.help')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title={t('settings.privacy')}
                left={<ShieldCheck size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(student)/privacy')}
              />
              <Divider />
              <ListRow
                title={t('settings.reportProblem')}
                left={<Question size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(student)/report-problem')}
              />
              <Divider />
              <ListRow
                title={t('settings.about')}
                left={<Info size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(student)/about')}
              />
            </View>
          </Card>
        </View>

        <SignOutCard />
      </View>
    </Screen>
  );
}
