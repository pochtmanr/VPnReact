import { IBMPlexSerif_400Regular_Italic, useFonts } from '@expo-google-fonts/ibm-plex-serif';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import {
  Dimensions,
  Image,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PHRASES = [
  'to privacy.',
  'to be let alone.',
  'to disappear.',
  'to be forgotten.',
  'to say no.',
  'to silence.',
  'to be unseen.',
  'to be untracked.',
  'to digital sovereignty.',
  'to hold their own keys.',
  'to watch the watchmen.',
  'to none of your business.',
  'to anonymity.',
  'to secrecy.',
  'to be invisible.',
  'to go dark.',
  'to close the curtains.',
  'to lock the door.',
  'to keep secrets.',
  'to own their data.',
  'to leave no trace.',
  'to a private life.',
  'to an exit.',
  'to be unreachable.',
  'to refuse.',
  'to encrypt.',
  'to a closed door.',
];

const PHRASE_HEIGHT = 44;
const HOLD_DURATION = 3000;
const SLIDE_DURATION = 600;

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const [fontsLoaded] = useFonts({
    IBMPlexSerif_400Regular_Italic,
  });

  // Single declarative animation - runs entirely on UI thread
  useEffect(() => {
    if (!fontsLoaded) return;

    // Build the full animation sequence once
    // Each step: hold, then slide to next
    const steps = PHRASES.map((_, index) => {
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
  }, [fontsLoaded, translateY]);

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
          <Text style={styles.staticText}>Everybody has a right</Text>

          {/* Vertical Carousel - Single translateY animation */}
          <View style={styles.carouselMask}>
            <Animated.View style={[styles.carouselTrack, animatedStyle]}>
              {PHRASES.map((phrase, index) => (
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
              <Text style={styles.primaryButtonText}>Continue</Text>
            </LinearGradient>
          </Pressable>

          {/* Terms of Service */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to our{' '}
            </Text>
            <Pressable>
              <Text style={styles.footerLink}>Terms of Service</Text>
            </Pressable>
            <Text style={styles.footerText}> and </Text>
            <Pressable>
              <Text style={styles.footerLink}>Privacy Policy</Text>
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
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  // Track - contains all phrases stacked vertically
  carouselTrack: {
    alignItems: 'center',
  },
  animatedText: {
    height: PHRASE_HEIGHT,
    fontSize: 32,
    fontFamily: 'IBMPlexSerif_400Regular_Italic',
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: PHRASE_HEIGHT,
  },
  // Bottom Section
  bottomSection: {
    gap: 20,
    paddingBottom: 8,
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
    borderRadius: 9999,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
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
