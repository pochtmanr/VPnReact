import React, { memo, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  Palette,
  HelpCircle,
  FileText,
  Info,
  ChevronRight,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';

import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { SkeletonMenuItem } from '@/components/ui/Skeleton';

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
  const { colors, themeMode } = useTheme();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 250);
    return () => clearTimeout(timer);
  }, []);

  const themeLabel = useMemo(() => {
    switch (themeMode) {
      case 'light': return 'Light mode';
      case 'dark': return 'Dark mode';
      case 'system': return 'System';
    }
  }, [themeMode]);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>

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
              icon={Palette}
              label="Appearance"
              description={themeLabel}
              iconColor={colors.info}
              onPress={() => router.push('/(tabs)/profile/appearance')}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem
              icon={HelpCircle}
              label="Help & Support"
              description="FAQ and contact us"
              iconColor={colors.primary}
              onPress={() => router.push('/(tabs)/profile/contact-support')}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem
              icon={FileText}
              label="Privacy Policy"
              iconColor={colors.textSecondary}
              onPress={() => Alert.alert('Privacy', 'View privacy policy')}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MenuItem
              icon={Info}
              label="Terms of Service"
              iconColor={colors.textSecondary}
              onPress={() => Alert.alert('Terms', 'View terms of service')}
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
    marginLeft: 52,
  },
});
