# Design Specification: Blue-Dominant Unified UI System

## Document Version: 1.0
## Target: VPN Screen, Ad Block Screen, Shared Components

---

## 1. DESIGN LANGUAGE SUMMARY (Inferred from Profile Tab)

### Current Profile Tab Design Patterns

| Element | Pattern |
|---------|---------|
| **Typography** | Header: 28px/700 weight, Subtitle: 16px/400, Section Title: 16px/600, Body: 15-16px/500 |
| **Card Styling** | borderRadius: 20px, borderWidth: 1px, padding: 16-20px |
| **Icon Containers** | 40-48px square, borderRadius: 12-14px, 20% opacity background tint |
| **Spacing** | Consistent 12-16px gaps, 16-24px section margins |
| **Interaction** | Pressable with opacity: 0.7 on press, chevron indicators for navigation |
| **Hierarchy** | Primary action cards at top, grouped settings below, actions at bottom |
| **Dividers** | 1px height, left margin aligned with content (52-56px from edge) |
| **Badges** | Small rounded pills (borderRadius: 6-12px), subtle background tints |

---

## 2. BLUE-CENTERED COLOR SYSTEM

### Primary Palette

```typescript
const blueColorSystem = {
  // Primary Blue (Brand)
  primary: '#3B82F6',           // Main brand blue
  primaryDark: '#2563EB',       // Pressed/active state
  primaryLight: '#60A5FA',      // Highlights, light mode accents
  primaryMuted: '#93C5FD',      // Subtle text on dark backgrounds

  // Secondary Blue (Complementary)
  secondary: '#1D4ED8',         // Deep blue for emphasis
  secondaryLight: '#3B82F680',  // 50% opacity for backgrounds

  // State Colors (Blue-Shifted)
  active: '#3B82F6',            // Active/enabled state
  activeGlow: '#3B82F640',      // Glow effect (25% opacity)
  disabled: '#6B7280',          // Gray for disabled
  disabledLight: '#9CA3AF',     // Light gray

  // Background Accents
  surfaceBlue: {
    dark: 'rgba(59, 130, 246, 0.1)',    // Dark mode card tint
    light: 'rgba(59, 130, 246, 0.08)',  // Light mode card tint
  },
  borderBlue: {
    dark: 'rgba(59, 130, 246, 0.2)',
    light: 'rgba(59, 130, 246, 0.15)',
  },

  // Semantic Colors (Keep Existing)
  success: '#22C55E',           // Connected, enabled
  warning: '#F59E0B',           // Connecting, caution
  error: '#EF4444',             // Disconnected, danger
};
```

### ThemeContext Updates Required

Update `/context/ThemeContext.tsx`:

```typescript
// Change primary from '#4F9CD6' to '#3B82F6'
primary: '#3B82F6',
primaryLight: '#60A5FA',
info: '#3B82F6',  // Align info with primary
```

---

## 3. AD BLOCK SCREEN REDESIGN

### 3.1 Hero Activation Button (New Interactive Component)

**Current State:** Static shield icon with basic toggle below
**New State:** Interactive circular button matching VPN ConnectionButton pattern

#### Component Specification: AdBlockActivationButton

```typescript
interface AdBlockActivationButtonProps {
  isEnabled: boolean;
  onToggle: () => void;
}
```

**Visual Design:**
- **Size:** 160x160px (matches VPN button)
- **Shape:** Circular with gradient fill
- **Enabled State:**
  - Gradient: `['#3B82F6', '#2563EB']` (primary blue)
  - Icon: ShieldCheck, 56px, white
  - Pulsing glow animation (identical to VPN)
- **Disabled State:**
  - Gradient: `['#3A3A3E', '#2A2A2E']` (dark) / `['#F5F5F7', '#E8E8ED']` (light)
  - Icon: ShieldOff, 56px, muted color
  - No glow

**Animations (Match VPN Pattern):**
```typescript
// Enabled pulse animation
pulseScale.value = withRepeat(
  withSequence(
    withTiming(1.12, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
    withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
  ),
  -1, true
);

// Glow opacity animation
glowOpacity.value = withRepeat(
  withSequence(
    withTiming(0.5, { duration: 2000 }),
    withTiming(0.25, { duration: 2000 })
  ),
  -1, true
);

// Press feedback
scale.value = withSequence(
  withSpring(0.94, { damping: 12, stiffness: 400 }),
  withSpring(1, { damping: 12, stiffness: 400 })
);
```

**Glow Ring:**
- Position: Behind button
- Size: 160x160px
- Color: `#3B82F6` (primary blue)
- Animated opacity: 0.25 → 0.5

### 3.2 Updated Hero Card Layout

```
┌─────────────────────────────────────────┐
│              [Glow Ring]                │
│         ┌──────────────────┐            │
│         │   Activation     │            │
│         │     Button       │   ← Tap to toggle
│         │   (160x160)      │            │
│         └──────────────────┘            │
│                                         │
│         "Protection Active"             │
│         "1 protection layer active"     │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [Blocked]    [Block Rate]    [Rules]   │
│   12.4K          8.2%          47K      │
└─────────────────────────────────────────┘
```

### 3.3 Color Changes for Ad Block Screen

| Element | Current Color | New Color |
|---------|--------------|-----------|
| Hero icon gradient (enabled) | `colors.success` | `#3B82F6` (primary blue) |
| Glow effect | `colors.success + '40'` | `#3B82F6 + '40'` |
| Quick stat "Block Rate" icon | `colors.primary` | `#3B82F6` |
| Main toggle active track | `colors.success` | `#3B82F6` |
| PRO badge | Keep gold `#FFD700` | Keep gold `#FFD700` |
| Coverage icons | Various | Shift to blue tones |

### 3.4 Remove Redundant Toggle Card

The large "Ad Blocking" toggle card below the hero becomes redundant since the hero button is now tappable. **Remove the `mainToggleCard` component entirely.**

### 3.5 Updated Stats Grid

Move stats from hero card into dedicated grid below (matching VPN stats pattern):

```
┌─────────────┐  ┌─────────────┐
│   [Ban]     │  │ [Activity]  │
│   12.4K     │  │   156.2K    │
│ Ads Blocked │  │ DNS Queries │
└─────────────┘  └─────────────┘
```

Use blue accent colors:
- Ads Blocked: `#EF4444` (keep red for "blocked")
- DNS Queries: `#3B82F6` (primary blue)

---

## 4. VPN SCREEN REDESIGN

### 4.1 Remove "Status: Secure" from Stats Row

**Current stats row when connected:**
```
Server | Latency | Status: Secure
```

**New stats row:**
```
Server | Latency | Protocol
```

Or reduce to two items:
```
Server | Latency
```

**Implementation:** In `index.tsx`, remove the third stat item:
```typescript
// REMOVE this block:
<View style={styles.statItem}>
  <Wifi size={16} color={colors.success} />
  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Status</Text>
  <Text style={[styles.statValue, { color: colors.success }]}>Secure</Text>
</View>
```

### 4.2 Add Parental Control Toggle to Quick Settings

**Current Quick Settings:**
```
Quick Settings
├── Ad Blocker [toggle]
```

**New Quick Settings:**
```
Quick Settings
├── Parental Controls [toggle]  ← NEW PRIMARY
├── ─────────────────────────
├── Ad Blocker [toggle]
```

#### Parental Control Toggle Specification

| Property | Value |
|----------|-------|
| Icon | `Shield` or `Users` (from lucide) |
| Icon Color | `#3B82F6` (primary blue) |
| Icon Container BG | `rgba(59, 130, 246, 0.15)` dark / `rgba(59, 130, 246, 0.1)` light |
| Label | "Parental Controls" |
| Description (OFF) | "Protect children from harmful content" |
| Description (ON) | "Content filtering active" |
| Toggle Track (ON) | `#3B82F6` (primary blue) |

**Implementation:**

```tsx
{/* Parental Controls - Primary Position */}
<View style={styles.settingRow}>
  <View style={styles.settingLeft}>
    <View style={[styles.settingIcon, {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)'
    }]}>
      <Users size={20} color="#3B82F6" />
    </View>
    <View style={styles.settingText}>
      <Text style={[styles.settingLabel, { color: colors.text }]}>
        Parental Controls
      </Text>
      <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
        {parentalEnabled ? 'Content filtering active' : 'Protect children from harmful content'}
      </Text>
    </View>
  </View>
  <Switch
    value={parentalEnabled}
    onValueChange={toggleParentalControls}
    trackColor={{ false: colors.border, true: '#3B82F6' }}
    thumbColor={parentalEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
    ios_backgroundColor={colors.border}
  />
</View>

{/* Divider */}
<View style={[styles.settingDivider, { backgroundColor: colors.border }]} />

{/* Ad Blocker - Secondary Position */}
<View style={styles.settingRow}>
  {/* ... existing Ad Blocker toggle ... */}
</View>
```

### 4.3 Update Connection Button Colors

Shift connecting state to use blue instead of warning orange:

| State | Current | New |
|-------|---------|-----|
| Disconnected | Gray gradient | Gray gradient (keep) |
| Connecting | Orange/warning | Blue pulse `#3B82F6` |
| Connected | Green/success | Green (keep for clarity) |

**Updated ConnectionButton gradient:**
```typescript
colors={isConnected
  ? [colors.success, '#1B9B5E']      // Keep green for connected
  : isConnecting
    ? ['#3B82F6', '#2563EB']         // Change to blue
    : isDark
      ? ['#3A3A3E', '#2A2A2E']
      : ['#F5F5F7', '#E8E8ED']
}
```

---

## 5. SHARED COMPONENT UPDATES

### 5.1 Card Component Standardization

All cards across VPN, Ad Block, and Profile should use:

```typescript
const cardStyle = {
  borderRadius: 20,
  borderWidth: 1,
  padding: 16, // or 20 for hero cards
  backgroundColor: isDark
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(255, 255, 255, 0.8)',
  borderColor: isDark
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(0, 0, 0, 0.05)',
};
```

### 5.2 Icon Container Standardization

```typescript
const iconContainerStyle = {
  width: 40,  // or 48 for large, 56 for hero
  height: 40,
  borderRadius: 12, // or 14 for large, 16 for hero
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: isDark ? `${iconColor}20` : `${iconColor}15`,
};
```

### 5.3 Section Title Standardization

```typescript
const sectionTitleStyle = {
  fontSize: 16, // or 17 for prominent sections
  fontWeight: '600',
  marginBottom: 12, // consistent spacing
};
```

### 5.4 Toggle Row Standardization

Ensure all toggle rows (VPN Quick Settings, Ad Block toggles, Parental categories) use:

```typescript
const toggleRowStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 12,
};
```

---

## 6. ANIMATION PARITY CHECKLIST

| Animation | VPN Screen | Ad Block Screen (New) |
|-----------|------------|----------------------|
| Hero button pulse | Yes (2s cycle) | Yes (match exactly) |
| Glow ring opacity | Yes (0.25-0.5) | Yes (match exactly) |
| Press spring feedback | Yes (0.94 scale) | Yes (match exactly) |
| Card fade-in (FadeInDown) | Yes (delay 0-150ms) | Yes (match delays) |
| Toggle feedback | Native Switch | Native Switch |

---

## 7. IMPLEMENTATION PRIORITY

### Phase 1: Color System (Low Risk)
1. Update `ThemeContext.tsx` primary color to `#3B82F6`
2. Update info color to match primary
3. Test across all screens

### Phase 2: VPN Screen Updates (Medium Risk)
1. Remove "Status: Secure" stat item
2. Add Parental Controls toggle to Quick Settings
3. Import and wire up ParentalControlsContext
4. Update connecting state to blue gradient

### Phase 3: Ad Block Screen Redesign (Higher Risk)
1. Create new `AdBlockActivationButton` component
2. Port animation logic from VPN `ConnectionButton`
3. Replace hero card with new interactive version
4. Remove redundant main toggle card
5. Adjust stats grid layout

### Phase 4: Polish & Consistency
1. Audit all icon container colors
2. Ensure card border radius consistency
3. Verify animation timing matches
4. Test dark/light mode transitions

---

## 8. EXPO & MCP COMPATIBILITY

### Verified Compatible

| Feature | Expo Support |
|---------|--------------|
| LinearGradient | `expo-linear-gradient` |
| Reanimated animations | `react-native-reanimated` |
| Haptic feedback | `expo-haptics` |
| Safe area handling | `react-native-safe-area-context` |
| Native Switch | Built-in React Native |
| Lucide icons | `lucide-react-native` |

### No Native Module Changes Required
- All proposed changes use existing dependencies
- No new native modules needed
- No Expo prebuild required for these changes

---

## 9. VISUAL MOCKUP REFERENCES

### VPN Screen (After Changes)

```
┌──────────────────────────────────────┐
│  Good morning                   FREE │
│  Connect to protect your privacy     │
├──────────────────────────────────────┤
│                                      │
│           ╭──────────────╮           │
│           │              │           │
│           │   [Shield]   │  ← Blue when connecting
│           │              │           │
│           ╰──────────────╯           │
│                                      │
│           Not Connected              │
│           Tap to connect             │
│                                      │
│  ─────────────────────────────────   │
│  Server: NYC  │  Latency: 24ms       │  ← Only 2 stats
├──────────────────────────────────────┤
│  🌍 Select Server         NYC  >     │
├──────────────────────────────────────┤
│  Quick Settings                      │
│  ┌────────────────────────────────┐  │
│  │ 👨‍👩‍👧 Parental Controls    [●] │  │  ← NEW
│  │     Content filtering active    │  │
│  ├────────────────────────────────┤  │
│  │ 👁 Ad Blocker              [○] │  │
│  │     Block ads & trackers        │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Ad Block Screen (After Changes)

```
┌──────────────────────────────────────┐
│  Ad Blocker                     PRO  │
│  DNS-level protection                │
├──────────────────────────────────────┤
│                                      │
│           ╭──────────────╮           │
│        ┌──│   [Shield]   │──┐        │
│        │  │    Blue      │  │ ← Glow │
│        └──│   Tap Me!    │──┘        │
│           ╰──────────────╯           │
│                                      │
│         Protection Active            │
│      1 protection layer active       │
│                                      │
│  ─────────────────────────────────   │
│  Blocked: 12K | Rate: 8% | Rules: 47K│
├──────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐      │
│  │   12.4K    │  │   156.2K   │      │
│  │ Ads Blocked│  │ DNS Queries│      │
│  └────────────┘  └────────────┘      │
├──────────────────────────────────────┤
│  Coverage                            │
│  ├─ 🌐 All Browsers         ✓       │
│  ├─ 📱 All Apps             ✓       │
│  └─ 📶 System-Wide          ✓       │
├──────────────────────────────────────┤
│  ℹ️ VPN connected - Ad blocking...   │
└──────────────────────────────────────┘
```

---

## 10. ACCEPTANCE CRITERIA

- [ ] Primary blue `#3B82F6` is dominant across VPN and Ad Block screens
- [ ] Ad Block hero button is tappable with matching VPN animations
- [ ] VPN Quick Settings includes Parental Controls toggle at top position
- [ ] "Status: Secure" removed from VPN connected stats
- [ ] Card styling matches Profile tab (20px radius, consistent borders)
- [ ] All toggles use blue track color when enabled
- [ ] Dark mode and light mode both tested and consistent
- [ ] No Expo build errors introduced
- [ ] Animation frame rates stay at 60fps on target devices

---

## 11. FILES TO MODIFY

| File | Changes |
|------|---------|
| `context/ThemeContext.tsx` | Update primary to #3B82F6, align info color |
| `app/(tabs)/index.tsx` | Add Parental toggle, remove Status stat, update connecting gradient |
| `app/(tabs)/adblock.tsx` | New activation button, remove main toggle card, adjust colors |
| `context/ParentalControlsContext.tsx` | No changes (already exists) |

---

*Document prepared for implementation handoff. All design decisions are final pending developer feasibility review.*
