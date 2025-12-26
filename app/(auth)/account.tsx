import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  Check,
  Copy,
  Key,
  RefreshCw,
  Shield,
  Smartphone,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Mode = 'choice' | 'create' | 'login';

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { createAccount, loginWithAccountId, isAuthenticated } = useAuth();

  const [mode, setMode] = useState<Mode>('choice');
  const [accountId, setAccountId] = useState('');
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      handleContinue();
    }
  }, [isAuthenticated]);

  const handleCreateAccount = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await createAccount();

      if (result.success && result.accountId) {
        setGeneratedId(result.accountId);
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      } else {
        setError(result.error || 'Failed to create account');
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      }
    } catch (err) {
      setError('An unexpected error occurred');
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!accountId.trim()) {
      setError('Please enter your account ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loginWithAccountId(accountId);

      if (result.success) {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        handleContinue();
      } else {
        setError(result.error || 'Invalid account ID');
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      }
    } catch (err) {
      setError('An unexpected error occurred');
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const handleCopyId = async () => {
    if (generatedId) {
      try {
        await Clipboard.setStringAsync(generatedId);
        setCopied(true);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.warn('Clipboard/Haptics error:', err);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleShareId = async () => {
    if (generatedId) {
      try {
        await Share.share({
          message: `My VPN Shield Account ID: ${generatedId}\n\nUse this ID to access VPN Shield on any device.`,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  const handleContinue = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    router.replace('/(tabs)');
  };

  // Format input as user types (VPN-XXXX-XXXX-XXXX)
  const formatAccountId = (text: string) => {
    // Remove all non-alphanumeric characters except hyphen
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    // If it starts with VPN-, keep it, otherwise add it
    let formatted = cleaned;
    if (!formatted.startsWith('VPN-') && formatted.length > 0) {
      if (formatted.startsWith('VPN')) {
        formatted = 'VPN-' + formatted.slice(3);
      } else {
        formatted = 'VPN-' + formatted;
      }
    }

    // Limit length (VPN-XXXX-XXXX-XXXX = 19 characters)
    if (formatted.length > 19) {
      formatted = formatted.slice(0, 19);
    }

    // Add hyphens at correct positions
    const parts = formatted.replace('VPN-', '').split('-').join('');
    let result = 'VPN-';
    for (let i = 0; i < parts.length && i < 12; i++) {
      if (i > 0 && i % 4 === 0) {
        result += '-';
      }
      result += parts[i];
    }

    return result;
  };

  const renderChoice = () => (
    <AnimatedView
      entering={FadeInDown.delay(200).duration(500).easing(Easing.out(Easing.ease))}
      style={styles.choiceContainer}
    >
      <Text style={styles.choiceTitle}>Get Started</Text>
      <Text style={styles.choiceSubtitle}>
        Create a new account or login with an existing ID
      </Text>

      {/* Create Account Card */}
      <AnimatedPressable
        entering={FadeInDown.delay(300).duration(400)}
        style={({ pressed }) => [
          styles.optionCard,
          { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={() => setMode('create')}
      >
        <BlurView intensity={25} tint="dark" style={styles.optionCardBlur}>
          <View style={styles.optionCardContent}>
            <View style={[styles.optionIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Key size={28} color={colors.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Create New Account</Text>
              <Text style={styles.optionDescription}>
                Get a unique ID to use across all your devices
              </Text>
            </View>
            <ArrowRight size={20} color="rgba(255, 255, 255, 0.4)" />
          </View>
        </BlurView>
      </AnimatedPressable>

      {/* Login Card */}
      <AnimatedPressable
        entering={FadeInDown.delay(400).duration(400)}
        style={({ pressed }) => [
          styles.optionCard,
          { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={() => setMode('login')}
      >
        <BlurView intensity={25} tint="dark" style={styles.optionCardBlur}>
          <View style={styles.optionCardContent}>
            <View style={[styles.optionIcon, { backgroundColor: `${colors.success}20` }]}>
              <Smartphone size={28} color={colors.success} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>I Have an Account</Text>
              <Text style={styles.optionDescription}>
                Enter your existing account ID to continue
              </Text>
            </View>
            <ArrowRight size={20} color="rgba(255, 255, 255, 0.4)" />
          </View>
        </BlurView>
      </AnimatedPressable>

      {/* Device Info */}
      <AnimatedView
        entering={FadeInDown.delay(500).duration(400)}
        style={styles.deviceInfo}
      >
        <BlurView intensity={20} tint="dark" style={styles.deviceInfoBlur}>
          <Shield size={16} color={colors.primary} />
          <Text style={styles.deviceInfoText}>
            Your account works on up to 10 devices
          </Text>
        </BlurView>
      </AnimatedView>
    </AnimatedView>
  );

  const renderCreate = () => (
    <AnimatedView
      entering={FadeInDown.delay(100).duration(500).easing(Easing.out(Easing.ease))}
      style={styles.createContainer}
    >
      {!generatedId ? (
        <>
          <Text style={styles.modeTitle}>Create Account</Text>
          <Text style={styles.modeSubtitle}>
            We'll generate a unique ID for you. Save it to use on other devices.
          </Text>

          <AnimatedView
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.createCard}
          >
            <BlurView intensity={25} tint="dark" style={styles.createCardBlur}>
              <View style={styles.createCardContent}>
                <View style={[styles.createIcon, { backgroundColor: `${colors.primary}15` }]}>
                  <Key size={40} color={colors.primary} />
                </View>
                <Text style={styles.createHint}>
                  Your account ID will look like:{'\n'}
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>VPN-XXXX-XXXX-XXXX</Text>
                </Text>
              </View>
            </BlurView>
          </AnimatedView>

          {error && (
            <Text style={[styles.errorText, { color: '#EF4444' }]}>{error}</Text>
          )}

          <AnimatedPressable
            style={({ pressed }) => [
              styles.primaryButton,
              { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: loading ? 0.7 : pressed ? 0.9 : 1 },
            ]}
            onPress={handleCreateAccount}
            disabled={loading}
          >
            <LinearGradient
              colors={[colors.primary, '#4A8BC4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              {loading ? (
                <RefreshCw size={20} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Generate My Account ID</Text>
                  <Key size={20} color="#FFFFFF" />
                </>
              )}
            </LinearGradient>
          </AnimatedPressable>

          <Pressable onPress={() => setMode('choice')} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.modeTitle}>Your Account ID</Text>
          <Text style={styles.modeSubtitle}>
            Save this ID! You'll need it to access your account on other devices.
          </Text>

          <AnimatedView
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.idCard}
          >
            <BlurView intensity={30} tint="dark" style={styles.idCardBlur}>
              <Text style={[styles.generatedId, { color: colors.primary }]}>
                {generatedId}
              </Text>
              <View style={styles.idActions}>
                <Pressable
                  style={[styles.idAction, { backgroundColor: `${colors.primary}20` }]}
                  onPress={handleCopyId}
                >
                  {copied ? (
                    <Check size={20} color={colors.success} />
                  ) : (
                    <Copy size={20} color={colors.primary} />
                  )}
                  <Text style={[styles.idActionText, { color: copied ? colors.success : colors.primary }]}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.idAction, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}
                  onPress={handleShareId}
                >
                  <ArrowRight size={20} color="#FFFFFF" />
                  <Text style={styles.idActionText}>Share</Text>
                </Pressable>
              </View>
            </BlurView>
          </AnimatedView>

          <AnimatedView
            entering={FadeInDown.delay(300).duration(400)}
            style={styles.warningCard}
          >
            <BlurView intensity={20} tint="dark" style={styles.warningCardBlur}>
              <Shield size={18} color="#F59E0B" />
              <Text style={styles.warningText}>
                This is your only way to access your account. Store it securely.
              </Text>
            </BlurView>
          </AnimatedView>

          <AnimatedPressable
            entering={FadeInUp.delay(400).duration(400)}
            style={({ pressed }) => [
              styles.primaryButton,
              { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={handleContinue}
          >
            <LinearGradient
              colors={[colors.success, '#1B9B5E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.primaryButtonText}>Continue to App</Text>
              <ArrowRight size={20} color="#FFFFFF" />
            </LinearGradient>
          </AnimatedPressable>
        </>
      )}
    </AnimatedView>
  );

  const renderLogin = () => (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <AnimatedView
        entering={FadeInDown.delay(100).duration(500).easing(Easing.out(Easing.ease))}
        style={styles.loginContainer}
      >
        <Text style={styles.modeTitle}>Enter Account ID</Text>
        <Text style={styles.modeSubtitle}>
          Enter your account ID to access VPN Shield on this device
        </Text>

        <AnimatedView
          entering={FadeInDown.delay(200).duration(400)}
          style={styles.inputCard}
        >
          <BlurView intensity={25} tint="dark" style={styles.inputCardBlur}>
            <TextInput
              style={styles.input}
              placeholder="VPN-XXXX-XXXX-XXXX"
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
              value={accountId}
              onChangeText={(text) => setAccountId(formatAccountId(text))}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={19}
            />
          </BlurView>
        </AnimatedView>

        {error && (
          <Text style={[styles.errorText, { color: '#EF4444' }]}>{error}</Text>
        )}

        <AnimatedPressable
          style={({ pressed }) => [
            styles.primaryButton,
            { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: loading ? 0.7 : pressed ? 0.9 : 1 },
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          <LinearGradient
            colors={[colors.primary, '#4A8BC4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.buttonGradient}
          >
            {loading ? (
              <RefreshCw size={20} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Login</Text>
                <ArrowRight size={20} color="#FFFFFF" />
              </>
            )}
          </LinearGradient>
        </AnimatedPressable>

        <Pressable onPress={() => { setMode('choice'); setError(null); }} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </AnimatedView>
    </TouchableWithoutFeedback>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Gradient Background */}
      <LinearGradient
        colors={['#0a0a0a', '#000000', '#0a0a0a']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Header Badge */}
        <AnimatedView
          entering={FadeInDown.delay(100).duration(500).easing(Easing.out(Easing.ease))}
          style={styles.headerBadge}
        >
          <BlurView intensity={40} tint="dark" style={styles.headerBadgeBlur}>
            <Shield size={14} color={colors.primary} />
            <Text style={styles.headerBadgeText}>VPN Shield</Text>
          </BlurView>
        </AnimatedView>

        {/* Content based on mode */}
        {mode === 'choice' && renderChoice()}
        {mode === 'create' && renderCreate()}
        {mode === 'login' && renderLogin()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  // Header Badge
  headerBadge: {
    alignSelf: 'center',
    marginBottom: 32,
  },
  headerBadgeBlur: {
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
  headerBadgeText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
  // Choice Mode
  choiceContainer: {
    flex: 1,
  },
  choiceTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 10,
    textAlign: 'center',
  },
  choiceSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
  },
  optionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
  },
  optionCardBlur: {
    overflow: 'hidden',
  },
  optionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 18,
  },
  deviceInfo: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  deviceInfoBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    overflow: 'hidden',
  },
  deviceInfoText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  // Create Mode
  createContainer: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  modeSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  createCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 24,
  },
  createCardBlur: {
    overflow: 'hidden',
  },
  createCardContent: {
    alignItems: 'center',
    padding: 32,
    gap: 20,
  },
  createIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createHint: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 24,
  },
  // ID Card
  idCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 20,
  },
  idCardBlur: {
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  generatedId: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 24,
  },
  idActions: {
    flexDirection: 'row',
    gap: 12,
  },
  idAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  idActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  warningCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    marginBottom: 32,
  },
  warningCardBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    overflow: 'hidden',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#FCD34D',
    lineHeight: 19,
  },
  // Login Mode
  loginContainer: {
    flex: 1,
  },
  inputCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 20,
  },
  inputCardBlur: {
    overflow: 'hidden',
  },
  input: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    letterSpacing: 2,
  },
  // Common
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    borderRadius: 9999,
    overflow: 'hidden',
    marginTop: 8,
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
  backButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
});
