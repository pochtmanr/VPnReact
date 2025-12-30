import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
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
  Globe,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { changeLanguage, getCurrentLanguage, LANGUAGE_FLAGS, LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from '@/i18n';
import { useRTL } from '@/i18n/useRTL';

interface OptionProps {
  icon: React.ElementType;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  flag?: string;
}

function SelectableOption({ icon: Icon, label, isSelected, onSelect, flag }: OptionProps) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          borderColor: isSelected ? colors.primary : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
          borderWidth: isSelected ? 2 : 1,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.optionContent}>
        {flag ? (
          <Text style={styles.flagText}>{flag}</Text>
        ) : (
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: isSelected
                  ? `${colors.primary}20`
                  : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
              },
            ]}
          >
            <Icon size={24} color={isSelected ? colors.primary : colors.textMuted} />
          </View>
        )}
        <Text style={[styles.optionLabel, { color: isSelected ? colors.primary : colors.text }]}>
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

export default function AppSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { flexDirection, textAlign } = useRTL();

  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  const themeOptions: { mode: ThemeMode; icon: React.ElementType; labelKey: string }[] = [
    { mode: 'light', icon: Sun, labelKey: 'profile.appearance.light' },
    { mode: 'dark', icon: Moon, labelKey: 'profile.appearance.dark' },
    { mode: 'system', icon: Smartphone, labelKey: 'profile.appearance.system' },
  ];

  const handleLanguageChange = useCallback(async (lang: string) => {
    try {
      await changeLanguage(lang);
      setCurrentLang(lang);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.warn('Failed to change language:', err);
    }
  }, []);

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setThemeMode]);

  const getThemeInfoText = () => {
    if (themeMode === 'system') {
      return t('profile.appearance.followDevice');
    }
    const modeLabel = t(`profile.appearance.${themeMode}`);
    return t('profile.appearance.alwaysUse', { mode: modeLabel });
  };

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { flexDirection: flexDirection('row') }]}>
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
          <Text style={[styles.headerTitle, { color: colors.text, textAlign: textAlign('center') }]}>
            {t('profile.settings.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, { flexDirection: flexDirection('row') }]}>
            <View
              style={[
                styles.sectionIconContainer,
                { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)' },
              ]}
            >
              <Sun size={20} color="#6366F1" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('profile.appearance.title')}
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            {themeOptions.map((option) => (
              <SelectableOption
                key={option.mode}
                icon={option.icon}
                label={t(option.labelKey)}
                isSelected={themeMode === option.mode}
                onSelect={() => handleThemeChange(option.mode)}
              />
            ))}
          </View>

          <Text style={[styles.infoText, { color: colors.textSecondary, textAlign: textAlign('center') }]}>
            {getThemeInfoText()}
          </Text>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, { flexDirection: flexDirection('row') }]}>
            <View
              style={[
                styles.sectionIconContainer,
                { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)' },
              ]}
            >
              <Globe size={20} color="#10B981" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('profile.language')}
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <SelectableOption
                key={lang}
                icon={Globe}
                label={LANGUAGE_NAMES[lang]}
                flag={LANGUAGE_FLAGS[lang]}
                isSelected={currentLang === lang}
                onSelect={() => handleLanguageChange(lang)}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  optionsContainer: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 32,
    width: 44,
    textAlign: 'center',
  },
  optionLabel: {
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
    marginTop: 16,
  },
});
