/**
 * Language Context
 *
 * Provides language switching functionality and persists language preference.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  changeLanguage,
  getCurrentLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  isRTL,
} from '../i18n';

const LANGUAGE_STORAGE_KEY = '@app_language';

interface LanguageContextType {
  currentLanguage: string;
  languageName: string;
  isRTL: boolean;
  supportedLanguages: string[];
  languageNames: Record<string, string>;
  setLanguage: (language: string) => Promise<void>;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(getCurrentLanguage());
  const [isLoading, setIsLoading] = useState(true);

  // Load saved language preference on mount
  useEffect(() => {
    const loadSavedLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (savedLanguage && SUPPORTED_LANGUAGES.includes(savedLanguage)) {
          await changeLanguage(savedLanguage);
          setCurrentLanguage(savedLanguage);
        }
      } catch (error) {
        console.error('Failed to load saved language:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSavedLanguage();
  }, []);

  const setLanguage = useCallback(async (language: string) => {
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      console.warn(`Language ${language} is not supported`);
      return;
    }

    try {
      await changeLanguage(language);
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      setCurrentLanguage(language);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  }, []);

  const value: LanguageContextType = {
    currentLanguage,
    languageName: LANGUAGE_NAMES[currentLanguage] || currentLanguage,
    isRTL: isRTL(currentLanguage),
    supportedLanguages: SUPPORTED_LANGUAGES,
    languageNames: LANGUAGE_NAMES,
    setLanguage,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
