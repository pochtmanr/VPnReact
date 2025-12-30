/**
 * i18n Configuration - Optimized for Performance
 *
 * Uses expo-localization for device locale detection
 * and i18next for translations with minimal overhead.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

// Import only English by default, others loaded on demand
import en from './locales/en.json';

// Storage key for language preference
const LANGUAGE_STORAGE_KEY = '@app_language';

// RTL languages
export const RTL_LANGUAGES: string[] = ['ar', 'fa'];

// All supported language codes
export const SUPPORTED_LANGUAGES = ['en', 'es', 'zh', 'hi', 'ar', 'pt', 'ru', 'ja', 'de', 'fa'];

// Language display names (in their native language)
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  zh: '中文',
  hi: 'हिन्दी',
  ar: 'العربية',
  pt: 'Português',
  ru: 'Русский',
  ja: '日本語',
  de: 'Deutsch',
  fa: 'فارسی',
};

// Language flag emojis for visual identification
export const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  zh: '🇨🇳',
  hi: '🇮🇳',
  ar: '🇸🇦',
  pt: '🇧🇷',
  ru: '🇷🇺',
  ja: '🇯🇵',
  de: '🇩🇪',
  fa: '🇮🇷',
};

// Get the device's preferred language
const getDeviceLanguage = (): string => {
  try {
    const locales = Localization.getLocales();
    if (!locales || locales.length === 0) return 'en';

    const languageCode = locales[0].languageCode || 'en';

    // Check if we support this language
    if (SUPPORTED_LANGUAGES.includes(languageCode)) {
      return languageCode;
    }
  } catch (error) {
    console.warn('Failed to get device language:', error);
  }

  return 'en';
};

// Check if current language is RTL
export const isRTL = (language: string): boolean => {
  return RTL_LANGUAGES.includes(language);
};

// Configure RTL based on language
export const configureRTL = (language: string): void => {
  const shouldBeRTL = isRTL(language);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
  }
};

// Lazy load language resources
const loadLanguageResources = async (lang: string): Promise<Record<string, unknown>> => {
  switch (lang) {
    case 'es':
      return (await import('./locales/es.json')).default;
    case 'zh':
      return (await import('./locales/zh.json')).default;
    case 'hi':
      return (await import('./locales/hi.json')).default;
    case 'ar':
      return (await import('./locales/ar.json')).default;
    case 'pt':
      return (await import('./locales/pt.json')).default;
    case 'ru':
      return (await import('./locales/ru.json')).default;
    case 'ja':
      return (await import('./locales/ja.json')).default;
    case 'de':
      return (await import('./locales/de.json')).default;
    case 'fa':
      return (await import('./locales/fa.json')).default;
    default:
      return en;
  }
};

// Initialize i18n with optimized settings
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: 'en', // Start with English, load correct language async
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged', // Only re-render on language change
      bindI18nStore: '', // Don't bind to store events
    },
    keySeparator: '.',
    nsSeparator: ':',
    defaultNS: 'translation',
    debug: false, // Disable debug even in dev for performance
    saveMissing: false,
    load: 'languageOnly', // Don't load region-specific (en-US -> en)
    cleanCode: true,
    initImmediate: true, // Init immediately without waiting
  });

// Load initial language asynchronously after init
const initializeLanguage = async () => {
  try {
    // First check for saved language preference
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    const targetLang = savedLanguage && SUPPORTED_LANGUAGES.includes(savedLanguage)
      ? savedLanguage
      : getDeviceLanguage();

    if (targetLang !== 'en') {
      const resources = await loadLanguageResources(targetLang);
      i18n.addResourceBundle(targetLang, 'translation', resources, true, true);
      await i18n.changeLanguage(targetLang);
      configureRTL(targetLang);
    }
  } catch (error) {
    console.warn('Failed to initialize language:', error);
  }
};

// Run initialization
initializeLanguage();

export default i18n;

// Utility function to change language with lazy loading
export const changeLanguage = async (language: string): Promise<void> => {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    console.warn(`Language ${language} is not supported`);
    return;
  }

  // Load resources if not already loaded
  if (!i18n.hasResourceBundle(language, 'translation')) {
    try {
      const resources = await loadLanguageResources(language);
      i18n.addResourceBundle(language, 'translation', resources, true, true);
    } catch (error) {
      console.warn('Failed to load language resources:', error);
      return;
    }
  }

  await i18n.changeLanguage(language);
  configureRTL(language);

  // Save language preference to storage
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.warn('Failed to save language preference:', error);
  }
};

// Get current language
export const getCurrentLanguage = (): string => {
  return i18n.language;
};

// Format number according to locale
export const formatNumber = (num: number, locale?: string): string => {
  const currentLocale = locale || i18n.language;
  return new Intl.NumberFormat(currentLocale).format(num);
};

// Format date according to locale
export const formatDate = (
  date: Date,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string => {
  const currentLocale = locale || i18n.language;
  return new Intl.DateTimeFormat(currentLocale, options).format(date);
};
