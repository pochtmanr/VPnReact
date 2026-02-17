import { IBMPlexSerif_400Regular_Italic, useFonts } from '@expo-google-fonts/ibm-plex-serif';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/ui/PrimaryButton';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Phrase keys for translation
const PHRASE_KEYS = [
  'privacy',
  'letAlone',
  'disappear',
  'forgotten',
  'sayNo',
  'silence',
  'unseen',
  'untracked',
  'sovereignty',
  'ownKeys',
  'watchWatchmen',
  'noneOfBusiness',
  'anonymity',
  'secrecy',
  'invisible',
  'goDark',
  'closeCurtains',
  'lockDoor',
  'keepSecrets',
  'ownData',
  'noTrace',
  'privateLife',
  'exit',
  'unreachable',
  'refuse',
  'encrypt',
  'closedDoor',
];

// Dynamic phrase height to accommodate 2 lines for long translations
const PHRASE_LINE_HEIGHT = 38;
const PHRASE_MAX_LINES = 2;
const PHRASE_HEIGHT = PHRASE_LINE_HEIGHT * PHRASE_MAX_LINES;
const HOLD_DURATION = 3000;
const SLIDE_DURATION = 600;

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const { t } = useTranslation();

  const [fontsLoaded] = useFonts({
    IBMPlexSerif_400Regular_Italic,
  });

  // Get translated phrases
  const phrases = useMemo(() =>
    PHRASE_KEYS.map((key) => t(`auth.welcome.phrases.${key}`) + '.'),
    [t]
  );

  // Single declarative animation - runs entirely on UI thread
  useEffect(() => {
    if (!fontsLoaded) return;

    // Build the full animation sequence once
    // Each step: hold, then slide to next
    const steps = phrases.map((_: string, index: number) => {
      const targetY = -index * PHRASE_HEIGHT;
      return withDelay(
        HOLD_DURATION,
        withTiming(targetY, {
          duration: SLIDE_DURATION,
          easing: Easing.inOut(Easing.cubic),
        })
      );
    });

    // Start at 0, then sequence through all phrases, then loop
    translateY.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }), // Start position
        ...steps.slice(1), // Skip first (already at 0), animate to rest
        withDelay(
          HOLD_DURATION,
          withTiming(0, { duration: SLIDE_DURATION, easing: Easing.inOut(Easing.cubic) })
        ) // Return to start
      ),
      -1, // Infinite loop
      false // Don't reverse
    );
  }, [fontsLoaded, translateY, phrases]);

  // Single animated style - only translateY, GPU-accelerated
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!fontsLoaded) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background Image */}
      <Image
        source={require('@/assets/images/welcome.png')}
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
        locations={[0, 0.3, 0.6, 1]}
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
        {/* Centered Text Section */}
        <View style={styles.animationContainer}>
          {/* Static Row - Never re-renders */}
          <Text style={styles.staticText}>{t('auth.welcome.everyoneHasRight')}</Text>

          {/* Vertical Carousel - Single translateY animation */}
          <View style={styles.carouselMask}>
            <Animated.View style={[styles.carouselTrack, animatedStyle]}>
              {phrases.map((phrase, index) => (
                <Text key={index} style={styles.animatedText}>
                  {phrase}
                </Text>
              ))}
            </Animated.View>
          </View>
        </View>

        {/* Bottom Section */}
        <View style={styles.bottomSection}>
          {/* CTA Button */}
          <PrimaryButton
            title={t('common.buttons.continue')}
            onPress={() => router.replace('/(auth)/account')}
          />

          {/* Terms of Service */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t('auth.welcome.footer.byContinuing')}{' '}
            </Text>
            <Pressable onPress={() => Linking.openURL('https://www.dopplervpn.org/en/terms')}>
              <Text style={styles.footerLink}>{t('tier.paywall.terms')}</Text>
            </Pressable>
            <Text style={styles.footerText}> {t('auth.welcome.footer.and')} </Text>
            <Pressable onPress={() => Linking.openURL('https://www.dopplervpn.org/en/privacy')}>
              <Text style={styles.footerLink}>{t('tier.paywall.privacy')}</Text>
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
    justifyContent: 'space-between',
  },
  // Animation Section
  animationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  staticText: {
    fontSize: 32,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  // Carousel - clips overflow, shows one phrase at a time
  carouselMask: {
    height: PHRASE_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    width: SCREEN_WIDTH - 48,
  },
  // Track - contains all phrases stacked vertically
  carouselTrack: {
    alignItems: 'center',
  },
  animatedText: {
    height: PHRASE_HEIGHT,
    fontSize: 28,
    fontFamily: 'IBMPlexSerif_400Regular_Italic',
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: PHRASE_LINE_HEIGHT,
    paddingHorizontal: 16,
    maxWidth: SCREEN_WIDTH - 48,
  },
  // Bottom Section
  bottomSection: {
    gap: 20,
    paddingBottom: 8,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  footerLink: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3B82F6',
  },
});
