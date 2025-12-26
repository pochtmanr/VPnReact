import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Shield,
  ShieldCheck,
  Plus,
  Trash2,
  EyeOff,
  Users,
  Gamepad2,
  PlayCircle,
  Bug,
  Ban,
  BarChart3,
  X,
} from 'lucide-react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import {
  useParentalControls,
  CONTENT_CATEGORIES,
  ContentCategory,
} from '@/context/ParentalControlsContext';

const AnimatedView = Animated.createAnimatedComponent(View);

// Icon mapping for categories
const getCategoryIcon = (categoryId: ContentCategory, color: string) => {
  const iconProps = { size: 22, color };
  switch (categoryId) {
    case 'adult':
      return <Ban {...iconProps} />;
    case 'gambling':
      return <Ban {...iconProps} />;
    case 'social_media':
      return <Users {...iconProps} />;
    case 'gaming':
      return <Gamepad2 {...iconProps} />;
    case 'streaming':
      return <PlayCircle {...iconProps} />;
    case 'malware':
      return <Bug {...iconProps} />;
    case 'ads_trackers':
      return <EyeOff {...iconProps} />;
    default:
      return <Shield {...iconProps} />;
  }
};

export default function ParentalControlsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const {
    isEnabled,
    blockedCategories,
    customBlockedDomains,
    blockingStats,
    loading,
    toggleCategory,
    addBlockedDomain,
    removeBlockedDomain,
    toggleParentalControls,
    refreshStats,
  } = useParentalControls();

  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [domainInput, setDomainInput] = useState('');

  useEffect(() => {
    if (isEnabled) {
      refreshStats();
    }
  }, [isEnabled]);

  const handleAddDomain = async () => {
    if (domainInput.trim()) {
      await addBlockedDomain(domainInput.trim());
      setDomainInput('');
      setShowAddDomainModal(false);
    }
  };

  const handleRemoveDomain = (domain: string) => {
    Alert.alert(
      'Remove Domain',
      `Remove "${domain}" from blocked list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeBlockedDomain(domain),
        },
      ]
    );
  };

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <AnimatedView
          entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
          style={styles.header}
        >
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              Parental Controls
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Manage content filtering and restrictions
            </Text>
          </View>
        </AnimatedView>

        {/* Main Toggle Card */}
        <AnimatedView
          entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.mainCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <View style={styles.mainCardContent}>
            <View style={[
              styles.mainCardIcon,
              { backgroundColor: isEnabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(107, 114, 128, 0.15)' }
            ]}>
              {isEnabled ? (
                <ShieldCheck size={32} color="#22C55E" />
              ) : (
                <Shield size={32} color="#6B7280" />
              )}
            </View>
            <View style={styles.mainCardText}>
              <Text style={[styles.mainCardTitle, { color: colors.text }]}>
                {isEnabled ? 'Protection Active' : 'Protection Disabled'}
              </Text>
              <Text style={[styles.mainCardSubtitle, { color: colors.textSecondary }]}>
                {isEnabled
                  ? `${blockedCategories.length} categories blocked`
                  : 'Enable to start filtering content'
                }
              </Text>
            </View>
            <Switch
              value={isEnabled}
              onValueChange={toggleParentalControls}
              trackColor={{ false: colors.border, true: '#22C55E' }}
              thumbColor={isEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
              ios_backgroundColor={colors.border}
            />
          </View>
        </AnimatedView>

        {/* Stats Card (when enabled) */}
        {isEnabled && blockingStats && (
          <AnimatedView
            entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.statsCard,
              {
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
                borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
              },
            ]}
          >
            <BarChart3 size={20} color="#3B82F6" />
            <View style={styles.statsContent}>
              <Text style={[styles.statsTitle, { color: colors.text }]}>
                {blockingStats.totalBlocked.toLocaleString()} requests blocked
              </Text>
              <Text style={[styles.statsSubtitle, { color: colors.textSecondary }]}>
                Protecting your family from harmful content
              </Text>
            </View>
          </AnimatedView>
        )}

        {/* Content Categories */}
        <AnimatedView
          entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.sectionCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Content Categories
          </Text>
          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Select categories to block when VPN is connected
          </Text>

          {CONTENT_CATEGORIES.map((category, index) => (
            <View key={category.id}>
              {index > 0 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
              <View style={styles.categoryRow}>
                <View style={styles.categoryLeft}>
                  <View style={[
                    styles.categoryIcon,
                    { backgroundColor: `${category.color}20` }
                  ]}>
                    {getCategoryIcon(category.id, category.color)}
                  </View>
                  <View style={styles.categoryText}>
                    <Text style={[styles.categoryName, { color: colors.text }]}>
                      {category.name}
                    </Text>
                    <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>
                      {category.description}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={blockedCategories.includes(category.id)}
                  onValueChange={() => toggleCategory(category.id)}
                  trackColor={{ false: colors.border, true: category.color }}
                  thumbColor={blockedCategories.includes(category.id) ? '#fff' : isDark ? '#666' : '#f4f4f4'}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </View>
          ))}
        </AnimatedView>

        {/* Custom Blocked Domains */}
        <AnimatedView
          entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.sectionCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Custom Blocked Sites
              </Text>
              <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
                Add specific websites to block
              </Text>
            </View>
            <Pressable
              onPress={() => setShowAddDomainModal(true)}
              style={[
                styles.addButton,
                { backgroundColor: colors.primary }
              ]}
            >
              <Plus size={18} color="#fff" />
            </Pressable>
          </View>

          {customBlockedDomains.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                No custom sites blocked yet
              </Text>
            </View>
          ) : (
            customBlockedDomains.map((domain, index) => (
              <View key={domain}>
                {index > 0 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
                <View style={styles.domainRow}>
                  <Text style={[styles.domainText, { color: colors.text }]}>
                    {domain}
                  </Text>
                  <Pressable
                    onPress={() => handleRemoveDomain(domain)}
                    style={styles.removeButton}
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </AnimatedView>
      </ScrollView>

      {/* Add Domain Modal */}
      <Modal
        visible={showAddDomainModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddDomainModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent,
            { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }
          ]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Block Website
              </Text>
              <Pressable onPress={() => setShowAddDomainModal(false)}>
                <X size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              Enter the domain to block (e.g., example.com)
            </Text>

            <TextInput
              style={[
                styles.domainInput,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  color: colors.text,
                }
              ]}
              placeholder="example.com"
              placeholderTextColor={colors.textMuted}
              value={domainInput}
              onChangeText={setDomainInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Pressable
              onPress={handleAddDomain}
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.modalButtonText}>Block Site</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
  },
  mainCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  mainCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCardText: {
    flex: 1,
    marginLeft: 14,
  },
  mainCardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  mainCardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  statsContent: {
    flex: 1,
  },
  statsTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  statsSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    marginBottom: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    marginLeft: 12,
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
  },
  categoryDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  domainText: {
    fontSize: 15,
  },
  removeButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalDescription: {
    fontSize: 14,
    marginBottom: 20,
  },
  domainInput: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
