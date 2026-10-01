import type { Certificate } from '@digital-madrasa/shared';
import { Certificate as CertificateIcon, ShareNetwork } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';
import { AppText, Button, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate } from '@/utils/dates';

interface CertificateCardProps {
  certificate: Certificate;
  madrasaName?: string;
  /** Staff only: withdraws the certificate (it then verifies as withdrawn). */
  onWithdraw?: () => void;
  withdrawing?: boolean;
}

/**
 * A certificate as the holder sees it. The verification code is the part that
 * matters: anyone can check it on the verify screen without an account.
 */
export function CertificateCard({ certificate, madrasaName, onWithdraw, withdrawing }: CertificateCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const share = () => {
    void Share.share({
      message: t('learning.shareText', {
        title: certificate.title,
        name: certificate.studentName,
        madrasa: madrasaName ?? 'Digital Madrasa',
        code: certificate.verificationCode,
      }),
    });
  };

  return (
    <Card accent="accent">
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <CertificateIcon size={28} color={theme.colors.accent} weight="duotone" />
          <View style={{ flex: 1 }}>
            <AppText variant="subheading">{certificate.title}</AppText>
            <AppText variant="caption" color="textMuted">
              {t(`learning.kind_${certificate.kind}`)} · {longDate(certificate.issuedAt)}
            </AppText>
          </View>
        </View>
        <AppText variant="caption" color="textSubtle">
          {t('learning.awardedTo')}: {certificate.studentName}
          {madrasaName ? ` · ${madrasaName}` : ''}
        </AppText>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.sm,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <AppText variant="label" color="textMuted" uppercase>
            {t('learning.verificationCode')}
          </AppText>
          <AppText variant="bodyStrong" color="accent" style={{ letterSpacing: 2 }}>
            {certificate.verificationCode}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('learning.share')}
              variant="secondary"
              icon={<ShareNetwork size={18} color={theme.colors.text} />}
              onPress={share}
            />
          </View>
          {onWithdraw ? (
            <View style={{ flex: 1 }}>
              <Button
                label={t('learning.withdraw')}
                variant="danger"
                loading={withdrawing}
                onPress={onWithdraw}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
