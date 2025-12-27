import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ShieldCheck,
  Ban,
  Zap,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeInUp,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Floating Orb Component
interface FloatingOrbProps {
  size: number;
  color: string;
  initialX: number;
  initialY: number;
  delay?: number;
  duration?: number;
}

const FloatingOrb = ({
  size,
  color,
  initialX,
  initialY,
  delay = 0,
  duration = 8000,
}: FloatingOrbProps) => {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Initial fade in
    opacity.value = withDelay(
      delay,
      withTiming(0.35, { duration: 1500, easing: Easing.out(Easing.ease) })
    );

    // Start animations after fade in
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-35, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(35, { duration, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(25, { duration: duration * 1.2, easing: Easing.inOut(Easing.ease) }),
          withTiming(-25, { duration: duration * 1.2, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    // Pulse opacity after initial fade in
    const opacityPulseDelay = delay + 1500;
    opacity.value = withDelay(
      opacityPulseDelay,
      withRepeat(
        withSequence(
          withTiming(0.5, { duration: duration * 0.5 }),
          withTiming(0.25, { duration: duration * 0.5 })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <AnimatedView
      style={[
        {
          position: 'absolute',
          left: initialX,
          top: initialY,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={[`${color}40`, `${color}10`, 'transparent']}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
      />
    </AnimatedView>
  );
};

// Feature Card Component - HeroUI style
interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  iconColor: string;
  delay: number;
}

const FeatureCard = ({ icon: Icon, title, description, iconColor, delay }: FeatureCardProps) => {
  const { colors } = useTheme();

  return (
    <AnimatedView
      entering={FadeInDown.delay(delay).duration(450).easing(Easing.out(Easing.ease))}
      style={styles.featureCard}
    >
      <BlurView intensity={25} tint="dark" style={styles.featureCardBlur}>
        <View style={styles.featureCardContent}>
          <View style={[styles.featureIcon, { backgroundColor: `${iconColor}20` }]}>
            <Icon size={26} color={iconColor} />
          </View>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>{title}</Text>
            <Text style={styles.featureDescription}>{description}</Text>
          </View>
          <CheckCircle2 size={22} color={colors.success} />
        </View>
      </BlurView>
    </AnimatedView>
  );
};

export default function FeaturesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const features = [
    {
      icon: ShieldCheck,
      title: 'VPN Protection',
      description: 'Encrypt your connection and hide your IP from trackers',
      color: colors.primary,
    },
    {
      icon: Ban,
      title: 'Ad Blocker',
      description: 'Block annoying ads and malware across all apps',
      color: '#EF4444',
    },
    {
      icon: Zap,
      title: 'Fast Servers',
      description: 'Connect to optimized servers with minimal speed loss',
      color: colors.success,
    },
  ];

  function handleContinue() {
    // Navigate to account setup instead of directly to tabs
    router.push('/(auth)/account');
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background Image */}
      <Image
        source={{
          uri: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
        }}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      {/* Gradient Overlay */}
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0.3)',
          'rgba(0, 0, 0, 0.5)',
          'rgba(0, 0, 0, 0.8)',
          '#000000',
        ]}
        locations={[0, 0.25, 0.55, 1]}
        style={styles.gradientOverlay}
      />

      {/* Floating Orbs */}
      <View style={styles.orbContainer} pointerEvents="none">
        <FloatingOrb
          size={280}
          color={colors.primary}
          initialX={-100}
          initialY={SCREEN_HEIGHT * 0.15}
          delay={0}
          duration={9000}
        />
        <FloatingOrb
          size={220}
          color="#EF4444"
          initialX={SCREEN_WIDTH - 80}
          initialY={SCREEN_HEIGHT * 0.35}
          delay={400}
          duration={7000}
        />
        <FloatingOrb
          size={200}
          color={colors.success}
          initialX={SCREEN_WIDTH * 0.2}
          initialY={SCREEN_HEIGHT * 0.7}
          delay={200}
          duration={11000}
        />
      </View>

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Header */}
        <AnimatedView
          entering={FadeInDown.delay(100).duration(500).easing(Easing.out(Easing.ease))}
          style={styles.header}
        >
          <View style={styles.headerBadge}>
            <BlurView intensity={40} tint="dark" style={styles.headerBadgeBlur}>
              <Sparkles size={14} color={colors.primary} />
              <Text style={styles.headerBadgeText}>Premium Features</Text>
            </BlurView>
          </View>
          <Text style={styles.title}>What You Get</Text>
          <Text style={styles.subtitle}>
            Everything you need for complete online privacy
          </Text>
        </AnimatedView>

        {/* Features List */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              iconColor={feature.color}
              delay={200 + index * 100}
            />
          ))}
        </View>

        {/* Stats Card */}
        <AnimatedView
          entering={FadeInDown.delay(500).duration(450).easing(Easing.out(Easing.ease))}
          style={styles.statsCard}
        >
          <BlurView intensity={25} tint="dark" style={styles.statsCardBlur}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>100+</Text>
                <Text style={styles.statLabel}>Servers</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>50+</Text>
                <Text style={styles.statLabel}>Countries</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>10M+</Text>
                <Text style={styles.statLabel}>Users</Text>
              </View>
            </View>
          </BlurView>
        </AnimatedView>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* CTA Section */}
        <AnimatedView
          entering={FadeInUp.delay(650).duration(500).springify()}
          style={styles.ctaSection}
        >
          {/* Primary Button */}
          <AnimatedPressable
            style={({ pressed }) => [
              styles.primaryButton,
              {
                transform: [{ scale: pressed ? 0.98 : 1 }],
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            onPress={handleContinue}
          >
            <LinearGradient
              colors={[colors.primary, '#4A8BC4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.primaryButtonText}>Start Protecting</Text>
              <ArrowRight size={20} color="#FFFFFF" />
            </LinearGradient>
          </AnimatedPressable>

          {/* Guarantee Row */}
          <View style={styles.guaranteeRow}>
            <ShieldCheck size={16} color={colors.success} />
            <Text style={styles.guaranteeText}>No account required - Free to start</Text>
          </View>
        </AnimatedView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  headerBadge: {
    marginBottom: 16,
  },
  headerBadgeBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 100,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerBadgeText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '500',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  // Features
  featuresContainer: {
    gap: 12,
    marginBottom: 20,
  },
  featureCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featureCardBlur: {
    overflow: 'hidden',
  },
  featureCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  featureIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 18,
  },
  // Stats Card
  statsCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsCardBlur: {
    overflow: 'hidden',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  // CTA Section
  ctaSection: {
    gap: 16,
  },
  primaryButton: {
    borderRadius: 9999,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  guaranteeText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
