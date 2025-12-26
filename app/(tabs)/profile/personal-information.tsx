import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Camera,
  Key,
  ChevronRight,
  Info,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  Easing,
} from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

interface EditableFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  keyboardType?: 'default' | 'email-address';
}

function EditableField({
  label,
  value,
  placeholder,
  onChangeText,
  editable = true,
  keyboardType = 'default',
}: EditableFieldProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
            color: editable ? colors.text : colors.textMuted,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

export default function PersonalInformationScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user, profile, updateProfile } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState(profile?.username || '');
  const [email] = useState(user?.email || '');
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleUsernameChange = (text: string) => {
    setUsername(text);
    setHasChanges(text !== (profile?.username || ''));
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsLoading(true);
    try {
      await updateProfile({ username });
      Alert.alert('Success', 'Your profile has been updated.');
      setHasChanges(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'We will send a password reset link to your email address.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Link',
          onPress: () => {
            Alert.alert('Email Sent', 'Check your inbox for the password reset link.');
          },
        },
      ]
    );
  };

  // Render back button
  const renderBackButton = () => (
    <Pressable
      style={[
        styles.backButton,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
      ]}
      onPress={() => router.back()}
      hitSlop={12}
    >
      <ArrowLeft size={20} color={colors.text} />
    </Pressable>
  );

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

      <AnimatedScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          {renderBackButton()}
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Personal Information
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <AnimatedView
          entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
        >
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Manage your account details
          </Text>
        </AnimatedView>

        {/* Avatar Section */}
        <AnimatedView
          entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
          style={styles.avatarSection}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {(username || email || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <Pressable
            style={[
              styles.changeAvatarButton,
              {
                borderColor: colors.primary,
                backgroundColor: isDark ? `${colors.primary}15` : `${colors.primary}10`,
              },
            ]}
          >
            <Camera size={16} color={colors.primary} />
            <Text style={[styles.changeAvatarText, { color: colors.primary }]}>
              Change Photo
            </Text>
          </Pressable>
        </AnimatedView>

        {/* Profile Information Card */}
        <AnimatedView
          entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile</Text>

          <EditableField
            label="USERNAME"
            value={username}
            placeholder="Enter your username"
            onChangeText={handleUsernameChange}
          />

          <EditableField
            label="EMAIL ADDRESS"
            value={email}
            placeholder="your@email.com"
            onChangeText={() => {}}
            editable={false}
            keyboardType="email-address"
          />

          <View
            style={[
              styles.emailNote,
              {
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
              },
            ]}
          >
            <Info size={14} color="#3B82F6" />
            <Text style={[styles.emailNoteText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
              Email cannot be changed for security reasons
            </Text>
          </View>
        </AnimatedView>

        {/* Security Card */}
        <AnimatedView
          entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Security</Text>

          <Pressable
            onPress={handleChangePassword}
            style={({ pressed }) => [
              styles.passwordButton,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View
              style={[
                styles.passwordIcon,
                { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` },
              ]}
            >
              <Key size={20} color={colors.primary} />
            </View>
            <View style={styles.passwordContent}>
              <Text style={[styles.passwordTitle, { color: colors.text }]}>Change Password</Text>
              <Text style={[styles.passwordSubtitle, { color: colors.textSecondary }]}>
                Update your account password
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </Pressable>
        </AnimatedView>

        {/* Account Info Card */}
        <AnimatedView
          entering={FadeInDown.delay(200).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account Information</Text>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Member Since</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })
                : 'N/A'}
            </Text>
          </View>

          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Account ID</Text>
            <Text style={[styles.infoValue, { color: colors.textMuted }]}>
              {user?.id?.slice(0, 8) || 'N/A'}...
            </Text>
          </View>
        </AnimatedView>

        {/* Save Button */}
        {hasChanges && (
          <AnimatedView
            entering={FadeInDown.delay(0).duration(200).easing(Easing.out(Easing.ease))}
          >
            <Pressable
              onPress={handleSave}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && { opacity: 0.9 },
                isLoading && { opacity: 0.6 },
              ]}
            >
              <LinearGradient
                colors={['#4F9CD6', '#3B7FC4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveButtonGradient}
              >
                <Text style={styles.saveButtonText}>
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Text>
              </LinearGradient>
            </Pressable>
          </AnimatedView>
        )}

        {/* Delete Account */}
        <AnimatedView
          entering={FadeInDown.delay(250).duration(300).easing(Easing.out(Easing.ease))}
        >
          <Pressable
            onPress={() => {
              Alert.alert(
                'Delete Account',
                'Are you sure you want to delete your account? This action cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert('Contact Support', 'Please contact support to delete your account.');
                    },
                  },
                ]
              );
            }}
            style={styles.deleteButton}
          >
            <Text style={[styles.deleteButtonText, { color: colors.error }]}>Delete Account</Text>
          </Pressable>
        </AnimatedView>
      </AnimatedScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontSize: 16,
    marginBottom: 24,
  },
  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
  },
  changeAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  changeAvatarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Card
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  // Field
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  fieldInput: {
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  emailNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: -8,
  },
  emailNoteText: {
    fontSize: 13,
    flex: 1,
  },
  // Password
  passwordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  passwordIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordContent: {
    flex: 1,
  },
  passwordTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  passwordSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  // Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  infoDivider: {
    height: 1,
  },
  // Save Button
  saveButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 16,
  },
  saveButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Delete
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
