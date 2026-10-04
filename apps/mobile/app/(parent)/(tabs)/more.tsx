import { useRouter } from 'expo-router';
import {
  BellRinging,
  DownloadSimple,
  HandHeart,
  Info,
  Question,
  ShieldCheck,
  Sparkle,
  UserPlus,
} from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppearanceSettings, ProfileCard, SignOutCard } from '@/components/SettingsSections';
import { Card, Divider, ListRow, PageHeader, Screen, SectionHeader } from '@/components/ui';
import { useChildren } from '@/hooks/useChildren';
import { useTheme } from '@/theme/ThemeProvider';

export default function ParentMore() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { children } = useChildren();

  return (
    <Screen>
      <PageHeader title={t('nav.more')} />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <ProfileCard />

        <View>
          <SectionHeader title={t('parent.myChildren')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              {children.map((child, index) => (
                <View key={child.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={child.fullName}
                    subtitle={child.admissionNo}
                    onPress={() =>
                      router.push({ pathname: '/(parent)/child/[id]', params: { id: child.id } })
                    }
                  />
                </View>
              ))}
              {children.length > 0 ? <Divider /> : null}
              <ListRow
                title={t('parent.addChild')}
                left={<UserPlus size={20} color={theme.colors.accent} weight="duotone" />}
                onPress={() => router.push('/(parent)/link-child')}
              />
              <Divider />
              <ListRow
                title={t('sponsor.title')}
                subtitle={t('sponsor.menuSubtitle')}
                left={<HandHeart size={20} color={theme.colors.accent} weight="duotone" />}
                onPress={() => router.push('/(parent)/sponsor')}
              />
              <Divider />
              <ListRow
                title={t('ai.title')}
                subtitle={t('ai.subtitle')}
                left={<Sparkle size={20} color={theme.colors.accent} weight="duotone" />}
                onPress={() => router.push('/(parent)/assistant')}
              />
            </View>
          </Card>
        </View>

        <View>
          <SectionHeader title={t('settings.notifications')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title={t('parent.notificationPrefs')}
                subtitle={t('parent.notificationPrefsBody')}
                left={<BellRinging size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(parent)/notifications')}
              />
            </View>
          </Card>
        </View>

        <AppearanceSettings />

        <View>
          <SectionHeader title={t('settings.privacy')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title={t('parent.exportData')}
                left={<DownloadSimple size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(parent)/export')}
              />
              <Divider />
              <ListRow
                title={t('settings.privacyPolicy')}
                left={<ShieldCheck size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(parent)/privacy')}
              />
              <Divider />
              <ListRow
                title={t('settings.reportProblem')}
                left={<Question size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(parent)/report-problem')}
              />
              <Divider />
              <ListRow
                title={t('settings.about')}
                left={<Info size={20} color={theme.colors.textMuted} weight="duotone" />}
                onPress={() => router.push('/(parent)/about')}
              />
            </View>
          </Card>
        </View>

        <SignOutCard />
      </View>
    </Screen>
  );
}
