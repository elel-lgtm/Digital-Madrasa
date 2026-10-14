import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api';

/**
 * Query defaults tuned for the target network: lists go stale after a minute,
 * reference data after five, and the cache survives a cold start so the app
 * opens with content rather than a spinner.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 403 or a rate limit only makes both worse.
        if (error instanceof ApiError) {
          if (['forbidden', 'not_found', 'rate_limited', 'validation'].includes(error.code)) {
            return false;
          }
        }
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Fail at once when offline ("no connection") rather than pausing and
      // firing later: a payment must never start minutes after the tap.
      // Attendance has its own offline queue (offline/outbox.ts).
      networkMode: 'always',
      retry: 0,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'dm.query-cache.v1',
  throttleTime: 2000,
});
