import { useRouter } from 'expo-router';
import {
    ChevronRight,
    FileText,
    HelpCircle,
    Info,
    Settings,
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { SkeletonMenuItem } from '@/components/ui/Skeleton';
import { useTheme } from '@/context/ThemeContext';
import { getCurrentLanguage, LANGUAGE_FLAGS, LANGUAGE_NAMES } from '@/i18n';

const AnimatedView = Animated.createAnimatedComponent(View);

interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  onPress?: () => void;
  iconColor?: string;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
}

const MenuItem = memo(function MenuItem({
  icon: Icon,
  label,
  description,
  onPress,
  iconColor,
  showChevron = true,
  rightElement,
}: MenuItemProps) {
  const { colors, isDark } = useTheme();
  const defaultIconColor = iconColor || colors.primary;

  const iconBgColor = useMemo(
    () => isDark ? `${defaultIconColor}20` : `${defaultIconColor}15`,
    [isDark, defaultIconColor]
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBgColor }]}>
        <Icon size={20} color={defaultIconColor} />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, { color: colors.text }]}>{label}</Text>
        {description && (
          <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
            {description}
          </Text>
        )}
      </View>
      {rightElement || (showChevron && (
        <ChevronRight size={20} color={colors.textMuted} />
      ))}
    </Pressable>
  );
});

interface SettingsWidgetProps {
  cardStyle: { backgroundColor: string; borderColor: string };
  animationDelay?: number;
}

export const SettingsWidget = memo(function SettingsWidget({
  cardStyle,
  animationDelay = 200,
}: SettingsWidgetProps) {
  const { colors, themeMode, isDark } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 250);
    return () => clearTimeout(timer);
  }, []);

  // Build description for App Settings showing current theme and language
  const appSettingsDescription = useMemo(() => {
    const currentLang = getCurrentLanguage();
    const themeLabel = t(`profile.appearance.${themeMode}`);
    const langFlag = LANGUAGE_FLAGS[currentLang];
    return `${themeLabel} · ${langFlag} ${LANGUAGE_NAMES[currentLang]}`;
  }, [themeMode, t]);

  const openPrivacyPolicy = useCallback(async () => {
    await Linking.openURL('https://www.simnetiq.store/doppler-vpn-privacy-policy'); 
  }, []);

  const openTermsOfService = useCallback(async () => {
    await Linking.openURL('https://www.simnetiq.store/doppler-vpn-terms-of-service');
  }, []);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.settings.title')}</Text>

      <View style={styles.menuList}>
        {isLoading ? (
          <>
            <SkeletonMenuItem />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SkeletonMenuItem />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SkeletonMenuItem />
          </>
        ) : (
          <>
            <MenuItem
              icon={Settings}
              label={t('profile.settings.title')}
              description={appSettingsDescription}
              iconColor={colors.info}
              onPress={() => router.push('/(tabs)/profile/appearance')}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem
              icon={HelpCircle}
              label={t('profile.settings.contactSupport')}
              description={t('profile.settings.faqAndContact')}
              iconColor={colors.primary}
              onPress={() => router.push('/(tabs)/profile/contact-support')}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem
              icon={FileText}
              label={t('tier.paywall.privacy')}
              iconColor={colors.textSecondary}
              onPress={openPrivacyPolicy}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem
              icon={Info}
              label={t('tier.paywall.terms')}
              iconColor={colors.textSecondary}
              onPress={openTermsOfService}
            />
          </>
        )}
      </View>
    </AnimatedView>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  menuList: {
    gap: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginStart: 52,
  },
});
