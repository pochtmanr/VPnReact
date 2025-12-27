import React, { useEffect, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, ShieldOff, LucideIcon } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';

import { useTheme } from '@/context/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const BUTTON_SIZE = 160;

export interface ActivationButtonProps {
  isEnabled: boolean;
  onToggle?: () => void;
  enabledLabel?: string;
  disabledLabel?: string;
  enabledSubtitle?: string;
  disabledSubtitle?: string;
  EnabledIcon?: LucideIcon;
  DisabledIcon?: LucideIcon;
  /** If true, button appears disabled/locked */
  disabled?: boolean;
  /** Accent color for enabled state (default: #3B82F6 blue) */
  accentColor?: string;
}

export const ActivationButton = memo(function ActivationButton({
  isEnabled,
  onToggle,
  enabledLabel = 'Protection Active',
  disabledLabel = 'Protection Disabled',
  enabledSubtitle = 'Tap to disable',
  disabledSubtitle = 'Tap to enable',
  EnabledIcon = ShieldCheck,
  DisabledIcon = ShieldOff,
  disabled = false,
  accentColor = '#3B82F6',
}: ActivationButtonProps) {
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
      glowOpacity.value = isEnabled ? 0.25 : 0;
      return;
    }

    if (isEnabled) {
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
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    }

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
    };
  }, [isEnabled, isFocused, pulseScale, glowOpacity]);

  const handlePress = useCallback(() => {
    if (disabled || !onToggle) return;
    scale.value = withSequence(
      withSpring(0.94, { damping: 12, stiffness: 400 }),
      withSpring(1, { damping: 12, stiffness: 400 })
    );
    onToggle();
  }, [onToggle, scale, disabled]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: glowOpacity.value,
  }));

  // Derive a darker shade for gradient end
  const darkerAccent = useMemo(() => {
    // Simple darkening: reduce each hex component by ~15%
    const hex = accentColor.replace('#', '');
    const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 30);
    const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 30);
    const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 30);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }, [accentColor]);

  const gradientColors = useMemo(() => {
    if (isEnabled) return [accentColor, darkerAccent] as const;
    return isDark
      ? (['#3A3A3E', '#2A2A2E'] as const)
      : (['#F5F5F7', '#E8E8ED'] as const);
  }, [isEnabled, isDark, accentColor, darkerAccent]);

  const iconColor = isEnabled ? '#FFFFFF' : colors.textMuted;
  const StatusIcon = isEnabled ? EnabledIcon : DisabledIcon;

  return (
    <View style={styles.buttonContainer}>
      <Animated.View
        style={[
          styles.buttonGlow,
          glowStyle,
          { backgroundColor: isEnabled ? accentColor : 'transparent' },
        ]}
      />

      <AnimatedPressable onPress={handlePress} style={[styles.activationButton, buttonStyle]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.buttonGradient}
        >
          <StatusIcon size={56} color={iconColor} strokeWidth={1.8} />
        </LinearGradient>
      </AnimatedPressable>

      <Text
        style={[
          styles.buttonStatusTitle,
          { color: isEnabled ? accentColor : colors.text },
        ]}
      >
        {isEnabled ? enabledLabel : disabledLabel}
      </Text>

      <Text style={[styles.buttonStatusSubtitle, { color: colors.textSecondary }]}>
        {isEnabled ? enabledSubtitle : disabledSubtitle}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
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
  activationButton: {
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
});

export default ActivationButton;
