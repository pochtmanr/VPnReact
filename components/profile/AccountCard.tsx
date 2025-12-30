import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Check, Copy, Key } from 'lucide-react-native';
import React, { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

const AnimatedView = Animated.createAnimatedComponent(View);

interface AccountCardProps {
  cardStyle: { backgroundColor: string; borderColor: string };
  animationDelay?: number;
}

export const AccountCard = memo(function AccountCard({
  cardStyle,
  animationDelay = 50,
}: AccountCardProps) {
  const { colors, isDark } = useTheme();
  const { account } = useAuth();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyAccountId = useCallback(async () => {
    if (account?.account_id) {
      await Clipboard.setStringAsync(account.account_id);
      setCopied(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [account?.account_id]);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.accountCard, cardStyle]}
    >
      <View style={styles.accountHeader}>
        <View style={[styles.accountIcon, { backgroundColor: `${colors.primary}20` }]}>
          <Key size={24} color={colors.primary} />
        </View>
        <View style={styles.accountInfo}>
          <Text style={[styles.accountLabel, { color: colors.textSecondary }]}>{t('profile.accountId')}</Text>
          <Text style={[styles.accountId, { color: colors.text }]}>
            {account?.account_id || t('profile.notLoggedIn')}
          </Text>
        </View>
      </View>

      {account && (
        <Pressable
          onPress={handleCopyAccountId}
          style={({ pressed }) => [
            styles.copyButton,
            {
              backgroundColor: copied
                ? `${colors.success}20`
                : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          {copied ? (
            <>
              <Check size={16} color={colors.success} />
              <Text style={[styles.copyButtonText, { color: colors.success }]}>{t('profile.copied')}</Text>
            </>
          ) : (
            <>
              <Copy size={16} color={colors.primary} />
              <Text style={[styles.copyButtonText, { color: colors.primary }]}>{t('profile.copyId')}</Text>
            </>
          )}
        </Pressable>
      )}
    </AnimatedView>
  );
});

const styles = StyleSheet.create({
  accountCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
    marginStart: 14,
  },
  accountLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  accountId: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
