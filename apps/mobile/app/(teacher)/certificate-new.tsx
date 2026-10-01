import {
  CERTIFICATE_KINDS,
  completedJuz,
  issueCertificateSchema,
  type Certificate,
} from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Button,
  OptionGroup,
  PageHeader,
  Screen,
  SkeletonList,
  TextField,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

type Kind = Certificate['kind'];

/**
 * Awarding a certificate. Juz and whole-Quran certificates can only be
 * offered for what the memorisation record actually shows, so a certificate
 * never contradicts the progress a parent can see. The verification code is
 * issued by the database, not here.
 */
export default function NewCertificate() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const { studentId = '', name } = useLocalSearchParams<{ studentId: string; name?: string }>();

  const [kind, setKind] = useState<Kind>('juz_completion');
  const [juz, setJuz] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const hifz = useQuery({
    queryKey: qk.hifz(studentId),
    queryFn: () => api.listHifzProgress(studentId),
    enabled: Boolean(studentId),
  });
  const done = useMemo(() => completedJuz(hifz.data ?? []), [hifz.data]);

  const issue = useMutation({
    mutationFn: api.issueCertificate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.certificates(studentId) });
      void queryClient.invalidateQueries({ queryKey: qk.student(studentId) });
      // Opened by a link there is nothing to go back to; land on the pupil.
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/(teacher)/student/[id]', params: { id: studentId } });
    },
    onError: (error) => setFormError(describeError(error).body),
  });

  const suggestedTitle =
    kind === 'juz_completion' && juz
      ? `Memorisation of Juz ${juz}`
      : kind === 'quran_completion'
        ? 'Memorisation of the Holy Quran'
        : '';

  const blocked =
    (kind === 'juz_completion' && (done.length === 0 || !juz)) ||
    (kind === 'quran_completion' && done.length < 30);

  const submit = () => {
    setFormError(null);
    const parsed = issueCertificateSchema.safeParse({
      studentId,
      kind,
      title: title.trim() || suggestedTitle,
    });
    if (!parsed.success) {
      setFormError(t('validation.title_too_short'));
      return;
    }
    issue.mutate(parsed.data);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          <Button
            label={t('learning.award')}
            size="lg"
            loading={issue.isPending}
            disabled={blocked}
            onPress={submit}
          />
        }
      >
        <PageHeader title={t('learning.awardCertificate')} subtitle={name ?? undefined} showBack />

        {hifz.isPending ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <SkeletonList count={3} />
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
            <OptionGroup
              label={t('learning.kind')}
              options={CERTIFICATE_KINDS.map((value) => ({ value, label: t(`learning.kind_${value}`) }))}
              value={kind}
              onChange={(value) => {
                setKind(value);
                setTitle('');
              }}
              columns={1}
            />

            {kind === 'juz_completion' ? (
              done.length === 0 ? (
                <AppText variant="body" color="textMuted">
                  {t('learning.noCompletedJuz')}
                </AppText>
              ) : (
                <OptionGroup
                  label={t('learning.completedJuz', { list: done.join(', ') })}
                  options={done.map((n) => ({ value: String(n), label: `Juz ${n}` }))}
                  value={juz}
                  onChange={setJuz}
                  columns={3}
                />
              )
            ) : null}

            {kind === 'quran_completion' && done.length < 30 ? (
              <AppText variant="body" color="textMuted">
                {t('learning.quranNotComplete')}
              </AppText>
            ) : null}

            <TextField
              label={t('learning.certTitle')}
              value={title}
              onChangeText={setTitle}
              placeholder={suggestedTitle || 'Tajweed Level 1'}
            />

            {formError ? (
              <AppText variant="caption" color="danger">
                {formError}
              </AppText>
            ) : null}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
