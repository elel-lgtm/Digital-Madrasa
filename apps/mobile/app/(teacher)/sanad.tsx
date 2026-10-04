import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '@/api';
import { AppText, Button, Card, PageHeader, Screen, SkeletonList, TextField } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A teacher's own chain of transmission (sanad): the sheikh who gave them
 * ijazah first, then that sheikh's sheikh, and so on. It is printed on every
 * ijazah they award. The database keeps a snapshot on each certificate, so a
 * later change here never rewrites one already issued.
 */
export default function SanadScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();

  const current = useQuery({ queryKey: ['my-sanad'], queryFn: () => api.getMySanad() });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current.data) setText(current.data.join('\n'));
  }, [current.data]);

  const save = useMutation({
    mutationFn: (chain: string[]) => api.setMySanad(chain),
    onSuccess: (chain) => {
      queryClient.setQueryData(['my-sanad'], chain);
      setSaved(true);
    },
    onError: (err) => setError(describeError(err).body),
  });

  const chain = text.split('\n').map((n) => n.trim()).filter(Boolean);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          <Button
            label={t('common.save')}
            size="lg"
            loading={save.isPending}
            onPress={() => {
              setError(null);
              setSaved(false);
              save.mutate(chain);
            }}
          />
        }
      >
        <PageHeader title={t('sanad.title')} subtitle={t('sanad.subtitle')} showBack />
        {current.isPending ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <SkeletonList count={3} />
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
            <TextField
              label={t('sanad.fieldLabel')}
              value={text}
              onChangeText={(value) => {
                setText(value);
                setSaved(false);
              }}
              placeholder={'Sheikh …\nSheikh …'}
              multiline
              numberOfLines={8}
              hint={t('sanad.hint')}
            />
            {chain.length > 0 ? (
              <Card>
                <View style={{ gap: theme.spacing.xs }}>
                  <AppText variant="label" color="textMuted" uppercase>
                    {t('sanad.preview')}
                  </AppText>
                  <AppText variant="body">{[t('sanad.you'), ...chain].join(' ← ')}</AppText>
                </View>
              </Card>
            ) : null}
            {saved ? (
              <AppText variant="caption" color="success">
                {t('sanad.saved')}
              </AppText>
            ) : null}
            {error ? (
              <AppText variant="caption" color="danger">
                {error}
              </AppText>
            ) : null}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
