import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Sun,
  Moon,
  Smartphone,
  Check,
} from 'lucide-react-native';

import { useTheme, ThemeMode } from '@/context/ThemeContext';

interface ThemeOptionProps {
  icon: React.ElementType;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}

function ThemeOption({ icon: Icon, label, isSelected, onSelect }: ThemeOptionProps) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.themeOption,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          borderColor: isSelected ? colors.primary : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
          borderWidth: isSelected ? 2 : 1,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.themeOptionContent}>
        <View
          style={[
            styles.themeIconContainer,
            {
              backgroundColor: isSelected
                ? `${colors.primary}20`
                : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
            },
          ]}
        >
          <Icon size={24} color={isSelected ? colors.primary : colors.textMuted} />
        </View>
        <Text style={[styles.themeLabel, { color: isSelected ? colors.primary : colors.text }]}>
          {label}
        </Text>
      </View>
      {isSelected && (
        <View style={[styles.checkContainer, { backgroundColor: colors.primary }]}>
          <Check size={14} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

export default function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const router = useRouter();

  const themeOptions: { mode: ThemeMode; icon: React.ElementType; label: string }[] = [
    { mode: 'light', icon: Sun, label: 'Light' },
    { mode: 'dark', icon: Moon, label: 'Dark' },
    { mode: 'system', icon: Smartphone, label: 'System' },
  ];

  return (
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

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={[
              styles.backButton,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
            onPress={() => router.back()}
            hitSlop={12}
          >
            <ArrowLeft size={20} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Appearance
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Theme Options */}
        <View style={styles.optionsContainer}>
          {themeOptions.map((option) => (
            <ThemeOption
              key={option.mode}
              icon={option.icon}
              label={option.label}
              isSelected={themeMode === option.mode}
              onSelect={() => setThemeMode(option.mode)}
            />
          ))}
        </View>

        {/* Info Text */}
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          {themeMode === 'system'
            ? 'App will follow your device settings'
            : `Always use ${themeMode} mode`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsContainer: {
    gap: 12,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
  },
  themeOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  themeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  checkContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
});
