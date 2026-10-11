import { APP_NAME, type Certificate } from '@digital-madrasa/shared';
import { Certificate as CertificateIcon, FilePdf, ShareNetwork } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';
import { shareCertificatePdf, verifyUrlFor } from '@/certificates/print';
import { env } from '@/config/env';
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

  const [printing, setPrinting] = useState(false);

  const share = () => {
    void Share.share({
      message: `${t('learning.shareText', {
        title: certificate.title,
        name: certificate.studentName,
        madrasa: madrasaName ?? APP_NAME,
        code: certificate.verificationCode,
      })}
${verifyUrlFor(env.supabaseUrl, certificate.verificationCode)}`,
    });
  };

  const pdf = async () => {
    setPrinting(true);
    try {
      await shareCertificatePdf({
        title: certificate.title,
        kindLabel: t(`learning.kind_${certificate.kind}`),
        studentName: certificate.studentName,
        madrasaName: madrasaName ?? APP_NAME,
        issuedAt: certificate.issuedAt,
        verificationCode: certificate.verificationCode,
        sanad: certificate.sanad ?? undefined,
      });
    } finally {
      setPrinting(false);
    }
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
        <Button
          label={t('learning.certificatePdf')}
          icon={<FilePdf size={18} color={theme.colors.textOnAccent} />}
          loading={printing}
          onPress={() => void pdf()}
        />
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
