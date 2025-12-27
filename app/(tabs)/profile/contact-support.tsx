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
import React, { useState, useCallback } from 'react';
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
import { supabase } from '@/lib/supabase';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

interface SupportOptionProps {
  icon: React.ElementType;
  label: string;
  subtitle: string;
  onPress: () => void;
  iconColor?: string;
}

function SupportOption({ icon: Icon, label, subtitle, onPress, iconColor }: SupportOptionProps) {
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
      <Text style={[styles.supportSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
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

  const [bugDescription, setBugDescription] = useState('');
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [bugReportExpanded, setBugReportExpanded] = useState(false);

  const faqs = [
    {
      question: 'How do I connect to a VPN server?',
      answer: 'Go to the VPN tab and tap the connect button. You can also select a specific server from the Servers tab before connecting.',
    },
    {
      question: 'Why is my connection slow?',
      answer: 'Try connecting to a server closer to your location. Server load and your internet speed also affect VPN performance.',
    },
    {
      question: 'How do I change my subscription plan?',
      answer: 'Go to Profile > Subscription to view and manage your current plan. You can upgrade or downgrade at any time.',
    },
    {
      question: 'Is my data secure?',
      answer: 'Yes! We use military-grade AES-256 encryption and maintain a strict no-logs policy to protect your privacy.',
    },
  ];

  const handleSubmitBugReport = useCallback(async () => {
    if (!bugDescription.trim()) {
      Alert.alert('Missing Information', 'Please describe the bug you encountered.');
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
        Alert.alert('Error', 'Failed to submit bug report. Please try again.');
        return;
      }

      setBugDescription('');
      setBugReportExpanded(false);
      Alert.alert(
        'Thank You!',
        'Your bug report has been submitted. We appreciate your feedback!',
      );
    } catch (err) {
      console.error('Bug report error:', err);
      Alert.alert('Error', 'Failed to submit bug report. Please try again.');
    } finally {
      setIsSubmittingBug(false);
    }
  }, [bugDescription, account?.account_id]);

  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@vpnshield.app?subject=Support Request');
  };

  const handleTelegram = () => {
    Linking.openURL('https://t.me/vpnshield_bot');
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
            Help & Support
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <AnimatedView
          entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
        >
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Get help from our team
          </Text>
        </AnimatedView>

        {/* Quick Support Options */}
        <AnimatedView
          entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
          style={styles.supportOptions}
        >
          <SupportOption
            icon={Mail}
            label="Email Us"
            subtitle="support@vpnshield.app"
            onPress={handleEmailSupport}
            iconColor={colors.primary}
          />
          <SupportOption
            icon={MessageCircle}
            label="Telegram"
            subtitle="@vpnshield_bot"
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
            style={styles.bugReportHeader}
          >
            <View style={styles.bugReportHeaderLeft}>
              <View
                style={[
                  styles.bugIcon,
                  { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)' },
                ]}
              >
                <Bug size={20} color="#EF4444" />
              </View>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Report a Bug</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                  Help us improve the app
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
                  },
                ]}
                value={bugDescription}
                onChangeText={setBugDescription}
                placeholder="Describe the bug you encountered..."
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
                  },
                  isSubmittingBug && { opacity: 0.6 },
                ]}
              >
                {isSubmittingBug ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Send size={18} color="#fff" />
                    <Text style={styles.submitBugButtonText}>Submit Report</Text>
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Frequently Asked Questions</Text>

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
            },
          ]}
        >
          <Clock size={20} color="#3B82F6" />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Response Times</Text>
            <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
              Free users: 48-72 hours{'\n'}
              Pro/Premium users: 24 hours
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
    paddingRight: 12,
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
