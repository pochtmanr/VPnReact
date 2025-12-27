import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, CheckCircle2, Globe, Lock, Shield, Zap } from 'lucide-react-native';
import React from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Feature Chip Component
interface FeatureChipProps {
  icon: React.ElementType;
  label: string;
}

const FeatureChip = ({ icon: Icon, label }: FeatureChipProps) => {
  return (
    <View style={styles.featureChip}>
      <Icon size={16} color="#FFFFFF" />
      <Text style={styles.featureChipText}>{label}</Text>
    </View>
  );
};

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const features = [
    { icon: Shield, label: 'Secure' },
    { icon: Zap, label: 'Fast' },
    { icon: Globe, label: 'Global' },
    { icon: Lock, label: 'Private' },
  ];

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
          'rgba(0, 0, 0, 0.2)',
          'rgba(0, 0, 0, 0.4)',
          'rgba(0, 0, 0, 0.75)',
          '#000000',
        ]}
        locations={[0, 0.3, 0.65, 1]}
        style={styles.gradientOverlay}
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Top Badge */}
        <View style={styles.topBadge}>
          <BlurView intensity={40} tint="dark" style={styles.topBadgeBlur}>
            <CheckCircle2 size={14} color={colors.success} />
            <Text style={styles.topBadgeText}>Trusted by 10M+ users</Text>
          </BlurView>
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>
            Your Privacy,{'\n'}
            <Text style={{ color: '#3B82F6' }}>Secured</Text>
          </Text>
          <Text style={styles.heroSubtitle}>
            Military-grade encryption to protect your online activity. Browse freely, stay anonymous.
          </Text>
        </View>

        {/* Feature Chips */}
        <View style={styles.featuresRow}>
          {features.map((feature) => (
            <FeatureChip
              key={feature.label}
              icon={feature.icon}
              label={feature.label}
            />
          ))}
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          {/* Glass Card */}
          <View style={styles.ctaCard}>
            <BlurView intensity={30} tint="dark" style={styles.ctaCardBlur}>
              <View style={styles.ctaCardContent}>
                {/* Benefit row */}
                <View style={styles.benefitRow}>
                  <View style={styles.benefitItem}>
                    <Text style={styles.benefitValue}>100+</Text>
                    <Text style={styles.benefitLabel}>Servers</Text>
                  </View>
                  <View style={styles.benefitDivider} />
                  <View style={styles.benefitItem}>
                    <Text style={styles.benefitValue}>50+</Text>
                    <Text style={styles.benefitLabel}>Countries</Text>
                  </View>
                  <View style={styles.benefitDivider} />
                  <View style={styles.benefitItem}>
                    <Text style={styles.benefitValue}>0</Text>
                    <Text style={styles.benefitLabel}>Logs</Text>
                  </View>
                </View>

                {/* Primary Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  onPress={() => router.push('/(auth)/account')}
                >
                  <LinearGradient
                    colors={['#3B82F6', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.buttonGradient}
                  >
                    <Text style={styles.primaryButtonText}>Start Protecting</Text>
                    <ArrowRight size={20} color="#FFFFFF" />
                  </LinearGradient>
                </Pressable>

                {/* Secondary info */}
                <Text style={styles.freeText}>Free servers available - No credit card required</Text>
              </View>
            </BlurView>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to our{' '}
            </Text>
            <Pressable>
              <Text style={[styles.footerLink, { color: '#3B82F6' }]}>
                Terms & Privacy
              </Text>
            </Pressable>
          </View>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  // Top Badge
  topBadge: {
    alignSelf: 'center',
  },
  topBadgeBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 100,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  topBadgeText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '500',
  },
  // Hero Section
  heroSection: {
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 44,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 52,
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 26,
    maxWidth: '90%',
  },
  // Feature Chips
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 32,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  featureChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  // CTA Section
  ctaSection: {
    gap: 16,
  },
  ctaCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  ctaCardBlur: {
    overflow: 'hidden',
  },
  ctaCardContent: {
    padding: 24,
    gap: 20,
  },
  // Benefits Row
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  benefitItem: {
    alignItems: 'center',
    flex: 1,
  },
  benefitValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  benefitLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    fontWeight: '500',
  },
  benefitDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  // Primary Button
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
    borderRadius: 9999,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  // Free text
  freeText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 4,
  },
  footerText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '600',
  },
});
