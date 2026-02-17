import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    ArrowLeft,
    Bug,
    ChevronDown,
    ChevronUp,
    Clock,
    Mail,
    MessageCircle,
    Send,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, {
    Easing,
    FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useRTL } from '@/i18n/useRTL';
import { supabase } from '@/lib/supabase';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

interface SupportOptionProps {
  icon: React.ElementType;
  label: string;
  onPress: () => void;
  iconColor?: string;
}

function SupportOption({ icon: Icon, label, onPress, iconColor }: SupportOptionProps) {
  const { colors, isDark } = useTheme();
  const defaultIconColor = iconColor || colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.supportOption,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View
        style={[
          styles.supportIcon,
          { backgroundColor: isDark ? `${defaultIconColor}20` : `${defaultIconColor}15` },
        ]}
      >
        <Icon size={24} color={defaultIconColor} />
      </View>
      <Text style={[styles.supportLabel, { color: colors.text }]}>{label}</Text>

    </Pressable>
  );
}

interface FAQItemProps {
  question: string;
  answer: string;
}

function FAQItem({ question, answer }: FAQItemProps) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={[
        styles.faqItem,
        { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
      ]}
    >
      <View style={styles.faqHeader}>
        <Text style={[styles.faqQuestion, { color: colors.text }]}>{question}</Text>
        {expanded ? (
          <ChevronUp size={18} color={colors.textMuted} />
        ) : (
          <ChevronDown size={18} color={colors.textMuted} />
        )}
      </View>
      {expanded && (
        <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>{answer}</Text>
      )}
    </Pressable>
  );
}

export default function ContactSupportScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { account } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL, flexDirection, textAlign } = useRTL();

  const [bugDescription, setBugDescription] = useState('');
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [bugReportExpanded, setBugReportExpanded] = useState(false);

  const faqs = useMemo(() => [
    {
      question: t('profile.support.faq.connect.question'),
      answer: t('profile.support.faq.connect.answer'),
    },
    {
      question: t('profile.support.faq.slow.question'),
      answer: t('profile.support.faq.slow.answer'),
    },
    {
      question: t('profile.support.faq.subscription.question'),
      answer: t('profile.support.faq.subscription.answer'),
    },
    {
      question: t('profile.support.faq.secure.question'),
      answer: t('profile.support.faq.secure.answer'),
    },
  ], [t]);

  const handleSubmitBugReport = useCallback(async () => {
    if (!bugDescription.trim()) {
      Alert.alert(t('profile.support.bugReport.missingInfo'), t('profile.support.bugReport.pleaseDescribe'));
      return;
    }

    setIsSubmittingBug(true);
    try {
      const { error } = await supabase.from('bug_reports').insert({
        account_id: account?.account_id || null,
        description: bugDescription.trim(),
        app_version: '1.0.0',
        platform: 'ios',
      });

      if (error) {
        console.error('Bug report error:', error);
        Alert.alert(t('profile.support.bugReport.errorTitle'), t('profile.support.bugReport.error'));
        return;
      }

      setBugDescription('');
      setBugReportExpanded(false);
      Alert.alert(
        t('profile.support.bugReport.thankYou'),
        t('profile.support.bugReport.success'),
      );
    } catch (err) {
      console.error('Bug report error:', err);
      Alert.alert(t('profile.support.bugReport.errorTitle'), t('profile.support.bugReport.error'));
    } finally {
      setIsSubmittingBug(false);
    }
  }, [bugDescription, account?.account_id, t]);

  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@simnetiq.store?subject=Support Request');
  };

  const handleTelegram = () => {
    Linking.openURL('https://t.me/DopplerSupportBot');
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
        <View style={[styles.header, { flexDirection: flexDirection('row') }]}>
          {renderBackButton()}
          <Text style={[styles.headerTitle, { color: colors.text, textAlign: textAlign('center') }]}>
            {t('profile.support.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <AnimatedView
          entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
        >
          <Text style={[styles.description, { color: colors.textSecondary, textAlign: textAlign('left') }]}>
            {t('profile.support.description')}
          </Text>
        </AnimatedView>

        {/* Quick Support Options */}
        <AnimatedView
          entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
          style={[styles.supportOptions, { flexDirection: flexDirection('row') }]}
        >
          <SupportOption
            icon={Mail}
            label={t('profile.support.emailUs')}
            onPress={handleEmailSupport}
            iconColor={colors.primary}
          />
          <SupportOption
            icon={MessageCircle}
            label={t('profile.support.telegram')}
            onPress={handleTelegram}
            iconColor="#0088CC"
          />
        </AnimatedView>

        {/* Bug Report Card */}
        <AnimatedView
          entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.bugReportCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Pressable
            onPress={() => setBugReportExpanded(!bugReportExpanded)}
            style={[styles.bugReportHeader, { flexDirection: flexDirection('row') }]}
          >
            <View style={[styles.bugReportHeaderLeft, { flexDirection: flexDirection('row') }]}>
              <View
                style={[
                  styles.bugIcon,
                  { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)' },
                ]}
              >
                <Bug size={20} color="#EF4444" />
              </View>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.support.bugReport.title')}</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                  {t('profile.support.bugReport.subtitle')}
                </Text>
              </View>
            </View>
            {bugReportExpanded ? (
              <ChevronUp size={20} color={colors.textMuted} />
            ) : (
              <ChevronDown size={20} color={colors.textMuted} />
            )}
          </Pressable>

          {bugReportExpanded && (
            <View style={styles.bugReportContent}>
              <TextInput
                style={[
                  styles.bugInput,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                    color: colors.text,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                    textAlign: textAlign('left'),
                  },
                ]}
                value={bugDescription}
                onChangeText={setBugDescription}
                placeholder={t('profile.support.bugReport.placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <Pressable
                onPress={handleSubmitBugReport}
                disabled={isSubmittingBug || !bugDescription.trim()}
                style={({ pressed }) => [
                  styles.submitBugButton,
                  {
                    backgroundColor: bugDescription.trim() ? '#3B82F6' : colors.border,
                    opacity: pressed ? 0.8 : 1,
                    flexDirection: flexDirection('row'),
                  },
                  isSubmittingBug && { opacity: 0.6 },
                ]}
              >
                {isSubmittingBug ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Send size={18} color="#fff" />
                    <Text style={styles.submitBugButtonText}>{t('profile.support.bugReport.submitReport')}</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </AnimatedView>

        {/* FAQ Card */}
        <AnimatedView
          entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.faqCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.support.faq.title')}</Text>

          <View style={styles.faqList}>
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </View>
        </AnimatedView>

        {/* Response Time Info */}
        <AnimatedView
          entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.infoCard,
            {
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
              flexDirection: flexDirection('row'),
            },
          ]}
        >
          <Clock size={20} color="#3B82F6" />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: colors.text, textAlign: textAlign('left') }]}>{t('profile.support.responseTime.title')}</Text>
            <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8', textAlign: textAlign('left') }]}>
              {t('profile.support.responseTime.freeUsers')}{'\n'}
              {t('profile.support.responseTime.proUsers')}
            </Text>
          </View>
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
    marginBottom: 20,
  },
  // Support Options
  supportOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  supportOption: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  supportIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  supportSubtitle: {
    fontSize: 12,
  },
  // Bug Report Card
  bugReportCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  bugReportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bugReportHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bugIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bugReportContent: {
    marginTop: 16,
    gap: 12,
  },
  bugInput: {
    fontSize: 15,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 100,
  },
  submitBugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitBugButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Section Titles
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  // FAQ Card
  faqCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  faqList: {
    marginTop: 12,
  },
  faqItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    paddingEnd: 12,
  },
  faqAnswer: {
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20,
  },
  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
