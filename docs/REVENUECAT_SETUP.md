# RevenueCat Integration Guide

## Overview

This document outlines the RevenueCat integration for the VPN app, supporting Monthly and Yearly Pro subscriptions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      App Architecture                        │
├─────────────────────────────────────────────────────────────┤
│  RevenueCatProvider (subscription state)                     │
│       ↓                                                      │
│  TierProvider (uses RevenueCat.currentTier as source)        │
│       ↓                                                      │
│  Components use useTier() for isPro/hasFeature checks        │
└─────────────────────────────────────────────────────────────┘
```

## Files Modified/Created

| File | Purpose |
|------|---------|
| `context/RevenueCatContext.tsx` | RevenueCat SDK wrapper, purchase logic |
| `context/TierContext.tsx` | Updated to use RevenueCat as source of truth |
| `components/subscription/Paywall.tsx` | Native paywall UI with plan selection |
| `app/(tabs)/profile/subscription.tsx` | Subscription management screen |
| `components/tier/UpgradePrompt.tsx` | Updated to open RevenueCat paywall |
| `app/_layout.tsx` | Added RevenueCatProvider to context tree |

---

## Remaining Setup Steps

### 1. RevenueCat Dashboard Configuration

1. **Create RevenueCat Account**
   - Go to [RevenueCat Dashboard](https://app.revenuecat.com)
   - Create a new project for your app

2. **Add Platform Apps**
   - **iOS**: Add iOS app with Bundle ID
   - **Android**: Add Android app with Package Name

3. **Get API Keys**
   - Navigate to Project Settings → API Keys
   - Copy the **Public SDK Key** for each platform:
     - iOS: `appl_XXXXXXXXXXXXXXXX`
     - Android: `goog_XXXXXXXXXXXXXXXX`

4. **Update API Keys in Code**

   Edit `context/RevenueCatContext.tsx`:
   ```typescript
   const REVENUECAT_API_KEY_IOS = 'appl_YOUR_ACTUAL_IOS_KEY';
   const REVENUECAT_API_KEY_ANDROID = 'goog_YOUR_ACTUAL_ANDROID_KEY';
   ```

### 2. App Store Connect Setup (iOS)

1. **Create In-App Purchases**
   - Go to App Store Connect → Your App → In-App Purchases
   - Create two subscriptions:

   | Product ID | Type | Duration |
   |------------|------|----------|
   | `vpn_pro_monthly` | Auto-Renewable | 1 Month |
   | `vpn_pro_yearly` | Auto-Renewable | 1 Year |

2. **Create Subscription Group**
   - Name: "VPN Pro"
   - Add both products to this group

3. **Configure Pricing**
   - Set prices for each product
   - Enable all territories

4. **Add App Store Connect Shared Secret**
   - Go to App Store Connect → Your App → General → App Information
   - Scroll to "App-Specific Shared Secret"
   - Generate and copy the secret
   - Add to RevenueCat Dashboard → iOS App Settings

### 3. Google Play Console Setup (Android)

1. **Create Subscriptions**
   - Go to Google Play Console → Your App → Monetization → Subscriptions
   - Create two subscriptions:

   | Product ID | Billing Period |
   |------------|----------------|
   | `vpn_pro_monthly` | Monthly |
   | `vpn_pro_yearly` | Yearly |

2. **Add Service Account Credentials**
   - Create a service account in Google Cloud Console
   - Download the JSON key file
   - Upload to RevenueCat Dashboard → Android App Settings

### 4. RevenueCat Entitlements Configuration

1. **Create Entitlement**
   - Go to RevenueCat Dashboard → Entitlements
   - Create entitlement: `pro`
   - This maps to `isPro = true` in the app

2. **Create Offering**
   - Go to Offerings → Create New
   - Name: "default" (or leave as default)
   - Add packages:
     - `$rc_monthly` → `vpn_pro_monthly`
     - `$rc_annual` → `vpn_pro_yearly`

3. **Attach Products to Entitlement**
   - Link both products to the `pro` entitlement

### 5. Expo/React Native Configuration

1. **Rebuild Native Apps**
   ```bash
   # Clean and rebuild
   npx expo prebuild --clean

   # iOS
   npx expo run:ios

   # Android
   npx expo run:android
   ```

2. **iOS: Update Info.plist (if needed)**
   The SDK handles most configuration, but verify StoreKit is enabled.

3. **Android: Verify Billing Permissions**
   Ensure `com.android.vending.BILLING` permission is in AndroidManifest.xml.

---

## Testing Checklist

### Sandbox Testing (iOS)

1. **Create Sandbox Tester**
   - App Store Connect → Users and Access → Sandbox Testers
   - Create a test account

2. **Test on Device**
   - Sign out of App Store on device
   - Sign in with sandbox account
   - Launch app and attempt purchase

3. **Verify States**
   - [ ] Paywall displays correctly
   - [ ] Monthly package shows correct price
   - [ ] Yearly package shows correct price with savings %
   - [ ] Purchase completes successfully
   - [ ] `isPro` becomes true after purchase
   - [ ] Restore purchases works
   - [ ] Subscription details show expiration date

### Sandbox Testing (Android)

1. **Add License Testers**
   - Google Play Console → Setup → License Testing
   - Add tester email addresses

2. **Test on Device**
   - Install app via internal testing track
   - Complete purchase flow

---

## Production Checklist

Before App Store/Play Store submission:

- [ ] Replace sandbox API keys with production keys (same keys, but verify in RevenueCat)
- [ ] Verify all products are "Ready to Submit" in App Store Connect
- [ ] Verify all subscriptions are "Active" in Play Console
- [ ] Test restore purchases with a real sandbox purchase
- [ ] Verify webhook integration if syncing to Supabase backend
- [ ] Remove any debug logging
- [ ] Test subscription expiration handling

---

## Code Reference

### Check Subscription Status

```typescript
import { useTier } from '@/context/TierContext';

function MyComponent() {
  const { isPro, hasFeature } = useTier();

  if (isPro) {
    // Show pro content
  }

  if (hasFeature('ad_blocking')) {
    // Show ad blocking feature
  }
}
```

### Trigger Paywall Programmatically

```typescript
import { useState } from 'react';
import { Paywall } from '@/components/subscription/Paywall';

function MyComponent() {
  const [showPaywall, setShowPaywall] = useState(false);

  return (
    <>
      <Button onPress={() => setShowPaywall(true)} title="Upgrade" />
      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        featureContext="Premium Servers" // optional
      />
    </>
  );
}
```

### Access RevenueCat Directly

```typescript
import { useRevenueCat } from '@/context/RevenueCatContext';

function SubscriptionInfo() {
  const {
    activeSubscription,
    customerInfo,
    purchasePackage,
    restorePurchases
  } = useRevenueCat();

  // activeSubscription contains:
  // - productIdentifier
  // - expirationDate
  // - willRenew
  // - isInTrial
  // - isInGracePeriod
}
```

---

## Troubleshooting

### "Subscriptions not initialized"
- Verify API keys are correct
- Check network connectivity
- Ensure RevenueCat SDK is properly installed

### Purchases Not Reflecting
- Check RevenueCat Dashboard → Customers for the user
- Verify entitlement is attached to products
- Check offering configuration

### App User ID Not Syncing
- Ensure `account.account_id` is available when RevenueCatProvider mounts
- Check `syncAppUserId` in RevenueCatContext

---

## Webhook Integration (Optional)

To sync subscription status to your Supabase backend:

1. **RevenueCat Dashboard → Integrations → Webhooks**
2. Add endpoint: `https://your-domain.com/webhooks/revenuecat`
3. Select events: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`
4. Implement webhook handler to update `accounts.subscription_tier` in Supabase

---

## Support

- [RevenueCat Documentation](https://www.revenuecat.com/docs)
- [RevenueCat Community](https://community.revenuecat.com)
- [React Native SDK Reference](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
