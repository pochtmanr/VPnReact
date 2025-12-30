import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

interface MinimalInputProps extends TextInputProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  secureTextEntry?: boolean;
}

export function MinimalInput({
  label,
  icon,
  error,
  secureTextEntry,
  value,
  onFocus,
  onBlur,
  ...props
}: MinimalInputProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const hasValue = value && value.length > 0;
  const isLabelFloating = isFocused || hasValue;

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const borderColor = error
    ? colors.error
    : isFocused
    ? colors.primary
    : colors.border;

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={isFocused ? colors.primary : colors.textMuted}
            style={styles.icon}
          />
        )}

        <View style={styles.inputContainer}>
          <MotiView
            animate={{
              translateY: isLabelFloating ? -24 : 0,
              scale: isLabelFloating ? 0.85 : 1,
            }}
            transition={{ type: 'timing', duration: 150 }}
            style={[styles.labelContainer, { left: icon ? 0 : 0 }]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: error
                    ? colors.error
                    : isFocused
                    ? colors.primary
                    : colors.textMuted,
                },
              ]}
            >
              {label}
            </Text>
          </MotiView>

          <TextInput
            style={[
              styles.input,
              { color: colors.text },
            ]}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            secureTextEntry={secureTextEntry && !showPassword}
            placeholderTextColor={colors.textMuted}
            {...props}
          />
        </View>

        {secureTextEntry && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeButton}
            hitSlop={8}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        )}
      </View>

      <MotiView
        animate={{ scaleX: isFocused ? 1 : 0 }}
        transition={{ type: 'timing', duration: 200 }}
        style={[
          styles.focusLine,
          { backgroundColor: error ? colors.error : colors.primary },
        ]}
      />

      <View style={[styles.bottomLine, { backgroundColor: borderColor }]} />

      {error && (
        <MotiView
          from={{ opacity: 0, translateY: -5 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 150 }}
        >
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </MotiView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  icon: {
    marginEnd: spacing.sm,
  },
  inputContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 32,
  },
  labelContainer: {
    position: 'absolute',
    top: 6,
  },
  label: {
    ...typography.body,
  },
  input: {
    ...typography.body,
    paddingVertical: 4,
  },
  eyeButton: {
    padding: spacing.xs,
  },
  bottomLine: {
    height: 1,
    width: '100%',
  },
  focusLine: {
    height: 2,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    transformOrigin: 'left',
  },
  errorText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
