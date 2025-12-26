import React from 'react';
import {
  StyleSheet,
  Text,
  Pressable,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export function GradientButton({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  style,
  icon,
}: GradientButtonProps) {
  const sizeStyles = {
    small: { height: 36, paddingHorizontal: spacing.md },
    medium: { height: 48, paddingHorizontal: spacing.lg },
    large: { height: 56, paddingHorizontal: spacing.xl },
  }[size];

  const variantStyles = {
    primary: {
      button: styles.primaryButton,
      text: styles.primaryText,
    },
    secondary: {
      button: styles.secondaryButton,
      text: styles.secondaryText,
    },
    outline: {
      button: styles.outlineButton,
      text: styles.outlineText,
    },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        sizeStyles,
        variantStyles.button,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' ? colors.primary : colors.text}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              variantStyles.text,
              icon ? { marginLeft: spacing.sm } : null,
              disabled && styles.textDisabled,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.backgroundTertiary,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  text: {
    ...typography.button,
  },
  primaryText: {
    color: colors.text,
  },
  secondaryText: {
    color: colors.text,
  },
  outlineText: {
    color: colors.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  textDisabled: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.8,
  },
});
