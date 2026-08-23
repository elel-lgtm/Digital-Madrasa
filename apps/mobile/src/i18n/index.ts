import { RTL_LOCALES, SUPPORTED_LOCALES, type Locale } from '@digital-madrasa/shared';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import ar from './locales/ar.json';
import en from './locales/en.json';
import so from './locales/so.json';
import sw from './locales/sw.json';

/**
 * English is the complete catalogue and the fallback. Kiswahili, Somali and
 * Arabic cover the surfaces parents and students touch most; anything not yet
 * translated falls back to English rather than rendering a raw key.
 */
export const resources = {
  en: { translation: en },
  sw: { translation: sw },
  so: { translation: so },
  ar: { translation: ar },
} as const;

function isSupported(tag: string): tag is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(tag);
}

export function resolveDeviceLocale(): Locale {
  const preferred = Localization.getLocales();
  for (const entry of preferred) {
    const tag = entry.languageCode ?? '';
    if (isSupported(tag)) return tag;
  }
  return 'en';
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

let initialised = false;

export function initI18n(locale: Locale): typeof i18n {
  if (!initialised) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: locale,
      fallbackLng: 'en',
      defaultNS: 'translation',
      interpolation: { escapeValue: false },
      returnNull: false,
      compatibilityJSON: 'v4',
    });
    initialised = true;
  } else if (i18n.language !== locale) {
    void i18n.changeLanguage(locale);
  }
  return i18n;
}

/**
 * Applies text direction. React Native needs a reload to fully flip a running
 * bundle, so we only force the flag and let the caller decide whether to
 * prompt for a restart.
 */
export function applyDirection(locale: Locale): { requiresRestart: boolean } {
  const shouldBeRtl = isRtl(locale);
  if (I18nManager.isRTL === shouldBeRtl) return { requiresRestart: false };
  I18nManager.allowRTL(shouldBeRtl);
  I18nManager.forceRTL(shouldBeRtl);
  return { requiresRestart: true };
}

export default i18n;
