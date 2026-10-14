import NetInfo from '@react-native-community/netinfo';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, CloudSlash, CloudArrowUp } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api';
import { AppText } from '@/components/ui';
import { flushOutbox, subscribeOutbox, type OutboxItem } from '@/offline/outbox';
import { useTheme } from '@/theme/ThemeProvider';

/** Sends one saved item. Kept here so the outbox knows nothing about the API. */
const send = (item: OutboxItem) => api.markAttendance(item.input);

/**
 * Watches the connection for the whole app. While offline, a thin banner
 * says so and how much work is waiting on the phone; when the connection
 * returns, the waiting work is sent and the banner confirms it. Screens keep
 * showing what they last loaded (the query cache is kept on the phone).
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [justSynced, setJustSynced] = useState(0);
  const wasOffline = useRef(false);

  const sync = async () => {
    const { sent } = await flushOutbox(send);
    if (sent > 0) {
      setJustSynced(sent);
      void queryClient.invalidateQueries();
      setTimeout(() => setJustSynced(0), 5000);
    }
  };

  useEffect(() => subscribeOutbox((items) => setWaiting(items.length)), []);

  useEffect(() => {
    // React Query pauses fetching while offline and resumes on its own.
    onlineManager.setEventListener((setQueryOnline) =>
      NetInfo.addEventListener((s) => setQueryOnline(s.isConnected !== false && s.isInternetReachable !== false)),
    );
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline && wasOffline.current) void sync();
      wasOffline.current = !isOnline;
    });
    // Also try on returning to the app, and once at start, for anything left over.
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void sync();
    });
    void sync();
    return () => {
      unsubscribe();
      appState.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (online && waiting === 0 && justSynced === 0) return null;

  const tone = !online ? theme.colors.warning : justSynced > 0 ? theme.colors.success : theme.colors.info;
  const Icon = !online ? CloudSlash : justSynced > 0 ? CheckCircle : CloudArrowUp;
  const message = !online
    ? waiting > 0
      ? t('offline.offlineWaiting', { count: waiting })
      : t('offline.offline')
    : justSynced > 0
      ? t('offline.synced', { count: justSynced })
      : t('offline.syncing', { count: waiting });

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        paddingTop: insets.top + 4,
        paddingBottom: 6,
        paddingHorizontal: theme.spacing.lg,
        backgroundColor: theme.colors.surfaceAlt,
        borderBottomWidth: 2,
        borderBottomColor: tone,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      <Icon size={16} color={tone} weight="fill" />
      <AppText variant="caption" style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}
