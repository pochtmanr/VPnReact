/**
 * PrimaryButton - Unified CTA button component for consistent UI across auth screens
 *
 * Design specs:
 * - Height: 56px (paddingVertical: 18)
 * - Border radius: 9999 (pill shape)
 * - Font: 17px, weight 600
 * - Gradient: Primary blue (#3B82F6 → #2563EB) or custom colors
 * - Press feedback: scale 0.98, opacity 0.9
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  // Gradient colors - defaults to primary blue
  gradientColors?: readonly [string, string, ...string[]];
  // Optional style overrides
  style?: ViewStyle;
  // Animation delay for staggered entry
  enterDelay?: number;
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  icon,
  gradientColors = ['#3B82F6', '#2563EB'],
  style,
  enterDelay,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  const buttonContent = (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <>
          <Text style={styles.text}>{title}</Text>
          {icon}
        </>
      )}
    </LinearGradient>
  );

  if (enterDelay !== undefined) {
    return (
      <AnimatedPressable
        entering={FadeIn.delay(enterDelay).duration(400)}
        style={({ pressed }) => [
          styles.button,
          style,
          {
            transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
            opacity: isDisabled ? 0.6 : pressed ? 0.9 : 1,
          },
        ]}
        onPress={onPress}
        disabled={isDisabled}
      >
        {buttonContent}
      </AnimatedPressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        style,
        {
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
          opacity: isDisabled ? 0.6 : pressed ? 0.9 : 1,
        },
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {buttonContent}
    </Pressable>
  );
}

// Preset gradient colors for common use cases
export const BUTTON_GRADIENTS = {
  primary: ['#3B82F6', '#2563EB'] as const,
  success: ['#22C55E', '#1B9B5E'] as const,
  danger: ['#EF4444', '#DC2626'] as const,
} as const;

const styles = StyleSheet.create({
  button: {
    borderRadius: 9999,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
    borderRadius: 9999,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
