import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
  Modal,
  FlatList,
  Switch,
  TextInput,
} from 'react-native';

import Animated, {
  FadeInDown,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Wifi,
  ShieldAlert,
  ShieldOff,
  Globe,
  ChevronRight,
  Lock,
  Gauge,
  Clock,
  X,
  Users,
  Eye,
  Ban,
  Smartphone,
  Shield,
  Search,
  Heart,
  Crown,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { useVPN } from '@/context/VPNContext';
import { useAuth } from '@/context/AuthContext';
import { useParentalControls } from '@/context/ParentalControlsContext';
import { useTier } from '@/context/TierContext';
import { ScrollShadow, QuickStatsRow } from '@/components/ui';
import { useServerTranslation } from '@/hooks/useServerTranslation';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { VPNServer } from '@/types/database';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const BUTTON_SIZE = 160;

// Helper to get country flag emoji
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t('common.time.morning');
  if (hour < 18) return t('common.time.afternoon');
  return t('common.time.evening');
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

// Simple Server Modal (replaces @gorhom/bottom-sheet which caused Android freeze)
function ServerModal({
  visible,
  onClose,
  servers,
  selectedServer,
  onServerSelect,
  favorites,
  onToggleFavorite,
  isPremiumLocked,
}: {
  visible: boolean;
  onClose: () => void;
  servers: VPNServer[];
  selectedServer: VPNServer | null;
  onServerSelect: (server: VPNServer) => void;
  favorites: string[];
  onToggleFavorite: (serverId: string) => void;
  isPremiumLocked: (server: VPNServer) => boolean;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { getServerCity, getServerCountry } = useServerTranslation();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort servers
  const filteredServers = React.useMemo(() => {
    let filtered = servers;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = servers.filter(server => {
        const cityName = getServerCity(server).toLowerCase();
        const countryName = getServerCountry(server).toLowerCase();
        return (
          cityName.includes(query) ||
          countryName.includes(query) ||
          server.country_code.toLowerCase().includes(query)
        );
      });
    }

    // Sort: favorites first, then by country
    return [...filtered].sort((a, b) => {
      const aIsFavorite = favorites.includes(a.id);
      const bIsFavorite = favorites.includes(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return getServerCountry(a).localeCompare(getServerCountry(b));
    });
  }, [servers, searchQuery, favorites, getServerCity, getServerCountry]);

  const renderServer = ({ item }: { item: VPNServer }) => {
    const isSelected = selectedServer?.id === item.id;
    const isFavorite = favorites.includes(item.id);
    const isLocked = isPremiumLocked(item);

    return (
      <Pressable
        onPress={() => {
          if (!isLocked) {
            onServerSelect(item);
            onClose();
          }
        }}
        disabled={isLocked}
        style={[
          styles.serverItem,
          {
            backgroundColor: isLocked
              ? isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'
              : isSelected
                ? isDark ? `${colors.success}15` : `${colors.success}08`
                : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderColor: isLocked
              ? isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
              : isSelected
                ? colors.success
                : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <View style={styles.serverFlagContainer}>
          <Text style={[styles.serverFlag, isLocked && { opacity: 0.5 }]}>
            {getCountryFlag(item.country_code)}
          </Text>
          {isLocked && (
            <View style={styles.serverLockOverlay}>
              <Lock size={12} color="#FFD700" />
            </View>
          )}
        </View>
        <View style={styles.serverTextContainer}>
          <View style={styles.serverNameRow}>
            <Text style={[styles.serverName, { color: isLocked ? colors.textMuted : colors.text }]}>
              {getServerCity(item)}
            </Text>
            {isLocked && (
              <View style={styles.serverPremiumBadge}>
                <Crown size={10} color="#FFD700" />
                <Text style={styles.serverPremiumText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={[styles.serverCountry, { color: isLocked ? colors.textMuted : colors.textSecondary }]}>
            {getServerCountry(item)}
          </Text>
        </View>

        {/* Favorite button */}
        {!isLocked && (
          <Pressable
            onPress={() => onToggleFavorite(item.id)}
            hitSlop={8}
            style={[
              styles.serverFavoriteButton,
              {
                backgroundColor: isFavorite
                  ? isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'
                  : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              }
            ]}
          >
            <Heart
              size={14}
              color={isFavorite ? '#EF4444' : colors.textMuted}
              fill={isFavorite ? '#EF4444' : 'transparent'}
            />
          </Pressable>
        )}

        {/* Status badge */}
        {isLocked ? (
          <View style={[styles.selectedBadge, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
            <Lock size={12} color="#FFD700" />
            <Text style={[styles.selectedText, { color: '#FFD700' }]}>{t('server.locked')}</Text>
          </View>
        ) : isSelected ? (
          <View style={[styles.selectedBadge, { backgroundColor: colors.success }]}>
            <Text style={styles.selectedText}>{t('server.selected')}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('server.title')}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={[
            styles.serverSearchContainer,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            }
          ]}>
            <Search size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.serverSearchInput, { color: colors.text }]}
              placeholder={t('server.search')}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={filteredServers}
            renderItem={renderServer}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.serverList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.serverEmptyState}>
                <Text style={[styles.serverEmptyText, { color: colors.textMuted }]}>
                  {searchQuery ? t('server.empty.title') : t('server.empty.subtitle')}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// Connection Button Component
interface ConnectionButtonProps {
  isConnected: boolean;
  isConnecting: boolean;
  isError: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  serverLocation?: string;
  t: (key: string) => string;
}

function ConnectionButton({ isConnected, isConnecting, isError, onConnect, onDisconnect, serverLocation, t }: ConnectionButtonProps) {
  const { colors, isDark } = useTheme();
  const isFocused = useIsFocused();

  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
      pulseScale.value = 1;
      glowOpacity.value = isConnected ? 0.25 : 0;
      return;
    }

    if (isConnected) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 2000 }),
          withTiming(0.25, { duration: 2000 })
        ),
        -1,
        true
      );
    } else if (isConnecting) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
      glowOpacity.value = withTiming(0.35, { duration: 300 });
    } else if (isError) {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0.4, { duration: 300 });
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    }

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
    };
  }, [isConnected, isConnecting, isError, isFocused, pulseScale, glowOpacity]);

  const handlePress = () => {
    if (isConnecting) return;

    scale.value = withSequence(
      withSpring(0.94, { damping: 12, stiffness: 400 }),
      withSpring(1, { damping: 12, stiffness: 400 })
    );

    if (isConnected) {
      onDisconnect();
    } else {
      onConnect();
    }
  };

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: glowOpacity.value,
  }));

  const iconColor = isConnected ? '#FFFFFF' : isConnecting ? '#FFFFFF' : isError ? '#FFFFFF' : colors.textMuted;
  const StatusIcon = isConnected ? ShieldCheck : isConnecting ? Wifi : isError ? ShieldAlert : ShieldOff;
  const glowColor = isConnected ? colors.success : isConnecting ? '#3B82F6' : isError ? '#EF4444' : 'transparent';

  const gradientColors: [string, string] = isConnected
    ? [colors.success, '#16A34A']
    : isConnecting
      ? ['#3B82F6', '#2563EB']
      : isError
        ? ['#EF4444', '#DC2626']
        : isDark
          ? ['#3A3A3E', '#2A2A2E']
          : ['#F5F5F7', '#E8E8ED'];

  const statusTitleColor = isConnected ? colors.success : isConnecting ? '#3B82F6' : isError ? '#EF4444' : colors.text;
  const statusTitle = isConnecting ? t('vpn.connection.connecting') : isConnected ? t('vpn.connection.protected') : isError ? t('vpn.connection.failed') : t('vpn.connection.notConnected');
  const statusSubtitle = isConnecting ? t('vpn.connection.establishing') : isConnected ? serverLocation || t('vpn.connection.tapDisconnect') : isError ? t('vpn.connection.tapRetry') : t('vpn.connection.tapConnect');

  return (
    <View style={styles.buttonContainer}>
      <Animated.View style={[styles.buttonGlow, glowStyle, { backgroundColor: glowColor }]} />
      <AnimatedPressable onPress={handlePress} disabled={isConnecting} style={[styles.connectionButton, buttonStyle]}>
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}>
          <StatusIcon size={56} color={iconColor} strokeWidth={1.8} />
        </LinearGradient>
      </AnimatedPressable>
      <Text style={[styles.buttonStatusTitle, { color: statusTitleColor }]}>{statusTitle}</Text>
      <Text style={[styles.buttonStatusSubtitle, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">{statusSubtitle}</Text>
    </View>
  );
}

// Blocked Widget
const BlockedWidget = React.memo(function BlockedWidget({ isConnected, isEnabled }: { isConnected: boolean; isEnabled: boolean }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const iconColor = isConnected && isEnabled ? '#EF4444' : colors.textMuted;

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/adblock')}
      style={({ pressed }) => [
        styles.squareWidget,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.widgetHeader}>
        <View style={[styles.widgetIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)' }]}>
          <Ban size={20} color={iconColor} />
        </View>
        <Text style={[styles.widgetTitle, { color: colors.text }]} numberOfLines={1}>{t('vpn.widgets.adsBlocked.title')}</Text>
      </View>
      <View style={styles.widgetSpacer} />
      <Text style={[styles.widgetValue, { color: isConnected && isEnabled ? colors.text : colors.textMuted }]}>--</Text>
    </Pressable>
  );
});

// Devices Widget
const DevicesWidget = React.memo(function DevicesWidget({ deviceCount, isVpnConnected, isParentalEnabled, isAdBlockEnabled }: { deviceCount: number; isVpnConnected: boolean; isParentalEnabled: boolean; isAdBlockEnabled: boolean }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const statusDots: Array<{ color: string; key: string }> = [];
  if (isVpnConnected) statusDots.push({ color: '#22C55E', key: 'vpn' });
  if (isParentalEnabled) statusDots.push({ color: '#3B82F6', key: 'parental' });
  if (isAdBlockEnabled) statusDots.push({ color: '#EF4444', key: 'adblock' });

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/profile')}
      style={({ pressed }) => [
        styles.squareWidget,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.widgetHeader}>
        <View style={[styles.widgetIcon, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
          <Smartphone size={20} color="#3B82F6" />
        </View>
        <Text style={[styles.widgetTitle, { color: colors.text }]}>{t('vpn.widgets.devices.title')}</Text>
      </View>
      <View style={styles.widgetSpacer} />
      <View style={styles.widgetBottom}>
        <Text style={[styles.widgetValue, { color: colors.text }]}>{deviceCount}</Text>
        {statusDots.length > 0 && (
          <View style={styles.statusDots}>
            {statusDots.map((dot) => (
              <View key={dot.key} style={[styles.statusDot, { backgroundColor: dot.color }]} />
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isAuthenticated, devices } = useAuth();
  const { getServerCity, getServerCountry } = useServerTranslation();
  const {
    servers,
    selectedServer,
    connectionStatus,
    measuredLatency,
    adBlockEnabled,
    setAdBlockEnabled,
    connect,
    disconnect,
    selectServer,
    refreshServers,
    loadServersIfNeeded,
    retryConnection,
  } = useVPN();
  const { isEnabled: parentalEnabled, toggleParentalControls, isToggling: isParentalToggling } = useParentalControls();
  const { isPro } = useTier();

  const { hasAccess: hasFilterAccess, requestAccess: requestFilterAccess, isGating: isFilterGating, getDisabledReason: getFilterDisabledReason } = useFeatureGate('content_filter', { requiresVPN: true, isVPNConnected: connectionStatus === 'connected' });
  const { hasAccess: hasAdBlockAccess, requestAccess: requestAdBlockAccess, isGating: isAdBlockGating, getDisabledReason: getAdBlockDisabledReason } = useFeatureGate('ad_blocking', { requiresVPN: true, isVPNConnected: connectionStatus === 'connected' });

  const [refreshing, setRefreshing] = useState(false);
  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [favoriteServers, setFavoriteServers] = useState<string[]>([]);

  const isLoggedIn = isAuthenticated;
  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';
  const isError = connectionStatus === 'error';

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshServers();
    setRefreshing(false);
  };

  const handleServerSelect = useCallback((server: typeof servers[0]) => {
    if (connectionStatus === 'disconnected') {
      selectServer(server);
    }
  }, [connectionStatus, selectServer]);

  const handleToggleFavorite = useCallback((serverId: string) => {
    setFavoriteServers(prev =>
      prev.includes(serverId)
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  }, []);

  // Check if a server is premium-locked (for non-pro users)
  // Currently all servers are available, but this can be extended
  // to lock certain servers based on tier or server properties
  const checkIsPremiumLocked = useCallback((server: VPNServer): boolean => {
    // Example: lock servers marked as premium for free users
    // For now, return false (all servers available)
    // To enable: return !isPro && server.is_premium;
    return false;
  }, []);

  const openServerModal = () => {
    loadServersIfNeeded();
    setServerModalVisible(true);
  };

  const handleFilterToggle = useCallback(async (newValue: boolean) => {
    if (isParentalToggling || isFilterGating) return;
    if (!newValue) {
      try { await toggleParentalControls(false); } catch {}
      return;
    }
    const granted = await requestFilterAccess();
    if (!granted) return;
    try { await toggleParentalControls(true); } catch {}
  }, [isParentalToggling, isFilterGating, toggleParentalControls, requestFilterAccess]);

  const handleAdBlockToggle = useCallback(async (newValue: boolean) => {
    if (isAdBlockGating) return;
    if (!newValue) { setAdBlockEnabled(false); return; }
    const granted = await requestAdBlockAccess();
    if (granted) setAdBlockEnabled(true);
  }, [isAdBlockGating, setAdBlockEnabled, requestAdBlockAccess]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient colors={isDark ? ['#000000', '#0a0a0a', '#000000'] : ['#ffffff', '#fafafa', '#f5f5f5']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {/* Header */}
          <AnimatedView entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))} style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{getGreeting(t)}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{isConnected ? t('vpn.connection.secure') : t('vpn.connection.connectPrompt')}</Text>
          </AnimatedView>

          {/* Connection Card */}
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.connectionCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)', borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}
          >
            <ConnectionButton
              isConnected={isConnected}
              isConnecting={isConnecting}
              isError={isError}
              onConnect={connect}
              onDisconnect={disconnect}
              serverLocation={selectedServer ? `${getServerCity(selectedServer)}, ${getServerCountry(selectedServer)}` : undefined}
              t={t}
            />
            <QuickStatsRow
              stats={[
                { icon: Lock, iconColor: isConnected ? colors.primary : colors.textMuted, value: selectedServer?.protocol === 'wireguard' ? 'WireGuard' : '--', label: t('server.protocol') },
                { icon: Gauge, iconColor: isConnected ? colors.info : colors.textMuted, value: isConnected && measuredLatency ? `${measuredLatency}ms` : selectedServer?.latency_ms ? `${selectedServer.latency_ms}ms` : '--', label: t('vpn.stats.latency') },
                { icon: Clock, iconColor: isConnected ? colors.success : colors.textMuted, value: isConnected ? t('vpn.stats.active') : isConnecting ? t('vpn.stats.connecting') : t('vpn.stats.idle'), label: t('vpn.stats.status') },
              ]}
            />
          </AnimatedView>

          {/* Server Selection Button */}
          <AnimatedView entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}>
            <Pressable
              onPress={openServerModal}
              disabled={isConnecting || isConnected}
              style={({ pressed }) => [
                styles.serverSelectButton,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)', borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', opacity: (isConnecting || isConnected) ? 0.6 : pressed ? 0.8 : 1 },
              ]}
            >
              <View style={styles.serverSelectLeft}>
                <View style={[styles.serverSelectIcon, { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` }]}>
                  {selectedServer ? <Text style={styles.serverIconFlag}>{getCountryFlag(selectedServer.country_code)}</Text> : <Globe size={22} color={colors.primary} />}
                </View>
                <View style={styles.serverSelectTextContainer}>
                  <Text style={[styles.serverSelectLabel, { color: (isConnecting || isConnected) ? colors.textMuted : colors.text }]} numberOfLines={1}>{selectedServer ? getServerCity(selectedServer) : t('vpn.serverSelect.title')}</Text>
                  <Text style={[styles.serverSelectSubLabel, { color: colors.textSecondary }]} numberOfLines={1}>{(isConnecting || isConnected) ? t('vpn.serverSelect.disconnectToChange') : selectedServer ? getServerCountry(selectedServer) : t('vpn.serverSelect.serversAvailable', { count: servers.length })}</Text>
                </View>
              </View>
              <View style={styles.serverSelectRight}>{(isConnecting || isConnected) ? <Lock size={18} color={colors.textMuted} /> : <ChevronRight size={20} color={colors.textMuted} />}</View>
            </Pressable>
          </AnimatedView>

          {/* Quick Settings */}
          <AnimatedView
            entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.togglesCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)', borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('vpn.quickSettings.title')}</Text>

            {/* Content Filter */}
            <View style={[styles.settingRow, (!isConnected || !hasFilterAccess) && styles.settingRowDisabled]}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: (isConnected && hasFilterAccess) ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)') : (isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)') }]}>
                  <Users size={20} color={(isConnected && hasFilterAccess) ? '#3B82F6' : colors.textMuted} />
                </View>
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: (isConnected && hasFilterAccess) ? colors.text : colors.textMuted }]}>{t('vpn.quickSettings.contentFilter.title')}</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{getFilterDisabledReason() || (parentalEnabled ? t('vpn.quickSettings.contentFilter.active') : t('vpn.quickSettings.contentFilter.description'))}</Text>
                </View>
              </View>
              <Switch value={parentalEnabled} onValueChange={handleFilterToggle} disabled={isFilterGating || isParentalToggling} trackColor={{ false: colors.border, true: '#3B82F6' }} thumbColor={parentalEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'} ios_backgroundColor={colors.border} />
            </View>

            <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />

            {/* Ad Blocker */}
            <View style={[styles.settingRow, (!isConnected || !hasAdBlockAccess) && styles.settingRowDisabled]}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: (isConnected && hasAdBlockAccess) ? (isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)') : (isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)') }]}>
                  <Eye size={20} color={(isConnected && hasAdBlockAccess) ? '#EF4444' : colors.textMuted} />
                </View>
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: (isConnected && hasAdBlockAccess) ? colors.text : colors.textMuted }]}>{t('vpn.quickSettings.adBlocker.title')}</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{getAdBlockDisabledReason() || t('vpn.quickSettings.adBlocker.description')}</Text>
                </View>
              </View>
              <Switch value={adBlockEnabled} onValueChange={handleAdBlockToggle} disabled={isAdBlockGating} trackColor={{ false: colors.border, true: '#3B82F6' }} thumbColor={adBlockEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'} ios_backgroundColor={colors.border} />
            </View>

            {!isLoggedIn && (
              <View style={[styles.loginPrompt, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)' }]}>
                <Lock size={14} color={colors.primary} />
                <Text style={[styles.loginPromptText, { color: colors.primary }]}>{t('vpn.signInPrompt')}</Text>
              </View>
            )}
          </AnimatedView>

          {/* Widgets Row */}
          <AnimatedView entering={FadeInDown.delay(175).duration(300).easing(Easing.out(Easing.ease))} style={styles.widgetsRow}>
            <BlockedWidget isConnected={isConnected} isEnabled={adBlockEnabled} />
            <DevicesWidget deviceCount={devices.length} isVpnConnected={isConnected} isParentalEnabled={parentalEnabled} isAdBlockEnabled={adBlockEnabled} />
          </AnimatedView>

          {/* Info Card */}
          <AnimatedView
            entering={FadeInDown.delay(200).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)', borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)' }]}
          >
            <Shield size={18} color="#3B82F6" />
            <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>{t('vpn.serverInfo')}</Text>
          </AnimatedView>
        </Animated.ScrollView>
      </ScrollShadow>

      {/* Server Modal */}
      <ServerModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
        servers={servers}
        selectedServer={selectedServer}
        onServerSelect={handleServerSelect}
        favorites={favoriteServers}
        onToggleFavorite={handleToggleFavorite}
        isPremiumLocked={checkIsPremiumLocked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  connectionCard: { borderRadius: 24, borderWidth: 1, paddingVertical: 32, paddingHorizontal: 20, marginBottom: 16 },
  buttonContainer: { alignItems: 'center', marginBottom: 20 },
  buttonGlow: { position: 'absolute', width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2 },
  connectionButton: { width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12 },
  buttonGradient: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  buttonStatusTitle: { marginTop: 20, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  buttonStatusSubtitle: { marginTop: 6, fontSize: 14, fontWeight: '400', textAlign: 'center', paddingHorizontal: 20 },
  serverSelectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 16 },
  serverSelectLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  serverSelectTextContainer: { flex: 1 },
  serverSelectIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serverSelectLabel: { fontSize: 16, fontWeight: '600' },
  serverSelectSubLabel: { fontSize: 13, marginTop: 2 },
  serverSelectRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  serverIconFlag: { fontSize: 28 },
  togglesCard: { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 16 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  settingRowDisabled: { opacity: 0.7 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  settingIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingText: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600' },
  settingDescription: { fontSize: 13, marginTop: 2 },
  settingDivider: { height: 1, marginStart: 52 },
  loginPrompt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, padding: 10, borderRadius: 10, gap: 6 },
  loginPromptText: { fontSize: 12, fontWeight: '500' },
  widgetsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  squareWidget: { flex: 1, aspectRatio: 1, borderRadius: 20, borderWidth: 1, padding: 16, justifyContent: 'space-between' },
  widgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  widgetIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  widgetTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  widgetSpacer: { flex: 1 },
  widgetValue: { fontSize: 32, fontWeight: '700' },
  widgetBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  statusDots: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
  // Modal styles - transparent backdrop
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingTop: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(128, 128, 128, 0.2)' },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  closeButton: { padding: 8 },
  serverList: { paddingHorizontal: 20, paddingTop: 16 },
  serverItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  serverFlag: { fontSize: 32 },
  serverFlagContainer: { position: 'relative', marginRight: 14 },
  serverLockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 3,
  },
  serverTextContainer: { flex: 1 },
  serverNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serverName: { fontSize: 16, fontWeight: '600' },
  serverCountry: { fontSize: 13, marginTop: 2 },
  serverPremiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  serverPremiumText: { fontSize: 9, fontWeight: '700', color: '#FFD700' },
  serverFavoriteButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  serverSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 10,
  },
  serverSearchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  serverEmptyState: { alignItems: 'center', paddingVertical: 40 },
  serverEmptyText: { fontSize: 14, textAlign: 'center' },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  selectedText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
