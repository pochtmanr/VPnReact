/**
 * useServerTranslation Hook
 *
 * Provides server name translations from Supabase with caching.
 * Falls back to English (original server data) when translations unavailable.
 *
 * Architecture:
 * - Fetches translations from Supabase `server_translations` table
 * - Caches translations in memory for performance
 * - Integrates with i18n for automatic language detection
 * - Supports adding new languages without app updates
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { ServerTranslation, VPNServer, TranslatedServer } from '@/types/database';

// In-memory cache for translations
// Key: `${serverId}_${languageCode}`, Value: ServerTranslation
const translationCache = new Map<string, ServerTranslation>();

// Track which languages have been fully fetched
const fetchedLanguages = new Set<string>();

// Cache expiry time (15 minutes)
const CACHE_EXPIRY_MS = 15 * 60 * 1000;
let lastFetchTime: number | null = null;

export interface UseServerTranslationResult {
  // Get translated server name for display
  getServerCity: (server: VPNServer) => string;
  getServerCountry: (server: VPNServer) => string;
  getServerDescription: (server: VPNServer) => string | null;

  // Translate entire server object
  translateServer: (server: VPNServer) => TranslatedServer;
  translateServers: (servers: VPNServer[]) => TranslatedServer[];

  // State
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshTranslations: () => Promise<void>;
  preloadTranslations: (languageCode: string) => Promise<void>;
}

export function useServerTranslation(): UseServerTranslationResult {
  const { i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const currentLanguage = i18n.language;

  // Fetch translations for a specific language
  const fetchTranslations = useCallback(async (languageCode: string): Promise<void> => {
    // Check if we already have this language cached and it's not expired
    const now = Date.now();
    if (
      fetchedLanguages.has(languageCode) &&
      lastFetchTime &&
      now - lastFetchTime < CACHE_EXPIRY_MS
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('server_translations')
        .select('*')
        .eq('language_code', languageCode);

      if (fetchError) {
        // If table doesn't exist, silently use defaults
        if (fetchError.code === '42P01') {
          console.log('server_translations table not found, using defaults');
          return;
        }
        throw fetchError;
      }

      if (data) {
        // Update cache with new translations
        data.forEach((translation: ServerTranslation) => {
          const cacheKey = `${translation.server_id}_${translation.language_code}`;
          translationCache.set(cacheKey, translation);
        });

        fetchedLanguages.add(languageCode);
        lastFetchTime = now;

        // Trigger re-render to use new translations
        forceUpdate(prev => prev + 1);
      }
    } catch (err) {
      console.warn('Failed to fetch server translations:', err);
      // Don't set error state for missing table - use fallback silently
      if (err instanceof Error && !err.message.includes('42P01')) {
        setError('Failed to load translations');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch translations when language changes
  useEffect(() => {
    if (currentLanguage && currentLanguage !== 'en') {
      fetchTranslations(currentLanguage);
    }
  }, [currentLanguage, fetchTranslations]);

  // Get translation from cache
  const getTranslation = useCallback((serverId: string): ServerTranslation | null => {
    const cacheKey = `${serverId}_${currentLanguage}`;
    return translationCache.get(cacheKey) || null;
  }, [currentLanguage]);

  // Get translated city name
  const getServerCity = useCallback((server: VPNServer): string => {
    if (currentLanguage === 'en') {
      return server.city;
    }
    const translation = getTranslation(server.id);
    return translation?.city_name || server.city;
  }, [currentLanguage, getTranslation]);

  // Get translated country name
  const getServerCountry = useCallback((server: VPNServer): string => {
    if (currentLanguage === 'en') {
      return server.country;
    }
    const translation = getTranslation(server.id);
    return translation?.country_name || server.country;
  }, [currentLanguage, getTranslation]);

  // Get translated description
  const getServerDescription = useCallback((server: VPNServer): string | null => {
    if (currentLanguage === 'en') {
      return null; // No description in base server data
    }
    const translation = getTranslation(server.id);
    return translation?.description || null;
  }, [currentLanguage, getTranslation]);

  // Translate entire server object
  const translateServer = useCallback((server: VPNServer): TranslatedServer => {
    return {
      ...server,
      translated_city: getServerCity(server),
      translated_country: getServerCountry(server),
      translated_description: getServerDescription(server) || undefined,
    };
  }, [getServerCity, getServerCountry, getServerDescription]);

  // Translate array of servers
  const translateServers = useCallback((servers: VPNServer[]): TranslatedServer[] => {
    return servers.map(translateServer);
  }, [translateServer]);

  // Refresh translations (clear cache and refetch)
  const refreshTranslations = useCallback(async (): Promise<void> => {
    translationCache.clear();
    fetchedLanguages.clear();
    lastFetchTime = null;

    if (currentLanguage !== 'en') {
      await fetchTranslations(currentLanguage);
    }
  }, [currentLanguage, fetchTranslations]);

  // Preload translations for a specific language
  const preloadTranslations = useCallback(async (languageCode: string): Promise<void> => {
    await fetchTranslations(languageCode);
  }, [fetchTranslations]);

  return {
    getServerCity,
    getServerCountry,
    getServerDescription,
    translateServer,
    translateServers,
    isLoading,
    error,
    refreshTranslations,
    preloadTranslations,
  };
}

/**
 * SQL for creating the server_translations table in Supabase:
 *
 * CREATE TABLE server_translations (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   server_id UUID NOT NULL REFERENCES vpn_servers(id) ON DELETE CASCADE,
 *   language_code VARCHAR(5) NOT NULL,
 *   city_name VARCHAR(100) NOT NULL,
 *   country_name VARCHAR(100) NOT NULL,
 *   description TEXT,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW(),
 *   UNIQUE(server_id, language_code)
 * );
 *
 * CREATE INDEX idx_server_translations_language ON server_translations(language_code);
 * CREATE INDEX idx_server_translations_server ON server_translations(server_id);
 *
 * -- Enable Row Level Security
 * ALTER TABLE server_translations ENABLE ROW LEVEL SECURITY;
 *
 * -- Allow public read access
 * CREATE POLICY "Allow public read access" ON server_translations
 *   FOR SELECT USING (true);
 *
 * -- Example data:
 * INSERT INTO server_translations (server_id, language_code, city_name, country_name, description) VALUES
 *   ('your-server-uuid', 'ru', 'Нью-Йорк', 'США', 'Быстрый сервер в США'),
 *   ('your-server-uuid', 'es', 'Nueva York', 'Estados Unidos', 'Servidor rápido en EE.UU.');
 */
