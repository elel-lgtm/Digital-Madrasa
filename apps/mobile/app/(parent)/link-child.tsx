import { RELATIONSHIPS, linkChildSchema, maskAdmissionNo } from '@digital-madrasa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CheckCircle, IdentificationCard } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Button,
  Card,
  OptionGroup,
  PageHeader,
  Screen,
  TextField,
} from '@/components/ui';
import { useFieldError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Relationship = (typeof RELATIONSHIPS)[number];

/**
 * Parent → child linking.
 *
 * The admission number is checked by a rate-limited server call, never by
 * reading the students table, and failure is always the same generic message
 * whether the number doesn't exist or is already linked — anything more
 * specific would let someone enumerate real children.
 */
export default function LinkChild() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const fieldError = useFieldError();
  const queryClient = useQueryClient();

  const [admissionNo, setAdmissionNo] = useState('');
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const link = useMutation({
    mutationFn: api.linkChild,
    onSuccess: (result) => {
      setSentTo(result.madrasaName);
      void queryClient.invalidateQueries({ queryKey: qk.children() });
    },
    onError: () => {
      // Deliberately generic: see the note above.
      setFormError(t('parent.linkFailedBody'));
    },
  });

  const submit = () => {
    setFormError(null);
    const parsed = linkChildSchema.safeParse({ admissionNo, relationship });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    link.mutate(parsed.data);
  };

  if (sentTo) {
    return (
      <Screen>
        <PageHeader title={t('parent.requestSent')} />
        <View style={{ alignItems: 'center', gap: theme.spacing.md, paddingTop: theme.spacing.xxl }}>
          <CheckCircle size={56} color={theme.colors.success} weight="fill" />
          <AppText variant="title" align="center">
            {t('parent.requestSent')}
          </AppText>
          <AppText variant="body" color="textMuted" align="center">
            {t('parent.requestSentBody', { madrasa: sentTo })}
          </AppText>
          <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg }}>
            <Button label={t('common.done')} onPress={() => router.replace('/(parent)/dashboard')} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={t('parent.addChildTitle')} subtitle={t('parent.addChildBody')} showBack />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xl }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
            <IdentificationCard size={26} color={theme.colors.accent} weight="duotone" />
            <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
              {t('parent.admissionNoHint')}
            </AppText>
          </View>
        </Card>

        <TextField
          label={t('parent.admissionNo')}
          value={admissionNo}
          onChangeText={(value) => setAdmissionNo(maskAdmissionNo(value))}
          error={fieldError(errors['admissionNo'])}
          placeholder="DM-2026-0042"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          required
        />

        <OptionGroup
          label={t('parent.relationship')}
          options={RELATIONSHIPS.map((value) => ({ value, label: t(`parent.${value}`) }))}
          value={relationship}
          onChange={setRelationship}
          error={fieldError(errors['relationship'])}
          columns={3}
        />

        {formError ? (
          <Card accent="danger">
            <View style={{ gap: 4 }}>
              <AppText variant="bodyStrong" color="danger">
                {t('parent.linkFailed')}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {formError}
              </AppText>
            </View>
          </Card>
        ) : null}

        <Button
          label={t('parent.sendRequest')}
          size="lg"
          loading={link.isPending}
          onPress={submit}
        />

        <AppText variant="caption" color="textSubtle" align="center">
          {t('parent.requestPending')}
        </AppText>
      </View>
    </Screen>
  );
}
