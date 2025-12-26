import BottomSheet, {
  BottomSheetBackdropProps,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import {
  CheckCircle2,
  Circle,
  Server,
  Shield,
  ShieldCheck,
  Signal,
  Zap,
} from 'lucide-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
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
}

// Blur Backdrop Component - separated to properly use hooks
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
        style,
        StyleSheet.absoluteFill,
        containerStyle,
      ]}
      pointerEvents="auto"
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        <BlurView
          tint={isDark ? 'dark' : 'light'}
          intensity={50}
          style={StyleSheet.absoluteFill}
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
  onPress,
}: {
  server: VPNServer;
  isSelected: boolean;
  isConnected: boolean;
  onPress: () => void;
}) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.serverCard,
        {
          backgroundColor: isSelected
            ? isDark ? `${colors.success}15` : `${colors.success}08`
            : isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: isSelected
            ? colors.success
            : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          transform: [{ scale: pressed ? 0.98 : 1 }],
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
            <Text style={styles.flagEmoji}>{getCountryFlag(server.country_code)}</Text>
          </View>
          <View style={styles.serverInfo}>
            <Text style={[styles.serverName, { color: colors.text }]}>
              {server.city}
            </Text>
            <Text style={[styles.serverLocation, { color: colors.textSecondary }]}>
              {server.country}
            </Text>
          </View>
        </View>

        {/* Status Badge */}
        <View style={[
          styles.statusBadge,
          {
            backgroundColor: isConnected
              ? `${colors.success}20`
              : isSelected
                ? `${colors.primary}20`
                : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          }
        ]}>
          {isConnected ? (
            <CheckCircle2 size={14} color={colors.success} />
          ) : isSelected ? (
            <Circle size={14} color={colors.primary} />
          ) : (
            <Circle size={14} color={colors.textMuted} />
          )}
          <Text style={[
            styles.statusText,
            {
              color: isConnected
                ? colors.success
                : isSelected
                  ? colors.primary
                  : colors.textMuted
            }
          ]}>
            {isConnected ? 'Connected' : isSelected ? 'Selected' : 'Available'}
          </Text>
        </View>
      </View>

      {/* Server Stats */}
      <View style={[styles.statsContainer, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
        <View style={styles.statItem}>
          <Signal size={16} color={colors.success} />
          <View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {server.latency_ms != null ? `${server.latency_ms}ms` : 'N/A'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Latency</Text>
          </View>
        </View>

        <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]} />

        <View style={styles.statItem}>
          <Zap size={16} color={colors.warning} />
          <View>
            <Text style={[styles.statValue, { color: colors.text }]}>WireGuard</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Protocol</Text>
          </View>
        </View>

        <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]} />

        <View style={styles.statItem}>
          <ShieldCheck size={16} color={colors.info} />
          <View>
            <Text style={[styles.statValue, { color: colors.text }]}>256-bit</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Encryption</Text>
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
      selectedServer,
      isConnected,
      onServerSelect,
    },
    ref
  ) => {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const bottomSheetRef = React.useRef<BottomSheet>(null);

    // Single snap point at 85% - opens directly to this height
    const snapPoints = useMemo(() => ['85%'], []);

    // Expose open/close methods
    useImperativeHandle(ref, () => ({
      open: () => bottomSheetRef.current?.snapToIndex(0),
      close: () => bottomSheetRef.current?.close(),
    }));

    // Filter to only show WireGuard servers
    const wireGuardServers = useMemo(() => {
      return servers.filter(server =>
        server.protocol === 'wireguard' ||
        server.config_data?.includes('privateKey') ||
        server.config_data?.includes('PrivateKey')
      );
    }, [servers]);

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
                  VPN Server
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                  Your private WireGuard server
                </Text>
              </View>
            </View>
          </View>

          {/* Server List */}
          <BottomSheetScrollView
            style={styles.serversList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {wireGuardServers.length > 0 ? (
              wireGuardServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isSelected={selectedServer?.id === server.id}
                  isConnected={isConnected && selectedServer?.id === server.id}
                  onPress={() => onServerSelect(server)}
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
                  No Server Available
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Your WireGuard server will appear here once configured
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
                WireGuard provides fast, modern VPN encryption with minimal overhead.
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
});
