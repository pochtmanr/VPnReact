import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldOff,
  Shield,
  Eye,
  Bug,
  Zap,
  Lock,
  Sparkles,
  Check,
  ChevronRight,
  Globe,
  Smartphone,
  Wifi,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { ScrollShadow } from '@/components/ui';

const AnimatedView = Animated.createAnimatedComponent(View);

interface FeatureItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  iconColor: string;
  isLocked: boolean;
}

function FeatureItem({ icon: Icon, title, description, iconColor, isLocked }: FeatureItemProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.featureItem}>
      <View
        style={[
          styles.featureIcon,
          { backgroundColor: isDark ? `${iconColor}20` : `${iconColor}15` },
        ]}
      >
        <Icon size={22} color={iconColor} />
      </View>
      <View style={styles.featureContent}>
        <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.featureDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
      {isLocked ? (
        <Lock size={18} color={colors.textMuted} />
      ) : (
        <Check size={20} color={colors.success} />
      )}
    </View>
  );
}

interface ProtectionToggleProps {
  icon: React.ElementType;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  iconColor: string;
  disabled?: boolean;
}

function ProtectionToggle({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
  iconColor,
  disabled,
}: ProtectionToggleProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.toggleItem}>
      <View
        style={[
          styles.toggleIcon,
          { backgroundColor: isDark ? `${iconColor}20` : `${iconColor}15` },
        ]}
      >
        <Icon size={20} color={iconColor} />
      </View>
      <View style={styles.toggleContent}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={enabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

export default function AdblockScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const isLoggedIn = !!user;

  // Protection states (only work when logged in)
  const [adBlockEnabled, setAdBlockEnabled] = useState(false);
  const [trackerBlockEnabled, setTrackerBlockEnabled] = useState(false);
  const [malwareBlockEnabled, setMalwareBlockEnabled] = useState(false);

  // Pulse animation for the shield
  const pulseScale = useSharedValue(1);

  React.useEffect(() => {
    if (isLoggedIn && adBlockEnabled) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
    }
  }, [isLoggedIn, adBlockEnabled]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const stats = [
    { value: '2.5M+', label: 'Ads Blocked' },
    { value: '500K+', label: 'Trackers Stopped' },
    { value: '99.9%', label: 'Block Rate' },
  ];

  const features = [
    {
      icon: ShieldOff,
      title: 'Block All Ads',
      description: 'Remove intrusive ads from apps and websites',
      iconColor: colors.error,
    },
    {
      icon: Eye,
      title: 'Tracker Protection',
      description: 'Stop companies from tracking your activity',
      iconColor: colors.primary,
    },
    {
      icon: Bug,
      title: 'Malware Defense',
      description: 'Block malicious websites and downloads',
      iconColor: colors.warning,
    },
    {
      icon: Zap,
      title: 'Faster Browsing',
      description: 'Pages load quicker without heavy ads',
      iconColor: colors.success,
    },
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

      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
        {/* Header */}
        <AnimatedView
          entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
          style={styles.header}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>Ad Blocker</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Block ads system-wide
          </Text>
        </AnimatedView>

        {/* Hero Card */}
        <AnimatedView
          entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.heroCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Animated.View style={[styles.heroIconContainer, pulseStyle]}>
            <LinearGradient
              colors={isLoggedIn && adBlockEnabled
                ? [colors.success, '#22C55E']
                : [colors.error, '#EF4444']
              }
              style={styles.heroIconGradient}
            >
              {isLoggedIn && adBlockEnabled ? (
                <Shield size={48} color="#fff" />
              ) : (
                <ShieldOff size={48} color="#fff" />
              )}
            </LinearGradient>
          </Animated.View>

          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {isLoggedIn
              ? adBlockEnabled
                ? 'Protection Active'
                : 'Protection Disabled'
              : 'Premium Ad Blocking'
            }
          </Text>
          <Text style={[styles.heroDescription, { color: colors.textSecondary }]}>
            {isLoggedIn
              ? adBlockEnabled
                ? 'Your device is protected from ads and trackers'
                : 'Enable protection to block ads and trackers'
              : 'Block ads, trackers, and malware across all your apps'
            }
          </Text>

          {!isLoggedIn && (
            <View
              style={[
                styles.lockBadge,
                { backgroundColor: isDark ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)' },
              ]}
            >
              <Lock size={14} color={colors.warning} />
              <Text style={[styles.lockBadgeText, { color: colors.warning }]}>
                Login Required
              </Text>
            </View>
          )}
        </AnimatedView>

        {/* Stats */}
        <AnimatedView
          entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.statsCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              style={[
                styles.statItem,
                index < stats.length - 1 && [
                  styles.statBorder,
                  { borderRightColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
                ],
              ]}
            >
              <Text style={[styles.statValue, { color: colors.primary }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
            </View>
          ))}
        </AnimatedView>

        {/* Protection Toggles (for logged in users) */}
        {isLoggedIn && (
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.togglesCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Protection Settings</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Configure your ad blocking preferences
            </Text>

            <View style={styles.togglesList}>
              <ProtectionToggle
                icon={ShieldOff}
                label="Block Ads"
                description="Remove all advertisements"
                enabled={adBlockEnabled}
                onToggle={() => setAdBlockEnabled(!adBlockEnabled)}
                iconColor={colors.error}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ProtectionToggle
                icon={Eye}
                label="Block Trackers"
                description="Prevent activity tracking"
                enabled={trackerBlockEnabled}
                onToggle={() => setTrackerBlockEnabled(!trackerBlockEnabled)}
                iconColor={colors.primary}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ProtectionToggle
                icon={Bug}
                label="Malware Protection"
                description="Block malicious content"
                enabled={malwareBlockEnabled}
                onToggle={() => setMalwareBlockEnabled(!malwareBlockEnabled)}
                iconColor={colors.warning}
              />
            </View>
          </AnimatedView>
        )}

        {/* Features */}
        <AnimatedView
          entering={FadeInDown.delay(isLoggedIn ? 125 : 100).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.featuresCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>What's Included</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            {isLoggedIn ? 'Your protection features' : 'Unlock these features with an account'}
          </Text>

          <View style={styles.featuresList}>
            {features.map((feature, index) => (
              <React.Fragment key={feature.title}>
                <FeatureItem
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  iconColor={feature.iconColor}
                  isLocked={!isLoggedIn}
                />
                {index < features.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
              </React.Fragment>
            ))}
          </View>
        </AnimatedView>

        {/* Coverage Info */}
        <AnimatedView
          entering={FadeInDown.delay(isLoggedIn ? 150 : 125).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.coverageCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Coverage</Text>

          <View style={styles.coverageList}>
            <View style={styles.coverageItem}>
              <View
                style={[
                  styles.coverageIcon,
                  { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` },
                ]}
              >
                <Globe size={18} color={colors.primary} />
              </View>
              <Text style={[styles.coverageText, { color: colors.text }]}>All Browsers</Text>
            </View>
            <View style={styles.coverageItem}>
              <View
                style={[
                  styles.coverageIcon,
                  { backgroundColor: isDark ? `${colors.success}20` : `${colors.success}15` },
                ]}
              >
                <Smartphone size={18} color={colors.success} />
              </View>
              <Text style={[styles.coverageText, { color: colors.text }]}>All Apps</Text>
            </View>
            <View style={styles.coverageItem}>
              <View
                style={[
                  styles.coverageIcon,
                  { backgroundColor: isDark ? `${colors.info}20` : `${colors.info}15` },
                ]}
              >
                <Wifi size={18} color={colors.info} />
              </View>
              <Text style={[styles.coverageText, { color: colors.text }]}>System-Wide</Text>
            </View>
          </View>
        </AnimatedView>

        {/* CTA for non-logged-in users */}
        {!isLoggedIn && (
          <AnimatedView
            entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.ctaCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <View
              style={[
                styles.ctaIconContainer,
                { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` },
              ]}
            >
              <Sparkles size={32} color={colors.primary} />
            </View>

            <Text style={[styles.ctaTitle, { color: colors.text }]}>Unlock Ad Blocker</Text>
            <Text style={[styles.ctaDescription, { color: colors.textSecondary }]}>
              Create a free account to enable system-wide ad blocking
            </Text>

            <Pressable
              onPress={() => router.push('/(auth)/register')}
              style={({ pressed }) => [
                styles.signUpButton,
                pressed && { opacity: 0.9 },
              ]}
            >
              <LinearGradient
                colors={['#4F9CD6', '#3B7FC4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.signUpButtonGradient}
              >
                <Text style={styles.signUpButtonText}>Sign Up Free</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(auth)/login')}
              style={styles.signInLink}
            >
              <Text style={[styles.signInLinkText, { color: colors.textSecondary }]}>
                Already have an account?{' '}
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Sign In</Text>
              </Text>
            </Pressable>
          </AnimatedView>
        )}

        {/* Info Card */}
        <AnimatedView
          entering={FadeInDown.delay(isLoggedIn ? 175 : 175).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.infoCard,
            {
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            },
          ]}
        >
          <Shield size={18} color="#3B82F6" />
          <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
            Ad blocking works alongside VPN protection to give you complete privacy and a clean browsing experience.
          </Text>
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
  // Hero Card
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIconContainer: {
    marginBottom: 16,
  },
  heroIconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 16,
    gap: 6,
  },
  lockBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Stats Card
  statsCard: {
    flexDirection: 'row',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statBorder: {
    borderRightWidth: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  // Toggles Card
  togglesCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  togglesList: {
    gap: 0,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleContent: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 52,
  },
  // Features Card
  featuresCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  featuresList: {
    gap: 0,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  featureDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  // Coverage Card
  coverageCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  coverageList: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  coverageItem: {
    alignItems: 'center',
    gap: 8,
  },
  coverageIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverageText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // CTA Card
  ctaCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  ctaIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ctaTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  ctaDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  signUpButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  signUpButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  signUpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signInLink: {
    marginTop: 16,
    padding: 8,
  },
  signInLinkText: {
    fontSize: 14,
  },
  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
