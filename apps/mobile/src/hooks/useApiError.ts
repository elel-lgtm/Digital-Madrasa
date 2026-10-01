import { useTranslation } from 'react-i18next';
import { ApiError } from '@/api';

export interface FriendlyError {
  title: string;
  body: string;
  offline: boolean;
}

/**
 * Turns whatever the API threw into copy a parent in Mandera can act on.
 * Error text always says what happened *and* what to do next.
 */
export function useApiError() {
  const { t } = useTranslation();

  return (error: unknown): FriendlyError => {
    if (error instanceof ApiError) {
      switch (error.code) {
        case 'invalid_credentials':
          return {
            title: t('errors.genericTitle'),
            body: t('errors.invalidCredentials'),
            offline: false,
          };
        case 'rate_limited':
          return {
            title: t('errors.genericTitle'),
            body: t('errors.rateLimited', {
              minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)),
            }),
            offline: false,
          };
        case 'forbidden':
          return { title: t('errors.genericTitle'), body: t('errors.forbidden'), offline: false };
        case 'not_found':
          return { title: t('errors.genericTitle'), body: t('errors.notFound'), offline: false };
        case 'madrasa_suspended':
          return {
            title: t('errors.genericTitle'),
            body: t('errors.madrasaSuspended'),
            offline: false,
          };
        case 'card_unavailable':
          return { title: t('errors.genericTitle'), body: t('errors.cardUnavailable'), offline: false };
        case 'payment_in_progress':
          return { title: t('errors.genericTitle'), body: t('errors.paymentInProgress'), offline: false };
        case 'payment_provider':
          return { title: t('errors.genericTitle'), body: t('errors.paymentProvider'), offline: false };
        case 'network':
          return {
            title: t('errors.networkTitle'),
            body: t('errors.networkBody'),
            offline: true,
          };
        default:
          return {
            title: t('errors.genericTitle'),
            body: error.message || t('errors.genericBody'),
            offline: false,
          };
      }
    }
    return { title: t('errors.genericTitle'), body: t('errors.genericBody'), offline: false };
  };
}

/** Maps a Zod issue message (which is an i18n key) to localised copy. */
export function useFieldError() {
  const { t } = useTranslation();
  return (message: string | undefined): string | undefined => {
    if (!message) return undefined;
    return message.includes('.') ? t(message) : message;
  };
}
