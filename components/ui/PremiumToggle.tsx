import React, { memo, useCallback } from 'react';
import { Switch, SwitchProps, View, Text, StyleSheet } from 'react-native';
import { Crown } from 'lucide-react-native';
import { Feature } from '@/context/TierContext';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTheme } from '@/context/ThemeContext';

interface PremiumToggleProps extends Omit<SwitchProps, 'value' | 'onValueChange' | 'disabled'> {
  /** The feature this toggle controls */
  feature: Feature;
  /** Current enabled state */
  isEnabled: boolean;
  /** Callback when the toggle should change */
  onToggle: (enabled: boolean) => void | Promise<void>;
  /** Whether this feature requires VPN connection */
  requiresVPN?: boolean;
  /** Current VPN connection status */
  isVPNConnected?: boolean;
  /** Show a small Pro badge when feature is locked */
  showProBadge?: boolean;
  /** Custom message when VPN is required */
  vpnRequiredMessage?: string;
}

/**
 * A Switch component that automatically gates premium features.
 *
 * When a free user tries to enable a premium feature:
 * 1. Checks VPN requirement (if applicable)
 * 2. Shows RevenueCat paywall
 * 3. Only enables the feature if purchase is successful
 *
 * @example
 * ```tsx
 * <PremiumToggle
 *   feature="ad_blocking"
 *   isEnabled={adBlockEnabled}
 *   onToggle={setAdBlockEnabled}
 *   requiresVPN
 *   isVPNConnected={isConnected}
 * />
 * ```
 */
export const PremiumToggle = memo(function PremiumToggle({
  feature,
  isEnabled,
  onToggle,
  requiresVPN = false,
  isVPNConnected = true,
  showProBadge = true,
  vpnRequiredMessage,
  ...switchProps
}: PremiumToggleProps) {
  const { colors, isDark } = useTheme();

  const {
    hasAccess,
    requestAccess,
    isGating,
    isDisabled,
  } = useFeatureGate(feature, {
    requiresVPN,
    isVPNConnected,
    vpnRequiredMessage,
  });

  const handleValueChange = useCallback(async (newValue: boolean) => {
    // Always allow turning off
    if (!newValue) {
      await onToggle(false);
      return;
    }

    // Request access (handles VPN check and paywall)
    const granted = await requestAccess();
    if (!granted) return;

    // Access granted, enable the feature
    await onToggle(true);
  }, [onToggle, requestAccess]);

  // Determine if switch should be visually disabled
  const visuallyDisabled = isDisabled || isGating;

  return (
    <View style={styles.container}>
      {showProBadge && !hasAccess && (
        <View style={[styles.proBadge, { backgroundColor: isDark ? '#FFD70020' : '#FFD70015' }]}>
          <Crown size={10} color="#FFD700" />
          <Text style={styles.proBadgeText}>PRO</Text>
        </View>
      )}
      <Switch
        value={isEnabled}
        onValueChange={handleValueChange}
        disabled={visuallyDisabled}
        trackColor={{ false: colors.border, true: '#3B82F6' }}
        thumbColor={isEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
        ios_backgroundColor={colors.border}
        style={[visuallyDisabled && styles.disabledSwitch, switchProps.style]}
        {...switchProps}
      />
    </View>
  );
});

/**
 * Props for PremiumSettingRow component
 */
interface PremiumSettingRowProps {
  /** Icon component to display */
  icon: React.ReactNode;
  /** Main label text */
  label: string;
  /** Description text - auto-generated based on state if not provided */
  description?: string;
  /** The feature this row controls */
  feature: Feature;
  /** Current enabled state */
  isEnabled: boolean;
  /** Callback when the toggle should change */
  onToggle: (enabled: boolean) => void | Promise<void>;
  /** Whether this feature requires VPN connection */
  requiresVPN?: boolean;
  /** Current VPN connection status */
  isVPNConnected?: boolean;
  /** Description to show when feature is enabled */
  enabledDescription?: string;
  /** Description to show when feature is disabled but accessible */
  disabledDescription?: string;
}

/**
 * A complete settings row with icon, labels, and premium-gated toggle.
 * Automatically shows appropriate description based on subscription and VPN state.
 */
export const PremiumSettingRow = memo(function PremiumSettingRow({
  icon,
  label,
  description,
  feature,
  isEnabled,
  onToggle,
  requiresVPN = false,
  isVPNConnected = true,
  enabledDescription,
  disabledDescription,
}: PremiumSettingRowProps) {
  const { colors, isDark } = useTheme();

  const { hasAccess, getDisabledReason } = useFeatureGate(feature, {
    requiresVPN,
    isVPNConnected,
  });

  // Determine the description to show
  const displayDescription = (() => {
    // Custom description always takes precedence
    if (description) return description;

    // Check for disabled reason (no access or VPN required)
    const disabledReason = getDisabledReason();
    if (disabledReason) return disabledReason;

    // Feature is accessible - show enabled/disabled description
    if (isEnabled && enabledDescription) return enabledDescription;
    if (!isEnabled && disabledDescription) return disabledDescription;

    return disabledDescription || '';
  })();

  const isAccessible = hasAccess && (!requiresVPN || isVPNConnected);

  return (
    <View style={[styles.settingRow, !isAccessible && styles.settingRowDisabled]}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { opacity: isAccessible ? 1 : 0.5 }]}>
          {icon}
        </View>
        <View style={styles.settingText}>
          <Text style={[styles.settingLabel, { color: isAccessible ? colors.text : colors.textMuted }]}>
            {label}
          </Text>
          <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
            {displayDescription}
          </Text>
        </View>
      </View>
      <PremiumToggle
        feature={feature}
        isEnabled={isEnabled}
        onToggle={onToggle}
        requiresVPN={requiresVPN}
        isVPNConnected={isVPNConnected}
        showProBadge={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  proBadgeText: {
    color: '#FFD700',
    fontSize: 9,
    fontWeight: '700',
  },
  disabledSwitch: {
    opacity: 0.5,
  },
  // Setting Row styles
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
});
