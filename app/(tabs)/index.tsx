import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Pressable,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  MapPin,
  Gauge,
  Globe,
  Lock,
  Wifi,
  Eye,
  ChevronRight,
  Download,
  Users,
  Clock,
} from 'lucide-react-native';
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
import { useIsFocused } from '@react-navigation/native';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useVPN } from '@/context/VPNContext';
import { useParentalControls } from '@/context/ParentalControlsContext';
import { useTier } from '@/context/TierContext';
import ServerBottomSheet, { ServerBottomSheetRef } from '@/components/ServerBottomSheet';
import { ScrollShadow, QuickStatsRow } from '@/components/ui';
import { UpgradeBanner } from '@/components/tier';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const BUTTON_SIZE = 160;

// Connection Button Component with integrated shield icon
interface ConnectionButtonProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  serverLocation?: string;
}

function ConnectionButton({ isConnected, isConnecting, onConnect, onDisconnect, serverLocation }: ConnectionButtonProps) {
  const { colors, isDark } = useTheme();
  const isFocused = useIsFocused();

  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  // Stop animations when tab is not focused to prevent performance issues
  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
      pulseScale.value = 1;
      glowOpacity.value = isConnected ? 0.25 : 0;
      return;
    }

    if (isConnected) {
      // Subtle pulsing glow when connected
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
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    }

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
    };
  }, [isConnected, isConnecting, isFocused, pulseScale, glowOpacity]);

  const handlePress = () => {
    if (isConnecting) return;

    // Press feedback animation
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

  const iconColor = isConnected
    ? '#FFFFFF'
    : isConnecting
      ? '#FFFFFF'
      : colors.textMuted;

  const StatusIcon = isConnected ? ShieldCheck : isConnecting ? Wifi : ShieldOff;

  return (
    <View style={styles.buttonContainer}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.buttonGlow,
          glowStyle,
          {
            backgroundColor: isConnected ? colors.success : isConnecting ? '#3B82F6' : 'transparent',
          },
        ]}
      />

      {/* Main button */}
      <AnimatedPressable
        onPress={handlePress}
        disabled={isConnecting}
        style={[styles.connectionButton, buttonStyle]}
      >
        <LinearGradient
          colors={isConnected
            ? [colors.success, '#16A34A']
            : isConnecting
              ? ['#3B82F6', '#2563EB']
              : isDark
                ? ['#3A3A3E', '#2A2A2E']
                : ['#F5F5F7', '#E8E8ED']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.buttonGradient}
        >
          <StatusIcon
            size={56}
            color={iconColor}
            strokeWidth={1.8}
          />
        </LinearGradient>
      </AnimatedPressable>

      {/* Status label */}
      <Text style={[styles.buttonStatusTitle, {
        color: isConnected ? colors.success : isConnecting ? '#3B82F6' : colors.text
      }]}>
        {isConnecting
          ? 'Connecting'
          : isConnected
            ? 'Protected'
            : 'Not Connected'}
      </Text>

      {/* Server location or action hint */}
      <Text style={[styles.buttonStatusSubtitle, { color: colors.textSecondary }]}>
        {isConnecting
          ? 'Establishing secure connection...'
          : isConnected
            ? serverLocation || 'Tap to disconnect'
            : 'Tap to connect'}
      </Text>
    </View>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { isAuthenticated } = useAuth();
  const {
    servers,
    selectedServer,
    connectionStatus,
    favorites,
    isProfileInstalled,
    isCheckingProfile,
    adBlockEnabled,
    setAdBlockEnabled,
    connect,
    disconnect,
    selectServer,
    toggleFavorite,
    refreshServers,
    installVPNProfile,
  } = useVPN();
  const {
    isEnabled: parentalEnabled,
    toggleParentalControls,
  } = useParentalControls();
  const { hasFeature, isPro, tierDisplayName } = useTier();
  const hasParentalAccess = hasFeature('parental_controls');
  const hasAdBlockAccess = hasFeature('ad_blocking');

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const bottomSheetRef = useRef<ServerBottomSheetRef>(null);

  const isLoggedIn = isAuthenticated;
  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';
  const [isInstallingProfile, setIsInstallingProfile] = useState(false);

  // Handle VPN profile installation
  const handleInstallProfile = async () => {
    setIsInstallingProfile(true);
    try {
      await installVPNProfile();
    } finally {
      setIsInstallingProfile(false);
    }
  };

  async function handleRefresh() {
    setRefreshing(true);
    await refreshServers();
    setRefreshing(false);
  }

  const handleServerSelect = useCallback((server: typeof servers[0]) => {
    if (connectionStatus === 'disconnected') {
      selectServer(server);
      bottomSheetRef.current?.close();
    }
  }, [connectionStatus, selectServer]);

  const handleToggleFavorite = useCallback((serverId: string) => {
    toggleFavorite(serverId);
  }, [toggleFavorite]);

  const isPremiumLocked = useCallback((server: typeof servers[0]) =>
    server.is_premium && !isPro,
    [isPro]
  );

  // Helper to get country flag emoji from country code
  const getCountryFlag = (countryCode: string): string => {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  const openServerSheet = () => {
    bottomSheetRef.current?.open();
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        <LinearGradient
          colors={isDark
            ? ['#000000', '#0a0a0a', '#000000']
            : ['#ffffff', '#fafafa', '#f5f5f5']
          }
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        <ScrollShadow size={60}>
          <Animated.ScrollView
            style={styles.scrollView}
            contentContainerStyle={{
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 100,
              paddingHorizontal: 20,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          >
          {/* Header */}
          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.header}
          >
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  {getGreeting()}
                </Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                  {isConnected
                    ? 'Your connection is secure'
                    : 'Connect to protect your privacy'}
                </Text>
              </View>
              <View
                style={[
                  styles.tierBadge,
                  {
                    backgroundColor: isPro
                      ? (isDark ? '#FFD70020' : '#FFD70015')
                      : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                  },
                ]}
              >
                {isPro && (
                  <Shield size={14} color="#FFD700" />
                )}
                <Text
                  style={[
                    styles.tierText,
                    {
                      color: isPro ? '#FFD700' : colors.textSecondary,
                    },
                  ]}
                >
                  {tierDisplayName.toUpperCase()}
                </Text>
              </View>
            </View>
          </AnimatedView>

          {/* VPN Profile Installation Banner */}
          {!isCheckingProfile && !isProfileInstalled && (
            <AnimatedView
              entering={FadeInDown.delay(25).duration(300).easing(Easing.out(Easing.ease))}
              style={[
                styles.profileBanner,
                {
                  backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                  borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)',
                },
              ]}
            >
              <View style={styles.profileBannerContent}>
                <View
                  style={[
                    styles.profileBannerIcon,
                    { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)' },
                  ]}
                >
                  <Download size={20} color="#3B82F6" />
                </View>
                <View style={styles.profileBannerText}>
                  <Text style={[styles.profileBannerTitle, { color: colors.text }]}>
                    VPN Setup Required
                  </Text>
                  <Text style={[styles.profileBannerSubtitle, { color: colors.textSecondary }]}>
                    Install VPN profile to enable protection
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={handleInstallProfile}
                disabled={isInstallingProfile}
                style={({ pressed }) => [
                  styles.profileBannerButton,
                  {
                    backgroundColor: pressed ? '#2563EB' : '#3B82F6',
                    opacity: isInstallingProfile ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={styles.profileBannerButtonText}>
                  {isInstallingProfile ? 'Installing...' : 'Install'}
                </Text>
              </Pressable>
            </AnimatedView>
          )}

          {/* Connection Card */}
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.connectionCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            {/* Connection Button with integrated status */}
            <ConnectionButton
              isConnected={isConnected}
              isConnecting={isConnecting}
              onConnect={connect}
              onDisconnect={disconnect}
              serverLocation={selectedServer ? `${selectedServer.city}, ${selectedServer.country}` : undefined}
            />

            {/* Connection Stats - Always visible */}
            <QuickStatsRow
              stats={[
                {
                  icon: MapPin,
                  iconColor: isConnected ? colors.primary : colors.textMuted,
                  value: selectedServer ? selectedServer.city : '--',
                  label: 'Server',
                },
                {
                  icon: Gauge,
                  iconColor: isConnected ? colors.info : colors.textMuted,
                  value: selectedServer ? `${selectedServer.latency_ms || '--'}ms` : '--',
                  label: 'Latency',
                },
                {
                  icon: Clock,
                  iconColor: isConnected ? colors.success : colors.textMuted,
                  value: isConnected ? 'Active' : 'Idle',
                  label: 'Status',
                },
              ]}
            />
          </AnimatedView>

          {/* Server Selection Button */}
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
          >
            <Pressable
              onPress={openServerSheet}
              style={({ pressed }) => [
                styles.serverSelectButton,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <View style={styles.serverSelectLeft}>
                <View
                  style={[
                    styles.serverSelectIcon,
                    { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` },
                  ]}
                >
                  <Globe size={22} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.serverSelectLabel, { color: colors.text }]}>
                    {selectedServer ? selectedServer.city : 'Select Server'}
                  </Text>
                  <Text style={[styles.serverSelectSubLabel, { color: colors.textSecondary }]}>
                    {selectedServer
                      ? `${selectedServer.country} • ${selectedServer.latency_ms || '--'}ms`
                      : `${servers.length} servers available`}
                  </Text>
                </View>
              </View>
              <View style={styles.serverSelectRight}>
                {selectedServer && (
                  <Text style={styles.serverSelectFlag}>{getCountryFlag(selectedServer.country_code)}</Text>
                )}
                <ChevronRight size={20} color={colors.textMuted} />
              </View>
            </Pressable>
          </AnimatedView>

          {/* Upgrade Banner for Free Users */}
          {!isPro && (
            <AnimatedView
              entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
              style={styles.upgradeBannerContainer}
            >
              <UpgradeBanner />
            </AnimatedView>
          )}

          {/* Quick Settings */}
          <AnimatedView
            entering={FadeInDown.delay(isPro ? 125 : 150).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.togglesCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Settings</Text>

            {/* Parental Controls - Primary Position */}
            <View style={[styles.settingRow, (!isConnected || !hasParentalAccess) && styles.settingRowDisabled]}>
              <View style={styles.settingLeft}>
                <View style={[
                  styles.settingIcon,
                  {
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                    opacity: (isConnected && hasParentalAccess) ? 1 : 0.5,
                  }
                ]}>
                  <Users size={20} color={(isConnected && hasParentalAccess) ? '#3B82F6' : colors.textMuted} />
                </View>
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: (isConnected && hasParentalAccess) ? colors.text : colors.textMuted }]}>
                    Parental Controls
                  </Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    {!hasParentalAccess
                      ? 'Upgrade to Pro to enable'
                      : !isConnected
                        ? 'Connect VPN to enable'
                        : parentalEnabled
                          ? 'Content filtering active'
                          : 'Protect children from harmful content'}
                  </Text>
                </View>
              </View>
              <Switch
                value={parentalEnabled}
                onValueChange={toggleParentalControls}
                disabled={!isConnected || !hasParentalAccess}
                trackColor={{ false: colors.border, true: '#3B82F6' }}
                thumbColor={parentalEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
                ios_backgroundColor={colors.border}
                style={{ opacity: (isConnected && hasParentalAccess) ? 1 : 0.5 }}
              />
            </View>

            <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />

            {/* Ad Blocker */}
            <View style={[styles.settingRow, (!isConnected || !hasAdBlockAccess) && styles.settingRowDisabled]}>
              <View style={styles.settingLeft}>
                <View style={[
                  styles.settingIcon,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                    opacity: (isConnected && hasAdBlockAccess) ? 1 : 0.5,
                  }
                ]}>
                  <Eye size={20} color={(isConnected && hasAdBlockAccess) ? '#EF4444' : colors.textMuted} />
                </View>
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: (isConnected && hasAdBlockAccess) ? colors.text : colors.textMuted }]}>
                    Ad Blocker
                  </Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    {!hasAdBlockAccess
                      ? 'Upgrade to Pro to enable'
                      : !isConnected
                        ? 'Connect VPN to enable'
                        : 'Block ads & trackers'}
                  </Text>
                </View>
              </View>
              <Switch
                value={adBlockEnabled}
                onValueChange={setAdBlockEnabled}
                disabled={!isConnected || !hasAdBlockAccess}
                trackColor={{ false: colors.border, true: '#3B82F6' }}
                thumbColor={adBlockEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
                ios_backgroundColor={colors.border}
                style={{ opacity: (isConnected && hasAdBlockAccess) ? 1 : 0.5 }}
              />
            </View>

            {!isLoggedIn && (
              <View
                style={[
                  styles.loginPrompt,
                  { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)' },
                ]}
              >
                <Lock size={14} color={colors.primary} />
                <Text style={[styles.loginPromptText, { color: colors.primary }]}>
                  Sign in to save your preferences
                </Text>
              </View>
            )}
          </AnimatedView>

          {/* Info Card */}
          <AnimatedView
            entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.infoCard,
              {
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
                borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
              },
            ]}
          >
            <Shield size={18} color="#3B82F6" />
            <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
              Select a server and tap to connect. Your traffic will be encrypted and routed through our secure servers.
            </Text>
          </AnimatedView>
        </Animated.ScrollView>
        </ScrollShadow>

        {/* Server Bottom Sheet */}
        <ServerBottomSheet
          ref={bottomSheetRef}
          servers={servers}
          favorites={favorites}
          selectedServer={selectedServer}
          isConnected={isConnected}
          onServerSelect={handleServerSelect}
          onToggleFavorite={handleToggleFavorite}
          isPremiumLocked={isPremiumLocked}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  tierText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Profile Banner
  profileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  profileBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  profileBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBannerText: {
    flex: 1,
  },
  profileBannerTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  profileBannerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  profileBannerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  profileBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Connection Card
  connectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  // Connection Button
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonGlow: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
  },
  connectionButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonStatusTitle: {
    marginTop: 20,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  buttonStatusSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '400',
  },
  // Server Select Button
  serverSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  serverSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serverSelectIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverSelectLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  serverSelectSubLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  serverSelectRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serverSelectFlag: {
    fontSize: 24,
  },
  // Quick Settings Card
  togglesCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingRowDisabled: {
    opacity: 0.7,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  settingDivider: {
    height: 1,
    marginLeft: 52,
  },
  loginPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    gap: 6,
  },
  loginPromptText: {
    fontSize: 12,
    fontWeight: '500',
  },
  upgradeBannerContainer: {
    marginBottom: 16,
  },
  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
