import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';

// Import i18n configuration (must be before any components that use translations)
import '../i18n';

import { LoadingScreen } from '@/components/LoadingScreen';
import { GlobalPaywallModal } from '@/components/tier';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { ParentalControlsProvider } from '@/context/ParentalControlsContext';
import { RevenueCatProvider } from '@/context/RevenueCatContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { TierProvider } from '@/context/TierContext';
import { VPNProvider } from '@/context/VPNContext';

export {
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

// Keep splash visible until we're ready
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { isDark, colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const hasNavigated = useRef(false);

  // Create navigation theme based on current theme
  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.backgroundSecondary,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.backgroundSecondary,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
      };

  // Check onboarding status on mount
  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then((value) => {
      setOnboardingComplete(value === 'true');
    });
  }, []);

  // Determine if all checks are complete
  const isReady = !authLoading && onboardingComplete !== null;

  // Handle initial navigation and splash screen
  useEffect(() => {
    if (!isReady || hasNavigated.current) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Determine target route based on auth state
    let targetRoute: string | null = null;

    if (!onboardingComplete) {
      // Not onboarded - go to welcome (only if not already in auth)
      if (!inAuthGroup) {
        targetRoute = '/(auth)/welcome';
      }
    } else if (isAuthenticated) {
      // Onboarded and authenticated - go to main app
      if (inAuthGroup) {
        targetRoute = '/(tabs)';
      }
    } else {
      // Onboarded but not authenticated - go to account
      if (!inAuthGroup) {
        targetRoute = '/(auth)/account';
      }
    }

    // Navigate if needed
    if (targetRoute) {
      router.replace(targetRoute as any);
    }

    // Mark navigation as done and reveal the app
    hasNavigated.current = true;
    setIsNavigationReady(true);
    SplashScreen.hideAsync();
  }, [isReady, onboardingComplete, isAuthenticated, segments, router]);

  // Handle subsequent auth state changes (e.g., logout from main app)
  useEffect(() => {
    if (!hasNavigated.current || !isReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    // If user logs out while in main app, redirect to account
    if (onboardingComplete && !isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/account');
    }
    // If user authenticates while in auth flow, go to main app
    else if (onboardingComplete && isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, onboardingComplete, segments]);

  // Show loading screen until ready
  if (!isReady || !isNavigationReady) {
    return <LoadingScreen />;
  }

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <GlobalPaywallModal />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Don't hide splash here - let RootLayoutNav control it after auth check
  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <RevenueCatProvider>
            <TierProvider>
              <VPNProvider>
                <ParentalControlsProvider>
                  <RootLayoutNav />
                </ParentalControlsProvider>
              </VPNProvider>
            </TierProvider>
          </RevenueCatProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
