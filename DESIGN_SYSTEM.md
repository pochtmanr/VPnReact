# DopplerVPN Design & Build Principles

**Version:** 1.0
**Last Updated:** 2026-01-20
**Purpose:** Authoritative specification for building new DopplerVPN screens with 100% visual and structural consistency.

---

## Table of Contents

1. [Overview & Core Principles](#1-overview--core-principles)
2. [Color System & Theming](#2-color-system--theming)
3. [Typography Hierarchy](#3-typography-hierarchy)
4. [Spacing, Padding & Layout](#4-spacing-padding--layout)
5. [Component Library](#5-component-library)
6. [Screen Structure Pattern](#6-screen-structure-pattern)
7. [Navigation & Tab Bar](#7-navigation--tab-bar)
8. [RTL/LTR Internationalization](#8-rtlltr-internationalization)
9. [Animation Guidelines](#9-animation-guidelines)
10. [Implementation Constraints](#10-implementation-constraints)
11. [Do / Don't](#11-do--dont)
12. [Pre-Implementation Checklist](#12-pre-implementation-checklist)

---

## 1. Overview & Core Principles

### Design Philosophy
DopplerVPN follows a **glassmorphic, minimalist design system** with:
- Subtle translucent cards on gradient backgrounds
- Consistent spacing and border radius values
- Icons from `lucide-react-native`
- Smooth, purposeful animations using `react-native-reanimated`
- Full support for light/dark modes and RTL languages

### Technology Stack
- **Framework:** React Native with Expo Router (file-based routing)
- **Styling:** StyleSheet API (no styled-components, no Tailwind)
- **Animations:** `react-native-reanimated` (v3+)
- **Icons:** `lucide-react-native` (never use other icon libraries)
- **i18n:** `react-i18next` with RTL support
- **Theming:** Context-based (`ThemeContext`)

---

## 2. Color System & Theming

### Theme Context
All colors must be accessed via `useTheme()` hook from `@/context/ThemeContext`.

**Never hardcode colors except:**
- Pure white `#FFFFFF` or `#fff` for text on colored backgrounds (CTAs)
- Pure black `#000000` or `#000` for shadows or gradients
- Brand/accent colors (e.g., `#3B82F6` blue, `#22C55E` green, `#EF4444` red)

### Color Tokens

#### Light Mode
```typescript
{
  primary: '#3B82F6',           // Primary brand blue
  primaryLight: '#60A5FA',
  background: '#FFFFFF',
  backgroundSecondary: '#F2F2F7',
  backgroundTertiary: '#E5E5EA',
  surface: '#FFFFFF',
  surfaceLight: '#F2F2F7',
  surfaceBorder: '#C6C6C8',
  text: '#000000',
  textSecondary: '#3C3C43',
  textMuted: '#8E8E93',
  success: '#22C55E',
  warning: '#FF9500',
  error: '#EF4444',
  info: '#3B82F6',
  connected: '#22C55E',
  connecting: '#3B82F6',
  disconnected: '#8E8E93',
  border: '#C6C6C8',
  icon: '#8E8E93',
}
```

#### Dark Mode
```typescript
{
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  background: '#151718',
  backgroundSecondary: '#1c1e1f',
  backgroundTertiary: '#242628',
  surface: '#1c1e1f',
  surfaceLight: '#242628',
  surfaceBorder: '#333',
  text: '#ECEDEE',
  textSecondary: '#9BA1A6',
  textMuted: '#687076',
  success: '#22C55E',
  warning: '#FF9500',
  error: '#EF4444',
  info: '#3B82F6',
  connected: '#22C55E',
  connecting: '#3B82F6',
  disconnected: '#687076',
  border: '#333',
  icon: '#9BA1A6',
}
```

### Card Surface Colors (Dynamic)
Cards use **translucent backgrounds** that adapt to theme:

**Light Mode:**
```typescript
backgroundColor: 'rgba(255, 255, 255, 0.8)'
borderColor: 'rgba(0, 0, 0, 0.05)'
```

**Dark Mode:**
```typescript
backgroundColor: 'rgba(255, 255, 255, 0.05)'
borderColor: 'rgba(255, 255, 255, 0.08)'
```

### Background Gradients
Screens use `LinearGradient` from `expo-linear-gradient` as a backdrop:

**Light Mode:**
```typescript
colors={['#ffffff', '#fafafa', '#f5f5f5']}
locations={[0, 0.5, 1]}
style={StyleSheet.absoluteFill}
```

**Dark Mode:**
```typescript
colors={['#000000', '#0a0a0a', '#000000']}
locations={[0, 0.5, 1]}
style={StyleSheet.absoluteFill}
```

---

## 3. Typography Hierarchy

### Font Sizes & Weights

| Element               | Size | Weight | Usage                          |
|-----------------------|------|--------|--------------------------------|
| **Screen Title**      | 28   | 700    | Top-level page heading         |
| **Screen Subtitle**   | 16   | 400    | Below screen title             |
| **Section Title**     | 16-17| 600    | Card/section headings          |
| **Section Subtitle**  | 13   | 400    | Below section title            |
| **Body Text**         | 15-16| 400-600| Default readable text          |
| **Secondary Text**    | 13-14| 400    | Descriptions, hints            |
| **Caption**           | 11-12| 400-500| Labels, metadata               |
| **Button Text**       | 15-16| 600    | CTA button labels              |
| **Stat Value**        | 18-32| 700    | Numeric values, metrics        |
| **Stat Label**        | 11   | 400    | Labels below stat values       |

### Text Color Hierarchy
- **Primary text:** `colors.text`
- **Secondary/description:** `colors.textSecondary`
- **Muted/disabled:** `colors.textMuted`
- **Interactive (links, buttons):** `colors.primary`

### Line Height & Spacing
- Body text: `lineHeight: 20-22`
- Headings: `lineHeight: 28-32`
- Compact text (labels): `lineHeight: 18-19`

---

## 4. Spacing, Padding & Layout

### Border Radius Scale

| Element              | Radius |
|----------------------|--------|
| Small icon containers| 10-12  |
| Buttons (standard)   | 12-14  |
| Medium cards         | 16-20  |
| Large cards          | 20-24  |
| Circular buttons     | 9999   |

### Padding & Margin Scale

| Size      | Value | Usage                           |
|-----------|-------|---------------------------------|
| **XXS**   | 2-4   | Icon spacing, tight gaps        |
| **XS**    | 6-8   | Small gaps, inline spacing      |
| **SM**    | 10-12 | Standard gap, card internals    |
| **MD**    | 14-16 | Card padding, section spacing   |
| **LG**    | 18-20 | Screen padding horizontal       |
| **XL**    | 24-32 | Vertical section spacing        |
| **XXL**   | 40+   | Major layout sections           |

### Safe Area & Scroll Padding
All scrollable screens must account for safe areas:
```typescript
const insets = useSafeAreaInsets();

contentContainerStyle={{
  paddingTop: insets.top + 12,
  paddingBottom: insets.bottom + 100,  // Extra space for tab bar
  paddingHorizontal: 20,
}}
```

### Card Standard Padding
```typescript
padding: 16,          // Standard card padding
paddingVertical: 32,  // Hero/feature cards
paddingHorizontal: 20,
```

---

## 5. Component Library

### 5.1 Cards

#### Standard Card
```typescript
<View style={[
  styles.card,
  {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  }
]}>
  {/* Card content */}
</View>
```

#### Hero Card (larger, more prominent)
```typescript
borderRadius: 24,
paddingVertical: 32,
paddingHorizontal: 20,
```

### 5.2 Buttons

#### Primary Button (from `components/ui/Button.tsx`)
```typescript
<Button
  title="Button Label"
  variant="primary"      // primary | secondary | outline | danger
  size="large"           // small | medium | large
  onPress={handlePress}
  icon={<IconComponent size={18} color="#fff" />}  // Optional
  loading={false}
  disabled={false}
/>
```

**Variants:**
- `primary`: Blue background (`#3B82F6`), white text
- `secondary`: Gray background, primary text
- `outline`: Transparent, blue border
- `danger`: Red background (`#EF4444`), white text

**Button Styling:**
```typescript
borderRadius: 9999,  // Fully rounded pill shape
height: { small: 36, medium: 48, large: 56 }
```

#### Activation Button (from `components/ui/ActivationButton.tsx`)
Large circular button with glow effect for toggles:
```typescript
<ActivationButton
  isEnabled={isEnabled}
  onToggle={handleToggle}
  enabledLabel="Protection Active"
  disabledLabel="Protection Disabled"
  enabledSubtitle="Tap to disable"
  disabledSubtitle="Tap to enable"
  EnabledIcon={ShieldCheck}
  DisabledIcon={ShieldOff}
  disabled={false}
  accentColor="#3B82F6"
/>
```

- **Size:** 160x160 circular button
- **Animations:** Pulsing glow when enabled, spring press animation
- **Gradient:** Uses `LinearGradient` with two-tone effect

### 5.3 Icon Containers

Standard pattern for icon badges:
```typescript
<View style={[
  styles.iconContainer,
  {
    width: 40-48,
    height: 40-48,
    borderRadius: 10-14,
    backgroundColor: isDark
      ? `${iconColor}20`       // 20 = ~12% opacity
      : `${iconColor}15`,      // 15 = ~8% opacity
    alignItems: 'center',
    justifyContent: 'center',
  }
]}>
  <IconComponent size={20-24} color={iconColor} />
</View>
```

### 5.4 QuickStatsRow (from `components/ui/QuickStatsRow.tsx`)

Displays 2-3 statistics in a horizontal row with dividers:
```typescript
<QuickStatsRow
  stats={[
    {
      icon: Lock,
      iconColor: colors.primary,
      value: 'WireGuard',
      label: 'Protocol'
    },
    {
      icon: Gauge,
      iconColor: colors.info,
      value: '45ms',
      label: 'Latency'
    },
  ]}
/>
```

**Structure:**
- Centered icons (16px) above values
- Large bold value text (18px, weight 700)
- Small label below (11px)
- Vertical dividers between stats

### 5.5 Switch Component

Use React Native `Switch` with theme-aware colors:
```typescript
<Switch
  value={isEnabled}
  onValueChange={handleToggle}
  trackColor={{ false: colors.border, true: '#3B82F6' }}
  thumbColor={isEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
  ios_backgroundColor={colors.border}
  disabled={false}
/>
```

### 5.6 Modal Pattern

Standard modal overlay:
```typescript
<Modal
  visible={visible}
  transparent={true}
  animationType="slide"  // or "fade"
  onRequestClose={onClose}
>
  <View style={styles.modalOverlay}>
    <Pressable style={styles.modalBackdrop} onPress={onClose} />
    <View style={[
      styles.modalContent,
      { backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }
    ]}>
      {/* Modal header with title and close button */}
      {/* Modal body */}
    </View>
  </View>
</Modal>
```

**Styling:**
```typescript
modalOverlay: {
  flex: 1,
  justifyContent: 'flex-end',  // Bottom sheet style
  // OR 'center' for centered modal
},
modalBackdrop: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',  // For centered modal
  // OR 'transparent' for bottom sheet
},
modalContent: {
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  // OR borderRadius: 20 for centered
  padding: 20,
},
```

### 5.7 ScrollShadow Wrapper

All scrollable content should use `ScrollShadow` for gradient fade at edges:
```typescript
<ScrollShadow size={60}>
  <Animated.ScrollView>
    {/* Content */}
  </Animated.ScrollView>
</ScrollShadow>
```

### 5.8 Text Input

Standard input styling:
```typescript
<TextInput
  style={[
    styles.input,
    {
      backgroundColor: isDark
        ? 'rgba(255, 255, 255, 0.05)'
        : 'rgba(0, 0, 0, 0.03)',
      color: colors.text,
      borderColor: isDark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.05)',
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 15,
    }
  ]}
  placeholder="Enter text"
  placeholderTextColor={colors.textMuted}
/>
```

---

## 6. Screen Structure Pattern

All tab screens follow this exact structure:

```typescript
export default function ScreenName() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isRTL, flexDirection, textAlign } = useRTL();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. Status Bar */}
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* 2. Background Gradient */}
      <LinearGradient
        colors={isDark
          ? ['#000000', '#0a0a0a', '#000000']
          : ['#ffffff', '#fafafa', '#f5f5f5']
        }
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* 3. Scrollable Content with Shadow */}
      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={/* optional */}
        >
          {/* 4. Header */}
          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.header}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              {t('screen.title')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('screen.subtitle')}
            </Text>
          </AnimatedView>

          {/* 5. Content Cards (staggered animations) */}
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.card, cardStyle]}
          >
            {/* Card content */}
          </AnimatedView>

          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.card, cardStyle]}
          >
            {/* Card content */}
          </AnimatedView>

          {/* ... more cards with increasing delays (50ms increments) */}
        </Animated.ScrollView>
      </ScrollShadow>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, marginTop: 4 },
  // ... rest of styles
});
```

### Key Requirements:
1. ✅ Always use `useSafeAreaInsets()` for padding
2. ✅ Always wrap in `ScrollShadow`
3. ✅ Always use `Animated.ScrollView` from `react-native-reanimated`
4. ✅ Always use staggered `FadeInDown` animations (0, 50, 100, 150ms delays)
5. ✅ Always include bottom padding of `insets.bottom + 100` for tab bar clearance

---

## 7. Navigation & Tab Bar

### Tab Structure (from `app/(tabs)/_layout.tsx`)

Uses Expo Router's `NativeTabs`:
```typescript
<NativeTabs>
  <NativeTabs.Trigger name="index">
    <Icon
      sf={{ default: 'shield', selected: 'shield.checkered' }}
      androidSrc={{
        default: <VectorIcon family={MaterialCommunityIcons} name="shield-outline" />,
        selected: <VectorIcon family={MaterialCommunityIcons} name="shield-check" />,
      }}
    />
    <Label>{t('navigation.tabs.vpn')}</Label>
  </NativeTabs.Trigger>
  {/* ... more tabs */}
</NativeTabs>
```

### Tab Order
1. `index` - VPN (home)
2. `filter` - Content Filter
3. `adblock` - Ad Block
4. `profile` - Profile/Settings

### Back Button Pattern (for sub-screens)

Standard back button for screens with navigation header:
```typescript
<Pressable
  style={[
    styles.backButton,
    {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  ]}
  onPress={() => router.back()}
  hitSlop={12}
>
  <ArrowLeft size={20} color={colors.text} />
</Pressable>
```

---

## 8. RTL/LTR Internationalization

### RTL Hook Usage

Always use `useRTL()` from `@/i18n/useRTL` for layouts:

```typescript
const { isRTL, flexDirection, textAlign } = useRTL();

// Apply to flex containers
<View style={{ flexDirection: flexDirection('row') }}>
  {/* Content auto-mirrors for RTL */}
</View>

// Apply to text alignment
<Text style={{ textAlign: textAlign('left') }}>
  {/* Auto-aligns right in RTL */}
</Text>
```

### RTL Rules

1. **FlexDirection:** Always use `flexDirection('row')` helper, never hardcode `'row'`
2. **Text Alignment:** Use `textAlign('left')` / `textAlign('center')` helpers
3. **Margins/Padding:** Use `marginStart` / `marginEnd` instead of `marginLeft` / `marginRight`
4. **Absolute Positioning:** Avoid `left` / `right`, use flex alignment instead
5. **Icons with Directionality:** Use `iconRotation(true)` for arrows/chevrons

### RTL-Safe Patterns

✅ **Correct:**
```typescript
<View style={{
  flexDirection: flexDirection('row'),
  marginStart: 12,
  paddingEnd: 16,
}}>
  <Text style={{ textAlign: textAlign('left') }}>Hello</Text>
</View>
```

❌ **Incorrect:**
```typescript
<View style={{
  flexDirection: 'row',        // ❌ Hardcoded
  marginLeft: 12,              // ❌ Not RTL-aware
  paddingRight: 16,            // ❌ Not RTL-aware
}}>
  <Text style={{ textAlign: 'left' }}>Hello</Text>  // ❌ Won't flip
</View>
```

---

## 9. Animation Guidelines

### Standard Entrance Animation

All cards/sections use staggered `FadeInDown`:
```typescript
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';

<AnimatedView
  entering={FadeInDown
    .delay(50)                          // Stagger: 0, 50, 100, 150...
    .duration(300)
    .easing(Easing.out(Easing.ease))
  }
>
  {/* Content */}
</AnimatedView>
```

### Press Animations

Use `Pressable` with dynamic opacity:
```typescript
<Pressable
  onPress={handlePress}
  style={({ pressed }) => [
    styles.button,
    pressed && { opacity: 0.7 }
  ]}
>
  {/* Content */}
</Pressable>
```

### Advanced Animations (Connection Button, etc.)

For complex animations (pulse, glow), refer to:
- `components/ui/ActivationButton.tsx` (pulsing glow)
- `app/(tabs)/index.tsx` (connection button states)

**Key Patterns:**
- Use `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`
- Cancel animations when screen loses focus with `useIsFocused()` check
- Use `withRepeat` for infinite loops (pulse effects)

---

## 10. Implementation Constraints

### MUST DO
1. ✅ **Use existing components only** - Check `components/ui` before building anything
2. ✅ **Import colors from ThemeContext** - `const { colors, isDark } = useTheme()`
3. ✅ **Use lucide-react-native for all icons** - Never use other icon libraries
4. ✅ **Apply RTL helpers** - Use `useRTL()` for all directional layouts
5. ✅ **Follow exact screen structure** - See Section 6
6. ✅ **Use i18n for all text** - `const { t } = useTranslation()`
7. ✅ **Apply safe area insets** - Use `useSafeAreaInsets()` for all screens
8. ✅ **Stagger animations** - 50ms increments for sequential elements
9. ✅ **Match existing border radius scale** - See Section 4
10. ✅ **Use translucent card backgrounds** - `rgba(255, 255, 255, 0.05/0.8)` pattern

### MUST NOT DO
1. ❌ **Never hardcode colors** (except pure white/black for CTAs)
2. ❌ **Never use `marginLeft/marginRight`** - Use `marginStart/marginEnd`
3. ❌ **Never create new UI patterns** - Reuse existing card/button/layout styles
4. ❌ **Never use custom fonts** - System default only
5. ❌ **Never introduce new animation libraries** - Use `react-native-reanimated` only
6. ❌ **Never use styled-components or CSS-in-JS** - StyleSheet API only
7. ❌ **Never skip safe area handling** - All screens must account for notches/home indicators
8. ❌ **Never hardcode strings** - All text must be i18n keys
9. ❌ **Never use `View` for animated components** - Use `Animated.createAnimatedComponent(View)`
10. ❌ **Never use hex colors directly** - Use theme tokens

---

## 11. Do / Don't

### ✅ DO

- **Reuse existing components** from `components/ui`
- **Match exact spacing** from existing screens (20px horizontal padding, 16px card padding)
- **Use translucent card surfaces** with theme-aware alpha values
- **Apply RTL helpers** to all layouts
- **Use `lucide-react-native` icons** with consistent sizing (16-24px typical)
- **Stagger animations** by 50ms increments
- **Handle disabled states** with `opacity: 0.5-0.7`
- **Use `colors.textMuted` for placeholders** and disabled text
- **Include `hitSlop` on small touchable elements** (minimum 12px)
- **Test both light and dark modes** before finalizing

### ❌ DON'T

- **Don't invent new card styles** - Use existing translucent pattern
- **Don't create custom gradients** - Use standard light/dark background gradients
- **Don't add drop shadows** - Use subtle borders only (cards already have borderWidth: 1)
- **Don't use absolute positioning** unless absolutely necessary (modals, overlays)
- **Don't hardcode text** - Always use `t('key')` from i18n
- **Don't mix icon libraries** - Only `lucide-react-native`
- **Don't create new color values** - Use theme tokens
- **Don't use `px` suffix** - React Native uses unitless numbers
- **Don't forget bottom padding** - Always `insets.bottom + 100` for tab screens
- **Don't skip accessibility** - Include `accessible`, `accessibilityLabel` where needed

---

## 12. Pre-Implementation Checklist

Before writing code for a new screen, verify:

### Design Compliance
- [ ] Screen follows exact structure from Section 6
- [ ] All colors sourced from `useTheme()` hook
- [ ] All spacing matches scale in Section 4
- [ ] All border radius values match scale in Section 4
- [ ] Typography hierarchy matches Section 3

### Components
- [ ] Reviewed `components/ui` for reusable components
- [ ] Not creating duplicate UI elements
- [ ] Using `Button`, `ActivationButton`, `QuickStatsRow` where applicable
- [ ] Using `ScrollShadow` wrapper for scroll views

### Internationalization
- [ ] All text uses `t('key')` from `useTranslation()`
- [ ] Applied `useRTL()` helpers to all layouts
- [ ] Used `marginStart/marginEnd` instead of left/right
- [ ] Text alignment uses `textAlign()` helper

### Animations
- [ ] Using `FadeInDown` with staggered delays (0, 50, 100, 150ms)
- [ ] Animated components use `Animated.createAnimatedComponent()`
- [ ] Press states use `({ pressed })` pattern with opacity

### Safe Area & Layout
- [ ] Imported and used `useSafeAreaInsets()`
- [ ] `paddingTop: insets.top + 12`
- [ ] `paddingBottom: insets.bottom + 100`
- [ ] `paddingHorizontal: 20`

### Theme Support
- [ ] Light mode tested and looks correct
- [ ] Dark mode tested and looks correct
- [ ] Card surfaces use translucent rgba values
- [ ] No hardcoded colors (except white/black on CTAs)

### Quality
- [ ] Icons are from `lucide-react-native` only
- [ ] No console warnings or errors
- [ ] Follows exact existing screen patterns
- [ ] No scope creep - only what was requested

---

## Appendix: Quick Reference

### Common Imports
```typescript
import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Icon1, Icon2 } from 'lucide-react-native';

import { useTheme } from '@/context/ThemeContext';
import { useRTL } from '@/i18n/useRTL';
import { Button, ScrollShadow, QuickStatsRow } from '@/components/ui';

const AnimatedView = Animated.createAnimatedComponent(View);
```

### Common Styles Snippet
```typescript
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, marginTop: 4 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
});
```

---

**End of Design System Specification**

For questions or clarifications, refer to existing screen implementations:
- `app/(tabs)/index.tsx` (Home/VPN screen)
- `app/(tabs)/filter.tsx` (Content Filter screen)
- `app/(tabs)/profile/contact-support.tsx` (Sub-screen with back button)
- `app/(tabs)/profile/index.tsx` (Profile screen)
