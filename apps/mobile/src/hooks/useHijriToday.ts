import { formatHijri, isRamadan } from '@digital-madrasa/shared';
import { useTranslation } from 'react-i18next';

/**
 * Today's date in the Hijri calendar, in the interface language, with a
 * Ramadan greeting during Ramadan. The civil (arithmetic) calendar can differ
 * by a day from a locally announced date; it is shown for orientation only.
 */
export function useHijriToday(): string {
  const { t, i18n } = useTranslation();
  const today = new Date();
  const date = formatHijri(today, i18n.language);
  return isRamadan(today) ? `${t('hijri.ramadanMubarak')} · ${date}` : date;
}
