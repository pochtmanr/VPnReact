import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
  InteractionManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Shield,
  Plus,
  Trash2,
  EyeOff,
  Users,
  Gamepad2,
  PlayCircle,
  Bug,
  Ban,
  BarChart3,
  X,
} from 'lucide-react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import { useVPN } from '@/context/VPNContext';
import {
  useParentalControls,
  CONTENT_CATEGORIES,
  ContentCategory,
  CategoryInfo,
} from '@/context/ParentalControlsContext';
import { ScrollShadow, ActivationButton, QuickStatsRow } from '@/components/ui';
import { useFeatureGate } from '@/hooks/useFeatureGate';

const AnimatedView = Animated.createAnimatedComponent(View);

// =============================================================================
// MEMOIZED SUB-COMPONENTS
// =============================================================================

// Category Icon - Pure function, no hooks needed
const getCategoryIcon = (categoryId: ContentCategory, color: string) => {
  const iconProps = { size: 22, color };
  switch (categoryId) {
    case 'adult':
    case 'gambling':
      return <Ban {...iconProps} />;
    case 'social_media':
      return <Users {...iconProps} />;
    case 'gaming':
      return <Gamepad2 {...iconProps} />;
    case 'streaming':
      return <PlayCircle {...iconProps} />;
    case 'malware':
      return <Bug {...iconProps} />;
    case 'ads_trackers':
      return <EyeOff {...iconProps} />;
    default:
      return <Shield {...iconProps} />;
  }
};

// Category Row Item - Memoized
interface CategoryRowProps {
  category: CategoryInfo;
  isBlocked: boolean;
  onToggle: (category: ContentCategory) => void;
  isDark: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  disabled?: boolean;
}

const CategoryRow = memo(function CategoryRow({
  category,
  isBlocked,
  onToggle,
  isDark,
  colors,
  disabled = false,
}: CategoryRowProps) {
  const handleToggle = useCallback(() => {
    if (!disabled) {
      onToggle(category.id);
    }
  }, [category.id, onToggle, disabled]);

  // When disabled, use muted colors for icon background
  const iconBgColor = useMemo(
    () => disabled
      ? (isDark ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.1)')
      : (isDark ? `${category.color}20` : `${category.color}15`),
    [isDark, category.color, disabled]
  );

  const iconColor = disabled ? colors.textMuted : category.color;

  return (
    <View style={[styles.categoryRow, disabled && styles.disabledRow]}>
      <View style={styles.categoryLeft}>
        <View style={[styles.categoryIcon, { backgroundColor: iconBgColor }]}>
          {getCategoryIcon(category.id, iconColor)}
        </View>
        <View style={styles.categoryText}>
          <Text style={[styles.categoryName, { color: disabled ? colors.textMuted : colors.text }]}>
            {category.name}
          </Text>
          <Text style={[styles.categoryDescription, { color: disabled ? colors.textMuted : colors.textSecondary }]}>
            {category.description}
          </Text>
        </View>
      </View>
      <Switch
        value={disabled ? false : isBlocked}
        onValueChange={handleToggle}
        trackColor={{ false: colors.border, true: '#3B82F6' }}
        thumbColor={isBlocked && !disabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
        ios_backgroundColor={colors.border}
        disabled={disabled}
        style={{ opacity: disabled ? 0.4 : 1 }}
      />
    </View>
  );
});

// Domain Row Item - Memoized
interface DomainRowProps {
  domain: string;
  onRemove: (domain: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  disabled?: boolean;
}

const DomainRow = memo(function DomainRow({ domain, onRemove, colors, disabled = false }: DomainRowProps) {
  const handleRemove = useCallback(() => {
    if (!disabled) {
      onRemove(domain);
    }
  }, [domain, onRemove, disabled]);

  return (
    <View style={[styles.domainRow, disabled && styles.disabledRowStrong]}>
      <Text style={[styles.domainText, { color: disabled ? colors.textMuted : colors.text }]}>{domain}</Text>
      <Pressable onPress={handleRemove} style={[styles.removeButton, { opacity: disabled ? 0.4 : 1 }]} disabled={disabled}>
        <Trash2 size={18} color={disabled ? colors.textMuted : "#EF4444"} />
      </Pressable>
    </View>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ParentalControlsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { connectionStatus } = useVPN();
  const isVPNConnected = connectionStatus === 'connected';

  // Feature gating with automatic paywall
  const {
    hasAccess: hasParentalAccess,
    requestAccess,
    isGating,
    getDisabledReason,
  } = useFeatureGate('parental_controls', {
    requiresVPN: true,
    isVPNConnected,
  });

  const {
    isEnabled,
    blockedCategories,
    customBlockedDomains,
    blockingStats,
    toggleCategory,
    addBlockedDomain,
    removeBlockedDomain,
    toggleParentalControls,
    refreshStats,
    loading,
    isToggling,
    error,
    clearError,
  } = useParentalControls();

  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Show error alert when error occurs
  useEffect(() => {
    if (error) {
      Alert.alert(
        'Connection Error',
        'Unable to connect to the server. Please ensure VPN is connected and try again.',
        [{ text: 'OK', onPress: clearError }]
      );
    }
  }, [error, clearError]);

  // Refresh stats when enabled (deferred to avoid blocking)
  useEffect(() => {
    if (isEnabled && !loading) {
      // Defer stats refresh to after interactions complete
      const task = InteractionManager.runAfterInteractions(() => {
        refreshStats();
      });
      return () => task.cancel();
    }
  }, [isEnabled, loading, refreshStats]);

  // Memoized handlers
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshStats();
    } finally {
      setRefreshing(false);
    }
  }, [refreshStats]);

  // Toggle handler with paywall gating
  const handleToggleParentalControls = useCallback(
    async (newEnabled: boolean) => {
      if (isToggling || isGating) return; // Prevent rapid toggling

      // If turning off, always allow
      if (!newEnabled) {
        try {
          await toggleParentalControls(false);
        } catch (err) {
          console.log('Toggle error handled by context');
        }
        return;
      }

      // If turning on, check access (shows paywall if needed)
      const granted = await requestAccess();
      if (!granted) return;

      try {
        await toggleParentalControls(true);
      } catch (err) {
        console.log('Toggle error handled by context');
      }
    },
    [toggleParentalControls, isToggling, isGating, requestAccess]
  );

  const handleAddDomain = useCallback(async () => {
    const trimmed = domainInput.trim();
    if (trimmed) {
      await addBlockedDomain(trimmed);
      setDomainInput('');
      setShowAddDomainModal(false);
    }
  }, [domainInput, addBlockedDomain]);

  const handleRemoveDomain = useCallback(
    (domain: string) => {
      Alert.alert('Remove Domain', `Remove "${domain}" from blocked list?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeBlockedDomain(domain),
        },
      ]);
    },
    [removeBlockedDomain]
  );

  const openAddDomainModal = useCallback(() => {
    setShowAddDomainModal(true);
  }, []);

  const closeAddDomainModal = useCallback(() => {
    setShowAddDomainModal(false);
    setDomainInput('');
  }, []);

  // Memoized category toggle handler
  const handleCategoryToggle = useCallback(
    (categoryId: ContentCategory) => {
      // Fire and forget - don't await to keep UI responsive
      toggleCategory(categoryId).catch(console.error);
    },
    [toggleCategory]
  );

  // Memoized blocked categories set for O(1) lookup
  const blockedCategoriesSet = useMemo(
    () => new Set(blockedCategories),
    [blockedCategories]
  );

  // Memoized card styles
  const cardStyle = useMemo(
    () => ({
      backgroundColor: isDark
        ? 'rgba(255, 255, 255, 0.05)'
        : 'rgba(255, 255, 255, 0.8)',
      borderColor: isDark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.05)',
    }),
    [isDark]
  );

  const infoCardStyle = useMemo(
    () => ({
      backgroundColor: isDark
        ? 'rgba(59, 130, 246, 0.1)'
        : 'rgba(59, 130, 246, 0.08)',
      borderColor: isDark
        ? 'rgba(59, 130, 246, 0.2)'
        : 'rgba(59, 130, 246, 0.15)',
    }),
    [isDark]
  );

  const infoTextColor = useMemo(
    () => (isDark ? '#93C5FD' : '#1D4ED8'),
    [isDark]
  );

  // Content container padding
  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: insets.top + 12,
      paddingBottom: insets.bottom + 100,
      paddingHorizontal: 20,
    }),
    [insets.top, insets.bottom]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={
          isDark
            ? ['#000000', '#0a0a0a', '#000000']
            : ['#ffffff', '#fafafa', '#f5f5f5']
        }
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Header */}
          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.header}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              Parental Controls
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Protect your family online
            </Text>
          </AnimatedView>

          {/* Hero Card with Interactive Activation Button */}
          <AnimatedView
            entering={FadeInDown.delay(hasParentalAccess ? 50 : 75).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.heroCard, cardStyle, (!hasParentalAccess || !isVPNConnected) && styles.lockedSection]}
          >
            {/* Tappable even when locked to show paywall */}
            <ActivationButton
              isEnabled={isEnabled}
              onToggle={() => handleToggleParentalControls(!isEnabled)}
              disabled={isGating || isToggling} // Only disable during paywall/toggle
              enabledSubtitle={`${blockedCategories.length} categories blocked`}
              disabledSubtitle={getDisabledReason() || "Tap to enable content filtering"}
              accentColor="#3B82F6"
            />

            {hasParentalAccess && isEnabled && isVPNConnected && blockingStats && (
              <QuickStatsRow
                stats={[
                  { icon: Ban, iconColor: colors.error, value: blockingStats.totalBlocked, label: 'Blocked' },
                  { icon: BarChart3, iconColor: '#3B82F6', value: blockedCategories.length, label: 'Categories' },
                  { icon: Shield, iconColor: '#3B82F6', value: customBlockedDomains.length, label: 'Custom' },
                ]}
              />
            )}
          </AnimatedView>

          {/* Content Categories */}
          {(() => {
            // Determine if categories section should be disabled and why
            const isCategoriesDisabled = !isEnabled || !isVPNConnected || !hasParentalAccess;
            const getCategoriesDescription = () => {
              if (!hasParentalAccess) return 'Upgrade to Pro to manage categories';
              if (!isEnabled) return 'Enable Parental Controls above to manage categories';
              if (!isVPNConnected) return 'Connect VPN to manage categories';
              return 'Select categories to block';
            };

            return (
              <AnimatedView
                entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
                style={[styles.sectionCard, cardStyle, isCategoriesDisabled && styles.disabledSection]}
              >
                <Text style={[styles.sectionTitle, { color: isCategoriesDisabled ? colors.textMuted : colors.text }]}>
                  Content Categories
                </Text>
                <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
                  {getCategoriesDescription()}
                </Text>

                {CONTENT_CATEGORIES.map((category, index) => (
                  <React.Fragment key={category.id}>
                    {index > 0 && (
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    )}
                    <CategoryRow
                      category={category}
                      isBlocked={blockedCategoriesSet.has(category.id)}
                      onToggle={handleCategoryToggle}
                      isDark={isDark}
                      colors={colors}
                      disabled={isCategoriesDisabled}
                    />
                  </React.Fragment>
                ))}
              </AnimatedView>
            );
          })()}

          {/* Custom Blocked Domains */}
          {(() => {
            // Determine if domains section should be disabled and why
            const isDomainsDisabled = !isEnabled || !isVPNConnected || !hasParentalAccess;
            const getDomainsDescription = () => {
              if (!hasParentalAccess) return 'Upgrade to Pro to manage sites';
              if (!isEnabled) return 'Enable Parental Controls above to manage sites';
              if (!isVPNConnected) return 'Connect VPN to manage sites';
              return 'Add specific websites to block';
            };

            return (
              <AnimatedView
                entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
                style={[styles.sectionCard, cardStyle, isDomainsDisabled && styles.disabledSection]}
              >
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: isDomainsDisabled ? colors.textMuted : colors.text }]}>
                      Custom Blocked Sites
                    </Text>
                    <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
                      {getDomainsDescription()}
                    </Text>
                  </View>
                  <Pressable
                    onPress={openAddDomainModal}
                    style={[styles.addButton, { backgroundColor: isDomainsDisabled ? colors.textMuted : '#3B82F6', opacity: isDomainsDisabled ? 0.5 : 1 }]}
                    disabled={isDomainsDisabled}
                  >
                    <Plus size={18} color="#fff" />
                  </Pressable>
                </View>

                {customBlockedDomains.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                      No custom sites blocked yet
                    </Text>
                  </View>
                ) : (
                  customBlockedDomains.map((domain, index) => (
                    <React.Fragment key={domain}>
                      {index > 0 && (
                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      )}
                      <DomainRow
                        domain={domain}
                        onRemove={handleRemoveDomain}
                        colors={colors}
                        disabled={isDomainsDisabled}
                      />
                    </React.Fragment>
                  ))
                )}
              </AnimatedView>
            );
          })()}

          {/* Info Card */}
          <AnimatedView
            entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.infoCard, infoCardStyle]}
          >
            <Shield size={18} color="#3B82F6" />
            <Text style={[styles.infoText, { color: infoTextColor }]}>
              Content filtering is applied when connected to VPN. Categories use
              AdGuard DNS rules for system-wide protection.
            </Text>
          </AnimatedView>
        </Animated.ScrollView>
      </ScrollShadow>

      {/* Add Domain Modal */}
      <Modal
        visible={showAddDomainModal}
        transparent
        animationType="fade"
        onRequestClose={closeAddDomainModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeAddDomainModal}>
          <Pressable
            style={[
              styles.modalContent,
              { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Block Website
              </Text>
              <Pressable onPress={closeAddDomainModal} hitSlop={8}>
                <X size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              Enter the domain to block (e.g., example.com)
            </Text>

            <TextInput
              style={[
                styles.domainInput,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.05)',
                  color: colors.text,
                },
              ]}
              placeholder="example.com"
              placeholderTextColor={colors.textMuted}
              value={domainInput}
              onChangeText={setDomainInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleAddDomain}
            />

            <Pressable
              onPress={handleAddDomain}
              style={[styles.modalButton, { backgroundColor: '#3B82F6' }]}
            >
              <Text style={styles.modalButtonText}>Block Site</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

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
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  // Hero Card
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  // Section Card
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    marginBottom: 16,
  },
  // Category Row
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    marginLeft: 12,
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
  },
  categoryDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  disabledRow: {
    opacity: 0.5,
  },
  disabledRowStrong: {
    opacity: 0.4,
  },
  disabledSection: {
    opacity: 0.6,
  },
  lockedSection: {
    opacity: 0.5,
  },
  // Add Button
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty State
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
  },
  // Domain Row
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  domainText: {
    fontSize: 15,
  },
  removeButton: {
    padding: 8,
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
    lineHeight: 19,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalDescription: {
    fontSize: 14,
    marginBottom: 20,
  },
  domainInput: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
