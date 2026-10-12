import type { MailItem, MailKind } from '@digital-madrasa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Envelope,
  Megaphone,
  Receipt,
  TrendUp,
  WarningCircle,
  CalendarX,
  FileText,
  ChatCircleDots,
  CurrencyCircleDollar,
  UserPlus,
  UserCircleCheck,
  Buildings,
  Certificate,
  VideoCamera,
} from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import { api } from '@/api';
import { qk } from '@/api/keys';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  SkeletonList,
} from '@/components/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTheme } from '@/theme/ThemeProvider';
import { longDate, relativeTime } from '@/utils/dates';

const KIND_ICON: Record<MailKind, Icon> = {
  invoice_issued: Receipt,
  payment_receipt: CurrencyCircleDollar,
  fee_reminder: Receipt,
  fee_overdue: WarningCircle,
  attendance_alert: CalendarX,
  report_card: FileText,
  announcement: Megaphone,
  message: ChatCircleDots,
  progress_summary: TrendUp,
  live_session: VideoCamera,
  fee_due: Receipt,
  link_request: UserPlus,
  link_approved: UserCircleCheck,
  madrasa_status: Buildings,
  certificate_issued: Certificate,
};

const URGENT: MailKind[] = ['fee_overdue', 'attendance_alert'];

/**
 * Notification types are written by server functions, so a type added there
 * must never be able to take the inbox down: an unknown type gets a generic
 * icon and label rather than an undefined component.
 */
function iconFor(kind: string): Icon {
  return (KIND_ICON as Record<string, Icon>)[kind] ?? Envelope;
}

export default function ParentInbox() {
  const { t } = useTranslation();
  const theme = useTheme();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<MailItem | null>(null);

  const mail = useQuery({ queryKey: qk.mail(), queryFn: () => api.listMail() });

  const markRead = useMutation({
    mutationFn: (mailId: string) => api.markMailRead(mailId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.mail() }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.markAllMailRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.mail() }),
  });

  const unreadCount = (mail.data ?? []).filter((item) => !item.readAt).length;

  const openItem = (item: MailItem) => {
    setOpen(item);
    if (!item.readAt) markRead.mutate(item.id);
  };

  return (
    <Screen refreshing={mail.isFetching} onRefresh={() => void mail.refetch()}>
      <PageHeader
        title={t('parent.inbox')}
        subtitle={unreadCount > 0 ? t('mail.unread', { count: unreadCount }) : undefined}
        right={
          unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mail.markAllRead')}
              onPress={() => markAllRead.mutate()}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <AppText variant="caption" color="accent">
                {t('mail.markAllRead')}
              </AppText>
            </Pressable>
          ) : undefined
        }
      />

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        {mail.isPending ? (
          <SkeletonList count={5} />
        ) : mail.isError ? (
          <ErrorState
            {...describeError(mail.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void mail.refetch()}
          />
        ) : (mail.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Envelope size={40} color={theme.colors.textSubtle} weight="duotone" />}
            title={t('empty.noMail')}
            body={t('empty.noMailBody')}
          />
        ) : (
          (mail.data ?? []).map((item) => {
            const IconComponent = iconFor(item.kind);
            const unread = !item.readAt;
            return (
              <Card
                key={item.id}
                accent={URGENT.includes(item.kind) ? 'danger' : unread ? 'accent' : undefined}
                onPress={() => openItem(item)}
                accessibilityLabel={item.title}
              >
                <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                  <IconComponent
                    size={22}
                    color={
                      URGENT.includes(item.kind) ? theme.colors.danger : theme.colors.textMuted
                    }
                    weight="duotone"
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                      <AppText
                        variant={unread ? 'bodyStrong' : 'body'}
                        style={{ flex: 1 }}
                        numberOfLines={1}
                      >
                        {item.title}
                      </AppText>
                      <AppText variant="caption" color="textSubtle">
                        {relativeTime(item.createdAt, t)}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="textMuted" numberOfLines={2}>
                      {item.preview}
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                      <Badge label={t(`mail.${item.kind}`, { defaultValue: t('mail.notice') })} tone={unread ? 'accent' : 'neutral'} />
                      {item.attachmentLabel ? <Badge label={item.attachmentLabel} /> : null}
                    </View>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </View>

      <Modal
        visible={open !== null}
        animationType="slide"
        onRequestClose={() => setOpen(null)}
        presentationStyle="pageSheet"
      >
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.lg }}>
              <Badge label={open ? t(`mail.${open.kind}`) : ''} tone="accent" />
              <AppText variant="title">{open?.title}</AppText>
              <AppText variant="caption" color="textSubtle">
                {open ? longDate(open.createdAt) : ''}
              </AppText>
            </View>
            <AppText variant="body" color="textMuted">
              {open?.body}
            </AppText>
            {open?.attachmentLabel ? (
              <Card>
                <AppText variant="bodyStrong">{open.attachmentLabel}</AppText>
                <AppText variant="caption" color="textSubtle">
                  {t('common.download')}
                </AppText>
              </Card>
            ) : null}
            <Button label={t('common.close')} variant="secondary" onPress={() => setOpen(null)} />
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}
