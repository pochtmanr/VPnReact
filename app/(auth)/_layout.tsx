import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
        // Disable swipe-back gesture in auth flow to prevent navigation leakage
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="features" />
      <Stack.Screen name="account" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen
        name="subscription-success"
        options={{
          gestureEnabled: false,
          animation: 'fade',
        }}
      />
    </Stack>
  );
}
