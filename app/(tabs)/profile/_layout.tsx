import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="personal-information"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="appearance"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="contact-support"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
