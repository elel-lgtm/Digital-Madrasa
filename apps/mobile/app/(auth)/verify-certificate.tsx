import type { VerifiedCertificate } from '@digital-madrasa/shared';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, SealWarning, XCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { AppText, Button, Card, PageHeader, Screen, TextField } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate } from '@/utils/dates';

/**
 * Anyone holding a certificate code — a school, an employer, a relative —
 * can confirm it here without an account. The server answers with the
 * certificate itself and nothing more (verify_certificate, migration 0023).
 */
export default function VerifyCertificate() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VerifiedCertificate | null | undefined>(undefined);

  const check = useMutation({
    mutationFn: (value: string) => api.verifyCertificate(value),
    onSuccess: (found) => setResult(found),
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          <Button
            label={t('learning.verifyAction')}
            size="lg"
            loading={check.isPending}
            disabled={code.replace(/[^a-z0-9]/gi, '').length !== 10}
            onPress={() => check.mutate(code)}
          />
        }
      >
        <PageHeader title={t('learning.verifyTitle')} showBack />
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <AppText variant="body" color="textMuted">
            {t('learning.verifyBody')}
          </AppText>
          <TextField
            label={t('learning.verificationCode')}
            value={code}
            onChangeText={(value) => {
              setCode(value.toUpperCase());
              setResult(undefined);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            placeholder="ABCD2345EF"
          />

          {check.isError ? (
            <AppText variant="caption" color="danger">
              {describeError(check.error).body}
            </AppText>
          ) : null}

          {result === null ? (
            <Card accent="danger">
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
                <XCircle size={28} color={theme.colors.danger} weight="duotone" />
                <AppText variant="body" style={{ flex: 1 }}>
                  {t('learning.notFound')}
                </AppText>
              </View>
            </Card>
          ) : null}

          {result ? (
            <Card accent={result.valid ? 'success' : 'warning'}>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
                  {result.valid ? (
                    <CheckCircle size={28} color={theme.colors.success} weight="duotone" />
                  ) : (
                    <SealWarning size={28} color={theme.colors.warning} weight="duotone" />
                  )}
                  <AppText variant="subheading" style={{ flex: 1 }}>
                    {result.valid ? t('learning.valid') : t('learning.invalid')}
                  </AppText>
                </View>
                <AppText variant="bodyStrong">{result.title}</AppText>
                <AppText variant="body">
                  {t('learning.awardedTo')}: {result.studentName}
                </AppText>
                <AppText variant="body">
                  {t('learning.issuedBy')}: {result.madrasaName}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {t('learning.issuedOn')}: {longDate(result.issuedAt)}
                </AppText>
                {result.sanad && result.sanad.length > 0 ? (
                  <AppText variant="caption">
                    {t('sanad.title')}: {result.sanad.join(' ← ')}
                  </AppText>
                ) : null}
              </View>
            </Card>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
