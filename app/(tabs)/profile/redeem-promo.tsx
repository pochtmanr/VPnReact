import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, Loader2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

const API_BASE = process.env.EXPO_PUBLIC_VPN_API_URL || '';

export default function RedeemPromoScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { accountId, refreshDevices } = useAuth();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    days_granted?: number;
  } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/vpn/redeem-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), account_id: accountId }),
      });

      const data = await res.json();
      setResult(data);

      if (data.success) {
        // Refresh subscription status
        await refreshDevices();
      }
    } catch {
      setResult({
        success: false,
        message: 'Network error. Please check your connection and try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>

          <Animated.View
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.header}
          >
            <Gift size={48} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>
              {t('profile.redeemPromo', 'Redeem Promo Code')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('profile.redeemPromoDesc', 'Enter your promo code to unlock Pro features')}
            </Text>
          </Animated.View>

          {/* Input */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.inputContainer}
          >
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                  color: colors.text,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
                },
              ]}
              placeholder={t('profile.promoPlaceholder', 'Enter promo code')}
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleRedeem}
            />

            <Pressable
              onPress={handleRedeem}
              disabled={loading || !code.trim()}
              style={[
                styles.submitButton,
                {
                  backgroundColor: colors.primary,
                  opacity: loading || !code.trim() ? 0.5 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {t('profile.redeem', 'Redeem')}
                </Text>
              )}
            </Pressable>
          </Animated.View>

          {/* Result */}
          {result && (
            <Animated.View
              entering={FadeInDown.duration(300).easing(Easing.out(Easing.ease))}
              style={[
                styles.resultContainer,
                {
                  backgroundColor: result.success
                    ? isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)'
                    : isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)',
                  borderColor: result.success
                    ? 'rgba(34,197,94,0.3)'
                    : 'rgba(239,68,68,0.3)',
                },
              ]}
            >
              <Text
                style={[
                  styles.resultText,
                  { color: result.success ? '#22c55e' : '#ef4444' },
                ]}
              >
                {result.message}
              </Text>
              {result.success && result.days_granted && (
                <Text style={[styles.resultDays, { color: colors.textSecondary }]}>
                  {result.days_granted} days of Pro added
                </Text>
              )}
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    marginBottom: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  inputContainer: {
    gap: 16,
  },
  input: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    letterSpacing: 2,
  },
  submitButton: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  resultContainer: {
    marginTop: 24,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  resultText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  resultDays: {
    fontSize: 14,
  },
});
