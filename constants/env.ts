// Central environment variable access — every env var used in the app goes through here.
// If any required variable is missing, the app crashes immediately with a clear message.
// This prevents silent failures in App Store builds where .env is not available.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Supabase
export const SUPABASE_URL = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

// VPN Backend
export const VPN_API_URL = requireEnv('EXPO_PUBLIC_VPN_API_URL');

// RevenueCat
export const REVENUECAT_IOS_KEY = requireEnv('EXPO_PUBLIC_REVENUECAT_IOS_KEY');
export const REVENUECAT_ANDROID_KEY = requireEnv('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');

// AdGuard (runs on VPN internal network — credentials still in env, not source)
export const ADGUARD_URL = requireEnv('EXPO_PUBLIC_ADGUARD_URL');
export const ADGUARD_USERNAME = requireEnv('EXPO_PUBLIC_ADGUARD_USERNAME');
export const ADGUARD_PASSWORD = requireEnv('EXPO_PUBLIC_ADGUARD_PASSWORD');

// Promo API
export const PROMO_API_URL = requireEnv('EXPO_PUBLIC_PROMO_API_URL');

// URLs
export const TERMS_URL = 'https://www.dopplervpn.org/en/terms';
export const PRIVACY_URL = 'https://www.dopplervpn.org/en/privacy';
export const SUPPORT_EMAIL = 'support@dopplervpn.org';
export const SUPPORT_BOT_URL = 'https://t.me/dopplervpn_support_bot';
