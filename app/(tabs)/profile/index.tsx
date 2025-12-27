import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogOut, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScrollShadow } from '@/components/ui';
import {
  AccountCard,
  SubscriptionWidget,
  DevicesWidget,
  SettingsWidget,
} from '@/components/profile';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

const AnimatedView = Animated.createAnimatedComponent(View);

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const {
    logout,
    deleteAccount,
    isAuthenticated,
  } = useAuth();
  const router = useRouter();

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You will need your Account ID to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/account');
          },
        },
      ]
    );
  }, [logout, router]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data, devices, and settings will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Type your account ID to confirm deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    const result = await deleteAccount();
                    if (result.success) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      router.replace('/(auth)/account');
                    } else {
                      Alert.alert('Error', result.error || 'Failed to delete account');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [deleteAccount, router]);

  const cardStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
  }), [isDark]);

  const gradientColors = useMemo(() =>
    isDark
      ? ['#000000', '#0a0a0a', '#000000'] as const
      : ['#ffffff', '#fafafa', '#f5f5f5'] as const,
    [isDark]
  );

  const contentContainerStyle = useMemo(() => ({
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + 100,
    paddingHorizontal: 20,
  }), [insets.top, insets.bottom]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.header}
          >
            <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Manage your account
            </Text>
          </AnimatedView>

          {/* Account ID Card - No tier badge */}
          <AccountCard cardStyle={cardStyle} animationDelay={50} />

          {/* Subscription Section */}
          <SubscriptionWidget cardStyle={cardStyle} animationDelay={100} />

          {/* Devices Section */}
          <DevicesWidget cardStyle={cardStyle} animationDelay={150} />

          {/* Settings Section */}
          <SettingsWidget cardStyle={cardStyle} animationDelay={200} />

          {/* Account Actions */}
          {isAuthenticated && (
            <AnimatedView
              entering={FadeInDown.delay(250).duration(300).easing(Easing.out(Easing.ease))}
              style={styles.accountActionsContainer}
            >
              <Button
                title="Sign Out"
                variant="secondary"
                size="large"
                onPress={handleLogout}
                icon={<LogOut size={18} color="#fff" />}
              />

              <Button
                title="Delete Account"
                variant="danger"
                size="large"
                onPress={handleDeleteAccount}
                icon={<Trash2 size={18} color="#fff" />}
              />
            </AnimatedView>
          )}

          {/* Version */}
          <AnimatedView
            entering={FadeInDown.delay(300).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.versionContainer}
          >
            <Text style={[styles.versionText, { color: colors.textMuted }]}>VPN Shield v1.0.0</Text>
          </AnimatedView>
        </Animated.ScrollView>
      </ScrollShadow>
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
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  accountActionsContainer: {
    gap: 12,
    marginVertical: 16,
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  versionText: {
    fontSize: 13,
  },
});
