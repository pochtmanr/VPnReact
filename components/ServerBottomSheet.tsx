import BottomSheet, {
  BottomSheetBackdropProps,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import {
  CheckCircle2,
  Circle,
  Crown,
  Heart,
  Lock,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Signal,
  X,
  Zap,
} from 'lucide-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/context/ThemeContext';
import { useServerTranslation } from '@/hooks/useServerTranslation';
import { VPNServer } from '@/types/database';

export interface ServerBottomSheetRef {
  open: () => void;
  close: () => void;
}

// Helper to get country flag emoji from country code
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

interface ServerBottomSheetProps {
  servers: VPNServer[];
  favorites: string[];
  selectedServer: VPNServer | null;
  isConnected: boolean;
  onServerSelect: (server: VPNServer) => void;
  onToggleFavorite: (serverId: string) => void;
  isPremiumLocked: (server: VPNServer) => boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpen?: () => void;
}

// Blur Backdrop Component - separated to properly use hooks
// Provides modal-like overlay that covers the entire screen including navbar
function BlurBackdrop({ animatedIndex, style, onPress, isDark }: {
  animatedIndex: any;
  style?: any;
  onPress: () => void;
  isDark: boolean;
}) {
  const containerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [-1, 0],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        style,
        containerStyle,
        // Ensure backdrop covers everything including tab bar
        { top: 0, left: 0, right: 0, bottom: 0 },
      ]}
      pointerEvents="auto"
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        <BlurView
          tint={isDark ? 'dark' : 'light'}
          intensity={60}
          style={StyleSheet.absoluteFill}
        />
        {/* Additional dark overlay for better modal feel */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)' }
          ]}
        />
      </Pressable>
    </Animated.View>
  );
}

// Server Card Component - HeroUI inspired design
function ServerCard({
  server,
  isSelected,
  isConnected,
  isFavorite,
  isPremiumLocked,
  onPress,
  onToggleFavorite,
  cityName,
  countryName,
}: {
  server: VPNServer;
  isSelected: boolean;
  isConnected: boolean;
  isFavorite: boolean;
  isPremiumLocked: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  cityName: string;
  countryName: string;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      disabled={isPremiumLocked}
      style={({ pressed }) => [
        styles.serverCard,
        {
          backgroundColor: isPremiumLocked
            ? isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)'
            : isSelected
              ? isDark ? `${colors.success}15` : `${colors.success}08`
              : isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: isPremiumLocked
            ? isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
            : isSelected
              ? colors.success
              : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          transform: [{ scale: pressed && !isPremiumLocked ? 0.98 : 1 }],
        },
      ]}
    >
      {/* Server Header */}
      <View style={styles.cardHeader}>
        <View style={styles.serverIdentity}>
          <View style={[
            styles.flagContainer,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)' }
          ]}>
            <Text style={[styles.flagEmoji, isPremiumLocked && { opacity: 0.5 }]}>
              {getCountryFlag(server.country_code)}
            </Text>
            {isPremiumLocked && (
              <View style={styles.lockOverlay}>
                <Lock size={16} color="#FFD700" />
              </View>
            )}
          </View>
          <View style={styles.serverInfo}>
            <View style={styles.serverNameRow}>
              <Text
                style={[
                  styles.serverName,
                  { color: isPremiumLocked ? colors.textMuted : colors.text }
                ]}
                numberOfLines={1}
              >
                {cityName}
              </Text>
              {isPremiumLocked && (
                <View style={styles.premiumBadge}>
                  <Crown size={12} color="#FFD700" />
                  <Text style={styles.premiumText}>PRO</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.serverLocation,
                { color: isPremiumLocked ? colors.textMuted : colors.textSecondary }
              ]}
              numberOfLines={1}
            >
              {countryName}
            </Text>
          </View>
        </View>

        {/* Favorite & Status */}
        <View style={styles.cardActions}>
          {!isPremiumLocked && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onToggleFavorite();
              }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.favoriteButton,
                {
                  backgroundColor: isFavorite
                    ? isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'
                    : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  transform: [{ scale: pressed ? 0.9 : 1 }],
                }
              ]}
            >
              <Heart
                size={16}
                color={isFavorite ? '#EF4444' : colors.textMuted}
                fill={isFavorite ? '#EF4444' : 'transparent'}
              />
            </Pressable>
          )}

          {/* Status Badge */}
          <View style={[
            styles.statusBadge,
            {
              backgroundColor: isPremiumLocked
                ? isDark ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255, 215, 0, 0.1)'
                : isConnected
                  ? `${colors.success}20`
                  : isSelected
                    ? `${colors.primary}20`
                    : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            }
          ]}>
            {isPremiumLocked ? (
              <>
                <Lock size={14} color="#FFD700" />
                <Text style={[styles.statusText, { color: '#FFD700' }]}>
                  {t('server.locked')}
                </Text>
              </>
            ) : isConnected ? (
              <>
                <CheckCircle2 size={14} color={colors.success} />
                <Text style={[styles.statusText, { color: colors.success }]}>
                  {t('common.status.connected')}
                </Text>
              </>
            ) : isSelected ? (
              <>
                <Circle size={14} color={colors.primary} />
                <Text style={[styles.statusText, { color: colors.primary }]}>
                  {t('server.selected')}
                </Text>
              </>
            ) : (
              <>
                <Circle size={14} color={colors.textMuted} />
                <Text style={[styles.statusText, { color: colors.textMuted }]}>
                  {t('server.available')}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Server Stats */}
      <View style={[
        styles.statsContainer,
        {
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          opacity: isPremiumLocked ? 0.5 : 1,
        }
      ]}>
        <View style={styles.statItem}>
          <Signal size={16} color={isPremiumLocked ? colors.textMuted : colors.success} />
          <View>
            <Text style={[styles.statValue, { color: isPremiumLocked ? colors.textMuted : colors.text }]}>
              {server.latency_ms != null ? `${server.latency_ms}ms` : 'N/A'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('vpn.stats.latency')}</Text>
          </View>
        </View>

        <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]} />

        <View style={styles.statItem}>
          <Zap size={16} color={isPremiumLocked ? colors.textMuted : colors.warning} />
          <View>
            <Text style={[styles.statValue, { color: isPremiumLocked ? colors.textMuted : colors.text }]}>WireGuard</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('server.protocol')}</Text>
          </View>
        </View>

        <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]} />

        <View style={styles.statItem}>
          <ShieldCheck size={16} color={isPremiumLocked ? colors.textMuted : colors.info} />
          <View>
            <Text style={[styles.statValue, { color: isPremiumLocked ? colors.textMuted : colors.text }]}>256-bit</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{t('server.encryption')}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const ServerBottomSheet = forwardRef<ServerBottomSheetRef, ServerBottomSheetProps>(
  (
    {
      servers,
      favorites,
      selectedServer,
      isConnected,
      onServerSelect,
      onToggleFavorite,
      isPremiumLocked,
      searchQuery,
      onSearchChange,
      onOpen,
    },
    ref
  ) => {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { getServerCity, getServerCountry } = useServerTranslation();
    const bottomSheetRef = React.useRef<BottomSheet>(null);

    // Single snap point at 85% - opens directly to this height
    const snapPoints = useMemo(() => ['85%'], []);

    // Expose open/close methods
    useImperativeHandle(ref, () => ({
      open: () => {
        // Trigger lazy loading of servers when opening
        onOpen?.();
        bottomSheetRef.current?.snapToIndex(0);
      },
      close: () => bottomSheetRef.current?.close(),
    }));

    // Filter to only show WireGuard servers and apply search
    const filteredServers = useMemo(() => {
      const wireGuardServers = servers.filter(server =>
        server.protocol === 'wireguard' ||
        server.config_data?.includes('privateKey') ||
        server.config_data?.includes('PrivateKey')
      );

      // Apply search filter
      if (!searchQuery.trim()) {
        return wireGuardServers;
      }

      const query = searchQuery.toLowerCase().trim();
      return wireGuardServers.filter(server => {
        const cityName = getServerCity(server).toLowerCase();
        const countryName = getServerCountry(server).toLowerCase();
        return (
          cityName.includes(query) ||
          countryName.includes(query) ||
          server.country_code.toLowerCase().includes(query)
        );
      });
    }, [servers, searchQuery, getServerCity, getServerCountry]);

    // Sort servers: favorites first, then by country
    const sortedServers = useMemo(() => {
      return [...filteredServers].sort((a, b) => {
        const aIsFavorite = favorites.includes(a.id);
        const bIsFavorite = favorites.includes(b.id);
        if (aIsFavorite && !bIsFavorite) return -1;
        if (!aIsFavorite && bIsFavorite) return 1;
        return getServerCountry(a).localeCompare(getServerCountry(b));
      });
    }, [filteredServers, favorites, getServerCountry]);

    // Blur backdrop using the separated component
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BlurBackdrop
          animatedIndex={props.animatedIndex}
          style={props.style}
          onPress={() => bottomSheetRef.current?.close()}
          isDark={isDark}
        />
      ),
      [isDark]
    );

    // Handle background style
    const handleStyle = useMemo(
      () => ({
        backgroundColor: isDark ? 'rgba(10, 10, 10, 0.95)' : 'rgba(250, 250, 250, 0.95)',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }),
      [isDark]
    );

    const handleIndicatorStyle = useMemo(
      () => ({
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
        width: 40,
        height: 4,
      }),
      [isDark]
    );

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        animateOnMount={true}
        backdropComponent={renderBackdrop}
        handleStyle={handleStyle}
        handleIndicatorStyle={handleIndicatorStyle}
        backgroundStyle={{
          backgroundColor: isDark ? 'rgba(10, 10, 10, 0.98)' : 'rgba(250, 250, 250, 0.98)',
        }}
        style={styles.bottomSheet}
        // Cover the entire screen including status bar/notch area
        topInset={0}
        // Ensure modal-like behavior
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <View style={[
                styles.headerIcon,
                { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` }
              ]}>
                <Server size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  {t('server.title')}
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                  {t('server.subtitle')}
                </Text>
              </View>
            </View>
          </View>

          {/* Search Bar */}
          <View style={[
            styles.searchContainer,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            }
          ]}>
            <Search size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('server.search')}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => onSearchChange('')}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.clearButton,
                  { transform: [{ scale: pressed ? 0.9 : 1 }] }
                ]}
              >
                <X size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Server List */}
          <BottomSheetScrollView
            style={styles.serversList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {sortedServers.length > 0 ? (
              sortedServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isSelected={selectedServer?.id === server.id}
                  isConnected={isConnected && selectedServer?.id === server.id}
                  isFavorite={favorites.includes(server.id)}
                  isPremiumLocked={isPremiumLocked(server)}
                  onPress={() => onServerSelect(server)}
                  onToggleFavorite={() => onToggleFavorite(server.id)}
                  cityName={getServerCity(server)}
                  countryName={getServerCountry(server)}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <View style={[
                  styles.emptyIcon,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }
                ]}>
                  <Server size={32} color={colors.textMuted} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {t('server.empty.title')}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {t('server.empty.subtitle')}
                </Text>
              </View>
            )}

            {/* Info Section */}
            <View style={[
              styles.infoSection,
              {
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
                borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
              }
            ]}>
              <Shield size={18} color="#3B82F6" />
              <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                {t('server.info')}
              </Text>
            </View>
          </BottomSheetScrollView>
        </View>
      </BottomSheet>
    );
  }
);

ServerBottomSheet.displayName = 'ServerBottomSheet';

export default ServerBottomSheet;

const styles = StyleSheet.create({
  bottomSheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  serversList: {
    flex: 1,
  },
  // Server Card
  serverCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  serverIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  flagContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagEmoji: {
    fontSize: 30,
  },
  serverInfo: {
    gap: 3,
  },
  serverName: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  serverLocation: {
    fontSize: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Stats
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 10,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  // Info Section
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
  },
  // Server Card extras
  serverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    padding: 4,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  premiumText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFD700',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  favoriteButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
