import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { VPNServer, ConnectionStatus, ConnectionLog } from '@/types/database';
import { useAuth } from './AuthContext';

const VPN_API_URL = process.env.EXPO_PUBLIC_VPN_API_URL || 'https://www.dopplervpn.org';

// Storage keys for persisting settings
const STORAGE_KEYS = {
  AD_BLOCK_ENABLED: '@vpn_settings/ad_block_enabled',
  PARENTAL_ENABLED: '@parental/enabled',
};

// WireGuard types
interface WireGuardConfig {
  privateKey: string;
  publicKey: string;
  serverAddress: string;
  serverPort: number;
  allowedIPs: string[];
  dns?: string[];
  mtu?: number;
  presharedKey?: string;
  clientAddress?: string;
}

interface WireGuardStatus {
  isConnected: boolean;
  tunnelState: 'UP' | 'DOWN' | 'CONNECTING' | 'DISCONNECTING' | 'ERROR' | 'UNKNOWN';
  error?: string;
}

interface VPNContextType {
  servers: VPNServer[];
  selectedServer: VPNServer | null;
  connectionStatus: ConnectionStatus;
  connectionLogs: ConnectionLog[];
  favorites: string[];
  loading: boolean;
  isProfileInstalled: boolean;
  isCheckingProfile: boolean;
  adBlockEnabled: boolean;
  setAdBlockEnabled: (enabled: boolean) => void;
  // Live latency measurement (only valid when connected)
  measuredLatency: number | null;
  // Connection error message (when status is 'error')
  connectionError: string | null;
  // Lazy loading flag for servers
  serversLoaded: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  selectServer: (server: VPNServer) => void;
  toggleFavorite: (serverId: string) => Promise<void>;
  refreshServers: () => Promise<void>;
  loadServersIfNeeded: () => Promise<void>;
  installVPNProfile: () => Promise<boolean>;
  checkProfileInstalled: () => Promise<boolean>;
  retryConnection: () => Promise<void>;
}

const VPNContext = createContext<VPNContextType | undefined>(undefined);

// Get native WireGuard module directly from NativeModules
const WireGuardModule = Platform.OS !== 'web' ? NativeModules.WireGuardVpnModule : null;

export function VPNProvider({ children }: { children: React.ReactNode }) {
  const { account, deviceSession } = useAuth();
  const [servers, setServers] = useState<VPNServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<VPNServer | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStartTime, setConnectionStartTime] = useState<Date | null>(null);
  const [isProfileInstalled, setIsProfileInstalled] = useState(true);
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [adBlockEnabled, setAdBlockEnabledState] = useState(false);
  const [measuredLatency, setMeasuredLatency] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [serversLoaded, setServersLoaded] = useState(false);
  const latencyIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectCountRef = React.useRef<number>(0);

  // DNS servers - AdGuard DNS when ad blocking is enabled, regular DNS otherwise
  const AD_BLOCK_DNS = ['10.0.0.1']; // VPN server running AdGuard Home
  const REGULAR_DNS = ['1.1.1.1', '1.0.0.1']; // Cloudflare DNS

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const adBlock = await AsyncStorage.getItem(STORAGE_KEYS.AD_BLOCK_ENABLED);

        if (adBlock !== null) {
          setAdBlockEnabledState(adBlock === 'true');
        }

        console.log('VPN settings loaded:', { adBlock });
      } catch (error) {
        console.error('Error loading VPN settings:', error);
      }
    };

    loadSettings();
  }, []);

  // Sync ad block status to database for cross-device visibility
  const syncAdBlockStatus = useCallback(async (adblockEnabled: boolean) => {
    if (!isSupabaseConfigured || !account?.account_id || !deviceSession?.device_id) {
      return;
    }

    try {
      await supabase.rpc('update_device_status', {
        p_account_id: account.account_id,
        p_device_id: deviceSession.device_id,
        p_adblock_enabled: adblockEnabled,
      });
      console.log('[VPNContext] Synced AdBlock status to database:', adblockEnabled);
    } catch (error) {
      // Non-critical - log but don't throw
      console.warn('[VPNContext] Failed to sync adblock status:', error);
    }
  }, [account?.account_id, deviceSession?.device_id]);

  // Wrapper functions to save settings when they change
  const setAdBlockEnabled = useCallback(async (enabled: boolean) => {
    setAdBlockEnabledState(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AD_BLOCK_ENABLED, String(enabled));
      console.log('Ad block setting saved:', enabled);

      // Sync to database for cross-device visibility
      await syncAdBlockStatus(enabled);
    } catch (error) {
      console.error('Error saving ad block setting:', error);
    }
  }, [syncAdBlockStatus]);

  // Measure latency - works both when connected (through VPN) and disconnected (direct ping)
  const measureLatency = useCallback(async (forceServerLatency: boolean = false): Promise<number | null> => {
    if (!selectedServer) {
      return null;
    }

    // When disconnected, return stored server latency (pre-computed on backend)
    // This provides useful info to users before they connect
    if (connectionStatus !== 'connected' || forceServerLatency) {
      return selectedServer.latency_ms || null;
    }

    // When connected, measure actual round-trip through VPN tunnel
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Ping a fast, reliable public endpoint to measure round-trip through VPN
      // Using Cloudflare's DNS endpoint which responds quickly
      try {
        await fetch('https://1.1.1.1/cdn-cgi/trace', {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-store',
        });
      } catch {
        // If Cloudflare fails, try Google
        try {
          await fetch('https://www.google.com/generate_204', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store',
          });
        } catch {
          // Both failed, use server's stored latency as fallback
          clearTimeout(timeoutId);
          return selectedServer.latency_ms || null;
        }
      }

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      // Sanity check - if over 2 seconds, something's wrong
      if (latency > 2000) {
        return selectedServer.latency_ms || null;
      }

      return latency;
    } catch (error) {
      console.log('Latency measurement failed:', error);
      // Fallback to server's stored latency
      return selectedServer.latency_ms || null;
    }
  }, [selectedServer, connectionStatus]);

  // Start periodic latency measurement when connected
  const startLatencyMeasurement = useCallback(() => {
    // Clear any existing interval
    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current);
    }

    // Measure immediately
    measureLatency().then(latency => {
      if (latency !== null) {
        setMeasuredLatency(latency);
      }
    });

    // Then measure every 10 seconds
    latencyIntervalRef.current = setInterval(async () => {
      const latency = await measureLatency();
      if (latency !== null) {
        setMeasuredLatency(latency);
      }
    }, 10000);
  }, [measureLatency]);

  // Stop latency measurement
  const stopLatencyMeasurement = useCallback(() => {
    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current);
      latencyIntervalRef.current = null;
    }
    setMeasuredLatency(null);
  }, []);

  // Clear connection error
  const clearConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

  // Sync VPN connection status to database for cross-device visibility
  const syncDeviceStatus = useCallback(async (vpnConnected: boolean) => {
    if (!isSupabaseConfigured || !account?.account_id || !deviceSession?.device_id) {
      return;
    }

    try {
      await supabase.rpc('update_device_status', {
        p_account_id: account.account_id,
        p_device_id: deviceSession.device_id,
        p_vpn_connected: vpnConnected,
      });
      console.log('[VPNContext] Synced VPN status to database:', vpnConnected);
    } catch (error) {
      // Non-critical - log but don't throw
      console.warn('[VPNContext] Failed to sync device status:', error);
    }
  }, [account?.account_id, deviceSession?.device_id]);

  // Sync VPN status when connection state changes
  useEffect(() => {
    const isConnected = connectionStatus === 'connected';
    const isDisconnected = connectionStatus === 'disconnected';

    // Only sync on definitive states (not connecting/disconnecting/error)
    if (isConnected || isDisconnected) {
      syncDeviceStatus(isConnected);
    }
  }, [connectionStatus, syncDeviceStatus]);

  // Initialize WireGuard module
  const initializeWireGuard = useCallback(async () => {
    if (isInitialized || Platform.OS === 'web') return;

    try {
      if (!WireGuardModule) {
        throw new Error('WireGuardVpnModule not available');
      }

      console.log('Initializing WireGuard native module...');
      await WireGuardModule.initialize();

      setIsInitialized(true);
      console.log('WireGuard VPN service initialized successfully');
    } catch (error) {
      console.warn('WireGuard initialization failed:', error);
      setIsInitialized(true);
    }
  }, [isInitialized]);

  // Initialize on mount
  useEffect(() => {
    initializeWireGuard();
  }, [initializeWireGuard]);

  // Fetch servers directly from Supabase — always fresh, no hardcoded data
  const refreshServers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vpn_servers')
        .select('id, name, country, country_code, city, ip_address, port, load_percentage, is_premium, latency_ms, is_active, speed_mbps')
        .eq('is_active', true)
        .order('country', { ascending: true });

      if (!error && data) {
        setServers(data as VPNServer[]);
        setServersLoaded(true);
        if (!selectedServer && data.length > 0) {
          setSelectedServer(data[0] as VPNServer);
        }
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedServer]);

  // Load servers if not already loaded (prevents duplicate fetches when bottom sheet opens)
  const loadServersIfNeeded = useCallback(async () => {
    // Only fetch if we don't have servers yet
    if (servers.length === 0 && !loading) {
      setLoading(true);
      await refreshServers();
    }
  }, [servers.length, loading, refreshServers]);

  // Fetch favorites
  const fetchFavorites = useCallback(async () => {
    if (!account) return;

    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('server_id')
        .eq('user_id', account.id);

      if (!error && data) {
        setFavorites(data.map((f) => f.server_id));
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  }, [account]);

  // Fetch connection logs
  const fetchLogs = useCallback(async () => {
    if (!account) return;

    try {
      const { data, error } = await supabase
        .from('connection_logs')
        .select('*')
        .eq('user_id', account.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setConnectionLogs(data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  }, [account]);

  // WireGuard doesn't require pre-installed profiles
  const checkProfileInstalled = useCallback(async (): Promise<boolean> => {
    setIsCheckingProfile(false);
    setIsProfileInstalled(true);
    return true;
  }, []);

  const installVPNProfile = useCallback(async (): Promise<boolean> => {
    return true;
  }, []);

  useEffect(() => {
    checkProfileInstalled();
  }, [checkProfileInstalled]);

  // Load servers on mount - needed for VPN connection to work
  useEffect(() => {
    refreshServers();
  }, [refreshServers]);

  useEffect(() => {
    if (account) {
      fetchFavorites();
      fetchLogs();
    }
  }, [account, fetchFavorites, fetchLogs]);

  // Subscribe to realtime logs
  useEffect(() => {
    if (!account) return;

    const channel = supabase
      .channel('connection_logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_logs',
          filter: `user_id=eq.${account.id}`,
        },
        (payload) => {
          setConnectionLogs((prev) => [payload.new as ConnectionLog, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account]);

  // Poll VPN status periodically
  useEffect(() => {
    if (Platform.OS === 'web' || !isInitialized) return;

    const checkStatus = async () => {
      if (!WireGuardModule?.getStatus) return;
      // Don't override state while user is actively disconnecting
      if (isDisconnecting) return;

      try {
        const status: WireGuardStatus = await WireGuardModule.getStatus();

        if (status.isConnected && connectionStatus !== 'connected' && connectionStatus !== 'disconnecting' && connectionStatus !== 'disconnected') {
          disconnectCountRef.current = 0;
          setConnectionStatus('connected');
          if (!connectionStartTime) {
            setConnectionStartTime(new Date());
          }
        } else if (!status.isConnected && connectionStatus === 'connected') {
          // Grace period: require 3 consecutive "not connected" polls before marking disconnected
          // This prevents transient status flickers from killing the tunnel
          disconnectCountRef.current = (disconnectCountRef.current || 0) + 1;
          if (disconnectCountRef.current >= 3) {
            disconnectCountRef.current = 0;
            const duration = connectionStartTime
              ? Math.floor((new Date().getTime() - connectionStartTime.getTime()) / 1000)
              : 0;
            setConnectionStatus('disconnected');
            setConnectionStartTime(null);
            if (selectedServer) {
              addLog('disconnected', 'VPN disconnected.', { duration_seconds: duration });
            }
          }
        } else if (status.isConnected) {
          disconnectCountRef.current = 0;
        }
      } catch (error) {
        // Ignore status check errors
      }
    };

    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [isInitialized, connectionStatus, connectionStartTime, selectedServer]);

  // Add connection log
  async function addLog(
    status: ConnectionLog['status'],
    message: string,
    extraData?: Partial<ConnectionLog>
  ) {
    if (!account || !selectedServer) return;

    try {
      await supabase.from('connection_logs').insert({
        user_id: account.id,
        server_id: selectedServer.id,
        status,
        message,
        bytes_sent: extraData?.bytes_sent || 0,
        bytes_received: extraData?.bytes_received || 0,
        duration_seconds: extraData?.duration_seconds || 0,
      });
    } catch (error) {
      console.error('Error adding log:', error);
    }
  }

  // Parse WireGuard config from server's config_data
  async function parseWireGuardConfig(configData: string): Promise<WireGuardConfig | null> {
    console.log('Parsing config_data:', configData);

    // Check if parental controls are enabled
    const parentalEnabled = await AsyncStorage.getItem(STORAGE_KEYS.PARENTAL_ENABLED);
    const useAdGuardDNS = adBlockEnabled || parentalEnabled === 'true';

    // Determine DNS based on ad block or parental controls setting
    const dnsServers = useAdGuardDNS ? AD_BLOCK_DNS : REGULAR_DNS;
    console.log('Using DNS servers:', dnsServers, 'Ad block:', adBlockEnabled, 'Parental:', parentalEnabled);

    try {
      // Try parsing as JSON first (new format)
      const jsonConfig = JSON.parse(configData);
      console.log('Parsed JSON config:', jsonConfig);

      const result = {
        privateKey: jsonConfig.privateKey || jsonConfig.private_key,
        publicKey: jsonConfig.publicKey || jsonConfig.public_key,
        serverAddress: jsonConfig.serverAddress || jsonConfig.endpoint?.split(':')[0],
        serverPort: jsonConfig.serverPort || parseInt(jsonConfig.endpoint?.split(':')[1]) || 51820,
        allowedIPs: jsonConfig.allowedIPs || jsonConfig.allowed_ips || ['0.0.0.0/0', '::/0'],
        dns: dnsServers, // Use DNS based on ad block setting
        mtu: jsonConfig.mtu || 1420,
        presharedKey: jsonConfig.presharedKey || jsonConfig.preshared_key,
        clientAddress: jsonConfig.clientAddress || jsonConfig.client_address || '10.0.0.2/32',
      };

      console.log('Parsed WireGuard config:', result);

      // Validate required fields
      if (!result.privateKey || !result.publicKey || !result.serverAddress) {
        console.error('Missing required fields:', {
          hasPrivateKey: !!result.privateKey,
          hasPublicKey: !!result.publicKey,
          hasServerAddress: !!result.serverAddress,
        });
        return null;
      }

      return result;
    } catch (parseError) {
      console.log('JSON parse failed, trying WireGuard config format:', parseError);
      // Try parsing as WireGuard config file format
      const config: Partial<WireGuardConfig> = {
        allowedIPs: ['0.0.0.0/0', '::/0'],
        dns: dnsServers, // Use DNS based on ad block setting
      };
      const lines = configData.split('\n');
      let currentSection = '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('[')) {
          currentSection = trimmed.slice(1, -1).toLowerCase();
          continue;
        }

        if (!trimmed || trimmed.startsWith('#')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();

        if (currentSection === 'interface') {
          switch (key.trim().toLowerCase()) {
            case 'privatekey':
              config.privateKey = value;
              break;
            case 'address':
              config.clientAddress = value;
              break;
            case 'dns':
              // Override with our ad block setting
              config.dns = dnsServers;
              break;
            case 'mtu':
              config.mtu = parseInt(value);
              break;
          }
        } else if (currentSection === 'peer') {
          switch (key.trim().toLowerCase()) {
            case 'publickey':
              config.publicKey = value;
              break;
            case 'presharedkey':
              config.presharedKey = value;
              break;
            case 'allowedips':
              config.allowedIPs = value.split(',').map((ip) => ip.trim());
              break;
            case 'endpoint':
              const [addr, port] = value.split(':');
              config.serverAddress = addr;
              config.serverPort = parseInt(port) || 51820;
              break;
          }
        }
      }

      if (config.privateKey && config.publicKey && config.serverAddress) {
        console.log('Parsed WireGuard config from text format:', config);
        return config as WireGuardConfig;
      }

      console.error('Failed to parse WireGuard config - missing required fields');
      return null;
    }
  }

  // Simulation mode connect (for web, simulator, or when VPN APIs unavailable)
  async function connectSimulation() {
    if (!selectedServer) return;

    // Clear any previous error
    setConnectionError(null);
    setConnectionStatus('connecting');
    await addLog('connecting', `Connecting to ${selectedServer.city}, ${selectedServer.country}...`);

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    setConnectionStatus('connected');
    setConnectionStartTime(new Date());

    // Start latency measurement after connection
    startLatencyMeasurement();

    const modeLabel = Platform.OS === 'web' ? 'Web' : 'Simulator/Demo';
    await addLog('connected', `Connected to ${selectedServer.city}. (${modeLabel} mode)`);
  }

  // Try connecting to a specific server via backend API
  async function connectToServer(server: VPNServer): Promise<boolean> {
    try {
      // Ensure WireGuard is initialized
      await initializeWireGuard();

      if (!WireGuardModule) {
        throw new Error('WireGuard native module not available. Please rebuild the app.');
      }

      // Call backend API to get per-user WireGuard config
      const response = await fetch(`${VPN_API_URL}/api/vpn/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: account?.account_id,
          server_id: server.id,
          device_id: deviceSession?.device_id || Platform.OS,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API error ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const configString: string = data.config;
      const publicKey: string | undefined = data.public_key;

      // Parse the WireGuard config string
      const wgConfig = await parseWireGuardConfig(configString);
      if (!wgConfig) {
        throw new Error('Invalid WireGuard configuration from API');
      }

      // Store public_key for disconnect cleanup
      if (publicKey) {
        await AsyncStorage.setItem('@vpn/active_public_key', publicKey);
      }

      // Connect using WireGuard
      await WireGuardModule.connect({
        privateKey: wgConfig.privateKey,
        publicKey: wgConfig.publicKey,
        serverAddress: wgConfig.serverAddress,
        serverPort: wgConfig.serverPort,
        allowedIPs: wgConfig.allowedIPs,
        dns: wgConfig.dns,
        mtu: wgConfig.mtu,
        presharedKey: wgConfig.presharedKey,
        clientAddress: wgConfig.clientAddress,
      });

      return true;
    } catch (error) {
      console.warn(`[VPNContext] Failed to connect to ${server.city}:`, error);
      return false;
    }
  }

  // Connect to VPN using WireGuard with auto-fallback
  async function connect() {
    if (!selectedServer) return;

    // Use simulation for web only
    if (Platform.OS === 'web') {
      return connectSimulation();
    }

    // Clear any previous error
    setConnectionError(null);
    setConnectionStatus('connecting');
    await addLog('connecting', `Connecting to ${selectedServer.city}, ${selectedServer.country}...`);

    try {
      // Try selected server first
      let connected = await connectToServer(selectedServer);

      // Auto-fallback: try other servers if selected fails
      if (!connected) {
        const otherServers = servers.filter(s => s.id !== selectedServer.id);
        for (const fallbackServer of otherServers) {
          setConnectionStatus('connecting');
          await addLog('connecting', `Trying ${fallbackServer.city}, ${fallbackServer.country}...`);
          connected = await connectToServer(fallbackServer);
          if (connected) {
            // Update selected server to the one that worked
            setSelectedServer(fallbackServer);
            break;
          }
        }
      }

      if (!connected) {
        throw new Error('All servers failed. Please try again later.');
      }

      setConnectionStatus('connected');
      setConnectionStartTime(new Date());

      // Start latency measurement after connection
      startLatencyMeasurement();

      await addLog('connected', `Connected to ${selectedServer.city}. Your traffic is now encrypted.`);
    } catch (error) {
      console.error('VPN connection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setConnectionError(errorMessage);
      setConnectionStatus('error');
      await addLog('error', `Connection failed: ${errorMessage}`);
    }
  }

  // Retry connection after error
  async function retryConnection() {
    clearConnectionError();
    await connect();
  }

  // Simulation mode disconnect
  async function disconnectSimulation() {
    // Stop latency measurement
    stopLatencyMeasurement();

    setConnectionStatus('disconnecting');
    await addLog('disconnecting', 'Disconnecting...');

    // Simulate disconnect delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const duration = connectionStartTime
      ? Math.floor((new Date().getTime() - connectionStartTime.getTime()) / 1000)
      : 0;

    setConnectionStatus('disconnected');
    setConnectionStartTime(null);
    setConnectionError(null);

    const modeLabel = Platform.OS === 'web' ? 'Web' : 'Simulator/Demo';
    await addLog('disconnected', `Disconnected. (${modeLabel} mode)`, { duration_seconds: duration });
  }

  // Disconnect from VPN
  async function disconnect() {
    if (!selectedServer) return;

    // Stop latency measurement
    stopLatencyMeasurement();

    // Use simulation for web only
    if (Platform.OS === 'web') {
      return disconnectSimulation();
    }

    setIsDisconnecting(true);
    setConnectionStatus('disconnecting');
    await addLog('disconnecting', 'Disconnecting...');

    try {
      if (WireGuardModule?.disconnect) {
        await WireGuardModule.disconnect();
        // Give the tunnel time to fully stop
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Force state to disconnected BEFORE clearing isDisconnecting
      setConnectionStatus('disconnected');
      setConnectionStartTime(null);
      setConnectionError(null);

      // Fire-and-forget: notify backend to remove WG peer
      AsyncStorage.getItem('@vpn/active_public_key').then(publicKey => {
        if (publicKey && account?.account_id) {
          fetch(`${VPN_API_URL}/api/vpn/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: account.account_id,
              public_key: publicKey,
            }),
          }).catch(err => console.warn('[VPNContext] Backend disconnect notify failed:', err));
          AsyncStorage.removeItem('@vpn/active_public_key');
        }
      });

      const duration = connectionStartTime
        ? Math.floor((new Date().getTime() - connectionStartTime.getTime()) / 1000)
        : 0;

      // State already set above, just clear the flag and log
      setIsDisconnecting(false);
      await addLog('disconnected', 'VPN disconnected.', { duration_seconds: duration });
    } catch (error) {
      console.error('VPN disconnect error:', error);
      setConnectionStatus('disconnected');
      setConnectionStartTime(null);
      setConnectionError(null);
      setIsDisconnecting(false);
    }
  }

  function selectServer(server: VPNServer) {
    setSelectedServer(server);
  }

  async function toggleFavorite(serverId: string) {
    if (!account) return;

    const isFavorite = favorites.includes(serverId);

    try {
      if (isFavorite) {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', account.id)
          .eq('server_id', serverId);
        setFavorites((prev) => prev.filter((id) => id !== serverId));
      } else {
        await supabase.from('user_favorites').insert({ user_id: account.id, server_id: serverId });
        setFavorites((prev) => [...prev, serverId]);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  }

  return (
    <VPNContext.Provider
      value={{
        servers,
        selectedServer,
        connectionStatus,
        connectionLogs,
        favorites,
        loading,
        isProfileInstalled,
        isCheckingProfile,
        adBlockEnabled,
        setAdBlockEnabled,
        measuredLatency,
        connectionError,
        serversLoaded,
        connect,
        disconnect,
        selectServer,
        toggleFavorite,
        refreshServers,
        loadServersIfNeeded,
        installVPNProfile,
        checkProfileInstalled,
        retryConnection,
      }}
    >
      {children}
    </VPNContext.Provider>
  );
}

export function useVPN() {
  const context = useContext(VPNContext);
  if (context === undefined) {
    throw new Error('useVPN must be used within a VPNProvider');
  }
  return context;
}
