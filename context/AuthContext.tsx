import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Account, DeviceSession, DeviceType } from '@/types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const ACCOUNT_STORAGE_KEY = '@vpn_account_id';
const DEVICE_ID_STORAGE_KEY = '@vpn_device_id';

interface AuthContextType {
  account: Account | null;
  deviceSession: DeviceSession | null;
  devices: DeviceSession[];
  loading: boolean;
  isAuthenticated: boolean;
  // Account operations
  createAccount: () => Promise<{ success: boolean; accountId?: string; error?: string }>;
  loginWithAccountId: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  // Device operations
  refreshDevices: () => Promise<void>;
  removeDevice: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
  // Computed
  deviceCount: number;
  maxDevices: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Generate a unique device ID
async function generateDeviceId(): Promise<string> {
  // Try to get existing device ID
  const existingId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existingId) return existingId;

  // Generate new device ID
  let deviceId: string;

  try {
    if (Platform.OS === 'ios' && Application) { 
      // Use iOS vendor ID if available
      const iosId = await Application.getIosIdForVendorAsync();
      deviceId = iosId || `ios-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    } else if (Platform.OS === 'android' && Application) {
      // Use Android ID
      const androidId = Application.getAndroidId?.();
      deviceId = androidId || `android-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    } else {
      // Web or other platforms or modules not available
      deviceId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }
  } catch (error) {
    console.warn('Error getting device ID:', error);
    deviceId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

// Get device name
function getDeviceName(): string {
  try {
    if (Device?.deviceName) {
      return Device.deviceName;
    }
    const brand = Device?.brand || '';
    const model = Device?.modelName || '';
    if (brand || model) {
      return `${brand} ${model}`.trim() || 'iOS Device';
    }
  } catch (error) {
    console.warn('Error getting device name:', error);
  }
  return Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android Device' : 'Device';
}

// Get device type
function getDeviceType(): DeviceType {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [deviceSession, setDeviceSession] = useState<DeviceSession | null>(null);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize - check for existing account
  useEffect(() => {
    initializeAuth();
  }, []);

  async function initializeAuth() {
    try {
      const storedAccountId = await AsyncStorage.getItem(ACCOUNT_STORAGE_KEY);

      if (storedAccountId && isSupabaseConfigured) {
        // Try to login with stored account
        const result = await loginWithAccountId(storedAccountId);
        if (!result.success) {
          // Clear invalid account
          await AsyncStorage.removeItem(ACCOUNT_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      setLoading(false);
    }
  }

  // Create a new account
  const createAccount = useCallback(async (): Promise<{ success: boolean; accountId?: string; error?: string }> => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Server not configured' };
    }

    try {
      // Call Supabase function to create account
      const { data, error } = await supabase.rpc('create_account');

      if (error) {
        console.error('Error creating account:', error);
        return { success: false, error: error.message };
      }

      const newAccount = data as Account;

      // Get device info
      const deviceId = await generateDeviceId();
      const deviceName = getDeviceName();
      const deviceType = getDeviceType();

      // Register this device
      const { data: registerData, error: registerError } = await supabase.rpc('register_device', {
        p_account_id: newAccount.account_id,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_device_type: deviceType,
      });

      if (registerError) {
        console.error('Error registering device:', registerError);
        return { success: false, error: registerError.message };
      }

      const result = registerData as { success: boolean; session?: DeviceSession; account?: Account; error?: string };

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Store account ID locally
      await AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, newAccount.account_id);

      // Update state
      setAccount(result.account || newAccount);
      setDeviceSession(result.session || null);

      // Fetch all devices
      await refreshDevices();

      return { success: true, accountId: newAccount.account_id };
    } catch (error) {
      console.error('Error creating account:', error);
      return { success: false, error: 'Failed to create account' };
    }
  }, []);

  // Login with existing account ID
  const loginWithAccountId = useCallback(async (accountId: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Server not configured' };
    }

    try {
      // Normalize account ID (uppercase, trim)
      const normalizedId = accountId.toUpperCase().trim();

      // Get device info
      const deviceId = await generateDeviceId();
      const deviceName = getDeviceName();
      const deviceType = getDeviceType();

      // Register/update device
      const { data, error } = await supabase.rpc('register_device', {
        p_account_id: normalizedId,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_device_type: deviceType,
      });

      if (error) {
        console.error('Error logging in:', error);
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; session?: DeviceSession; account?: Account; error?: string; current_devices?: number; max_devices?: number };

      if (!result.success) {
        if (result.error === 'Maximum device limit reached') {
          return {
            success: false,
            error: `Device limit reached (${result.current_devices}/${result.max_devices}). Remove a device to continue.`
          };
        }
        return { success: false, error: result.error || 'Account not found' };
      }

      // Store account ID locally
      await AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, normalizedId);

      // Update state
      setAccount(result.account || null);
      setDeviceSession(result.session || null);

      // Fetch all devices
      await refreshDevicesInternal(normalizedId);

      return { success: true };
    } catch (error) {
      console.error('Error logging in:', error);
      return { success: false, error: 'Failed to login' };
    }
  }, []);

  // Internal refresh devices (doesn't depend on account state)
  async function refreshDevicesInternal(accountId: string) {
    if (!isSupabaseConfigured) return;

    try {
      const { data, error } = await supabase.rpc('get_account_devices', {
        p_account_id: accountId,
      });

      if (error) {
        console.error('Error fetching devices:', error);
        return;
      }

      const result = data as { success: boolean; devices?: DeviceSession[]; account?: Account };

      if (result.success && result.devices) {
        setDevices(result.devices);
        if (result.account) {
          setAccount(result.account);
        }
      }
    } catch (error) {
      console.error('Error refreshing devices:', error);
    }
  }

  // Refresh devices list
  const refreshDevices = useCallback(async () => {
    if (!account) return;
    await refreshDevicesInternal(account.account_id);
  }, [account]);

  // Remove a device
  const removeDevice = useCallback(async (deviceId: string): Promise<{ success: boolean; error?: string }> => {
    if (!account || !isSupabaseConfigured) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const { data, error } = await supabase.rpc('remove_device', {
        p_account_id: account.account_id,
        p_device_id: deviceId,
      });

      if (error) {
        console.error('Error removing device:', error);
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };

      if (result.success) {
        // Refresh devices list
        await refreshDevices();

        // If we removed ourselves, logout
        if (deviceSession && deviceSession.device_id === deviceId) {
          await logout();
        }
      }

      return result;
    } catch (error) {
      console.error('Error removing device:', error);
      return { success: false, error: 'Failed to remove device' };
    }
  }, [account, deviceSession]);

  // Logout
  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(ACCOUNT_STORAGE_KEY);
    setAccount(null);
    setDeviceSession(null);
    setDevices([]);
  }, []);

  // Delete account permanently
  const deleteAccount = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!account || !isSupabaseConfigured) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const { data, error } = await supabase.rpc('delete_account', {
        p_account_id: account.account_id,
      });

      if (error) {
        console.error('Error deleting account:', error);
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };

      if (result.success) {
        // Clear local storage
        await AsyncStorage.removeItem(ACCOUNT_STORAGE_KEY);
        await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY);

        // Clear state
        setAccount(null);
        setDeviceSession(null);
        setDevices([]);
      }

      return result;
    } catch (error) {
      console.error('Error deleting account:', error);
      return { success: false, error: 'Failed to delete account' };
    }
  }, [account]);

  const value: AuthContextType = {
    account,
    deviceSession,
    devices,
    loading,
    isAuthenticated: !!account,
    createAccount,
    loginWithAccountId,
    logout,
    deleteAccount,
    refreshDevices,
    removeDevice,
    deviceCount: devices.length,
    maxDevices: account?.max_devices ?? 10,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
