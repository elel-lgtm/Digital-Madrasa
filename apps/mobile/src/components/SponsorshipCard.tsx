import type { Student } from '@digital-madrasa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HandHeart } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import { AppText, Badge, Button, Card, Checkbox, TextField } from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Staff: list a pupil for sponsorship, or take them off the list. Listing
 * needs the guardian's agreement, which the database records (migration
 * 0034). Sponsors never see the pupil's name; only this short note.
 */
export function SponsorshipCard({ student }: { student: Student }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const [note, setNote] = useState(student.sponsorshipNote ?? '');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = Boolean(student.sponsorshipOpen);

  const save = useMutation({
    mutationFn: (listing: boolean) =>
      api.setSponsorship({ studentId: student.id, open: listing, note: note.trim() || null, guardianAgreed: agreed }),
    onSuccess: () => {
      setAgreed(false);
      void queryClient.invalidateQueries({ queryKey: qk.student(student.id) });
      void queryClient.invalidateQueries({ queryKey: ['sponsorable'] });
    },
    onError: (err) => setError(describeError(err).body),
  });

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <HandHeart size={22} color={theme.colors.accent} weight="duotone" />
          <AppText variant="subheading" style={{ flex: 1 }}>
            {t('sponsor.cardTitle')}
          </AppText>
          {open ? <Badge label={t('sponsor.listed')} tone="success" /> : null}
        </View>
        <AppText variant="caption" color="textMuted">
          {t('sponsor.cardHint')}
        </AppText>
        {open ? (
          <>
            {student.sponsorshipNote ? <AppText variant="body">“{student.sponsorshipNote}”</AppText> : null}
            <Button label={t('sponsor.unlist')} variant="secondary" loading={save.isPending} onPress={() => save.mutate(false)} />
          </>
        ) : (
          <>
            <TextField
              label={t('sponsor.noteLabel')}
              value={note}
              onChangeText={setNote}
              placeholder={t('sponsor.notePlaceholder')}
              maxLength={200}
              hint={t('sponsor.noteHint')}
            />
            <Checkbox label={t('sponsor.guardianAgreed')} checked={agreed} onChange={setAgreed} />
            <Button
              label={t('sponsor.list')}
              disabled={!agreed}
              loading={save.isPending}
              onPress={() => {
                setError(null);
                save.mutate(true);
              }}
            />
          </>
        )}
        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}
