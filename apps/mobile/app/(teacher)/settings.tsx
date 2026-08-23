import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppearanceSettings, ProfileCard } from '@/components/SettingsSections';
import { AppText, Badge, Card, PageHeader, Screen, SectionHeader, ToggleRow } from '@/components/ui';
import { useRequiredSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Madrasa settings. Feature flags are shown read-only here — they are set by
 * the platform admin during rollout, not by the madrasa itself.
 */
export default function MadrasaSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useRequiredSession();
  const flags = session.featureFlags;

  return (
    <Screen>
      <PageHeader title={t('teacher.settings')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <ProfileCard />

        {session.madrasa ? (
          <View>
            <SectionHeader title={t('auth.madrasaDetails')} />
            <Card>
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="subheading">{session.madrasa.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {session.madrasa.town}, {session.madrasa.county}
                </AppText>
                <AppText variant="caption" color="textSubtle">
                  {session.madrasa.contactEmail} · {session.madrasa.contactPhone}
                </AppText>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: 4 }}>
                  <Badge
                    label={session.madrasa.status}
                    tone={session.madrasa.status === 'active' ? 'success' : 'danger'}
                  />
                  <Badge label={session.madrasa.timezone} />
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader
            title="Features"
            subtitle="Enabled for your madrasa by the platform administrator"
          />
          <Card>
            <View>
              <ToggleRow
                label={t('student.feedbackTitle')}
                description="AI tajweed evaluation on student recitations"
                value={flags.aiEvaluation}
                onChange={() => undefined}
              />
              <ToggleRow
                label={t('nav.fees')}
                description="In-app M-Pesa fee collection"
                value={flags.payments}
                onChange={() => undefined}
              />
              <ToggleRow
                label={t('student.offlineLibrary')}
                description="Downloadable audio and offline recitation"
                value={flags.offlineMode}
                onChange={() => undefined}
              />
              <ToggleRow
                label="SMS fallback"
                description="Critical notices by SMS when a parent has no data"
                value={flags.smsFallback}
                onChange={() => undefined}
              />
            </View>
          </Card>
        </View>

        <AppearanceSettings />
      </View>
    </Screen>
  );
}
