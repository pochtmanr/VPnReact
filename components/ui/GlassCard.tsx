import React from 'react';
import { StyleSheet, View, ViewStyle, Pressable } from 'react-native';
import { borderRadius, spacing } from '@/constants/theme'; 
import { useTheme } from '@/context/ThemeContext';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}

export function GlassCard({ children, style, onPress }: GlassCardProps) {
  const { colors } = useTheme();

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          cardStyle,
          style,
          pressed && styles.pressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.card, cardStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
