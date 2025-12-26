import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { VPNProvider } from '@/context/VPNContext';
import { ParentalControlsProvider } from '@/context/ParentalControlsContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { loading, isAuthenticated } = useAuth();
  const { isDark, colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

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

  useEffect(() => {
    // Check if onboarding is complete on mount
    AsyncStorage.getItem('onboarding_complete').then((value) => {
      setOnboardingComplete(value === 'true');
      setInitialCheckDone(true);
    });
  }, []);

  useEffect(() => {
    if (loading || !initialCheckDone) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Only redirect on initial load, not on every segment change
    if (!onboardingComplete && !inAuthGroup) {
      // Show onboarding
      router.replace('/(auth)/welcome');
    } else if (onboardingComplete && isAuthenticated && inAuthGroup) {
      // User is authenticated, skip to main app
      router.replace('/(tabs)');
    } else if (onboardingComplete && !isAuthenticated && !inAuthGroup) {
      // User completed onboarding but not authenticated, go to account
      router.replace('/(auth)/account');
    }
  }, [loading, initialCheckDone, isAuthenticated]);

  if (loading || !initialCheckDone) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <VPNProvider>
          <ParentalControlsProvider>
            <RootLayoutNav />
          </ParentalControlsProvider>
        </VPNProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
