import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { VPNServer, ConnectionStatus, ConnectionLog } from '@/types/database';
import { useAuth } from './AuthContext';

// Storage keys for persisting settings
const STORAGE_KEYS = {
  AD_BLOCK_ENABLED: '@vpn_settings/ad_block_enabled',
  AUTO_CONNECT_WIFI: '@vpn_settings/auto_connect_wifi',
  KILL_SWITCH_ENABLED: '@vpn_settings/kill_switch_enabled',
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
  autoConnectWifi: boolean;
  setAutoConnectWifi: (enabled: boolean) => void;
  killSwitchEnabled: boolean;
  setKillSwitchEnabled: (enabled: boolean) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  selectServer: (server: VPNServer) => void;
  toggleFavorite: (serverId: string) => Promise<void>;
  refreshServers: () => Promise<void>;
  installVPNProfile: () => Promise<boolean>;
  checkProfileInstalled: () => Promise<boolean>;
}

const VPNContext = createContext<VPNContextType | undefined>(undefined);

// Get native WireGuard module directly from NativeModules
const WireGuardModule = Platform.OS !== 'web' ? NativeModules.WireGuardVpnModule : null;

export function VPNProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
  const [useSimulation, setUseSimulation] = useState(false);
  const [adBlockEnabled, setAdBlockEnabledState] = useState(false);
  const [autoConnectWifi, setAutoConnectWifiState] = useState(false);
  const [killSwitchEnabled, setKillSwitchEnabledState] = useState(true); // Kill switch enabled by default for security
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // DNS servers - AdGuard DNS when ad blocking is enabled, regular DNS otherwise
  const AD_BLOCK_DNS = ['10.0.0.1']; // VPN server running AdGuard Home
  const REGULAR_DNS = ['1.1.1.1', '1.0.0.1']; // Cloudflare DNS

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [adBlock, autoConnect, killSwitch] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.AD_BLOCK_ENABLED),
          AsyncStorage.getItem(STORAGE_KEYS.AUTO_CONNECT_WIFI),
          AsyncStorage.getItem(STORAGE_KEYS.KILL_SWITCH_ENABLED),
        ]);

        if (adBlock !== null) {
          setAdBlockEnabledState(adBlock === 'true');
        }
        if (autoConnect !== null) {
          setAutoConnectWifiState(autoConnect === 'true');
        }
        if (killSwitch !== null) {
          setKillSwitchEnabledState(killSwitch === 'true');
        }

        console.log('VPN settings loaded:', { adBlock, autoConnect, killSwitch });
      } catch (error) {
        console.error('Error loading VPN settings:', error);
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Wrapper functions to save settings when they change
  const setAdBlockEnabled = useCallback(async (enabled: boolean) => {
    setAdBlockEnabledState(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AD_BLOCK_ENABLED, String(enabled));
      console.log('Ad block setting saved:', enabled);
    } catch (error) {
      console.error('Error saving ad block setting:', error);
    }
  }, []);

  const setAutoConnectWifi = useCallback(async (enabled: boolean) => {
    setAutoConnectWifiState(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTO_CONNECT_WIFI, String(enabled));
      console.log('Auto-connect setting saved:', enabled);

      // Update native module settings if initialized
      if (WireGuardModule?.updateSettings) {
        await WireGuardModule.updateSettings({
          autoConnectWifi: enabled,
          killSwitchEnabled: killSwitchEnabled,
        });
      }
    } catch (error) {
      console.error('Error saving auto-connect setting:', error);
    }
  }, [killSwitchEnabled]);

  const setKillSwitchEnabled = useCallback(async (enabled: boolean) => {
    setKillSwitchEnabledState(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.KILL_SWITCH_ENABLED, String(enabled));
      console.log('Kill switch setting saved:', enabled);

      // Update native module settings if initialized
      if (WireGuardModule?.updateSettings) {
        await WireGuardModule.updateSettings({
          autoConnectWifi: autoConnectWifi,
          killSwitchEnabled: enabled,
        });
      }
    } catch (error) {
      console.error('Error saving kill switch setting:', error);
    }
  }, [autoConnectWifi]);

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
      setUseSimulation(false);
      console.log('WireGuard VPN service initialized successfully');
    } catch (error) {
      console.warn('WireGuard initialization failed:', error);
      // Don't use simulation - let user know the real error
      setUseSimulation(false);
      setIsInitialized(true);
    }
  }, [isInitialized]);

  // Initialize on mount
  useEffect(() => {
    initializeWireGuard();
  }, [initializeWireGuard]);

  // Fetch servers - only WireGuard servers
  const refreshServers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vpn_servers')
        .select('*')
        .eq('is_active', true)
        .order('country', { ascending: true });

      if (!error && data) {
        // Filter to only include WireGuard servers
        const wireGuardServers = data.filter(server =>
          server.protocol === 'wireguard' ||
          server.config_data?.includes('privateKey') ||
          server.config_data?.includes('PrivateKey')
        );

        setServers(wireGuardServers);

        // Auto-select the first WireGuard server if none selected
        if (!selectedServer && wireGuardServers.length > 0) {
          setSelectedServer(wireGuardServers[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedServer]);

  // Fetch favorites
  const fetchFavorites = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('server_id')
        .eq('user_id', user.id);

      if (!error && data) {
        setFavorites(data.map((f) => f.server_id));
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  }, [user]);

  // Fetch connection logs
  const fetchLogs = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('connection_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setConnectionLogs(data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  }, [user]);

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

  useEffect(() => {
    refreshServers();
  }, [refreshServers]);

  useEffect(() => {
    if (user) {
      fetchFavorites();
      fetchLogs();
    }
  }, [user, fetchFavorites, fetchLogs]);

  // Subscribe to realtime logs
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('connection_logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_logs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setConnectionLogs((prev) => [payload.new as ConnectionLog, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Poll VPN status periodically
  useEffect(() => {
    if (Platform.OS === 'web' || !isInitialized) return;

    const checkStatus = async () => {
      if (!WireGuardModule?.getStatus) return;

      try {
        const status: WireGuardStatus = await WireGuardModule.getStatus();

        if (status.isConnected && connectionStatus !== 'connected') {
          setConnectionStatus('connected');
          if (!connectionStartTime) {
            setConnectionStartTime(new Date());
          }
        } else if (!status.isConnected && connectionStatus === 'connected') {
          const duration = connectionStartTime
            ? Math.floor((new Date().getTime() - connectionStartTime.getTime()) / 1000)
            : 0;
          setConnectionStatus('disconnected');
          setConnectionStartTime(null);
          if (selectedServer) {
            addLog('disconnected', 'VPN disconnected.', { duration_seconds: duration });
          }
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
    if (!user || !selectedServer) return;

    try {
      await supabase.from('connection_logs').insert({
        user_id: user.id,
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
  function parseWireGuardConfig(configData: string): WireGuardConfig | null {
    console.log('Parsing config_data:', configData);

    // Determine DNS based on ad block setting
    const dnsServers = adBlockEnabled ? AD_BLOCK_DNS : REGULAR_DNS;
    console.log('Using DNS servers:', dnsServers, 'Ad block:', adBlockEnabled);

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

    setConnectionStatus('connecting');
    await addLog('connecting', `Connecting to ${selectedServer.city}, ${selectedServer.country}...`);

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    setConnectionStatus('connected');
    setConnectionStartTime(new Date());

    const modeLabel = Platform.OS === 'web' ? 'Web' : 'Simulator/Demo';
    await addLog('connected', `Connected to ${selectedServer.city}. (${modeLabel} mode)`);
  }

  // Connect to VPN using WireGuard
  async function connect() {
    if (!selectedServer) return;

    // Use simulation for web only
    if (Platform.OS === 'web') {
      return connectSimulation();
    }

    setConnectionStatus('connecting');
    await addLog('connecting', `Connecting to ${selectedServer.city}, ${selectedServer.country}...`);

    try {
      // Ensure WireGuard is initialized
      await initializeWireGuard();

      if (!WireGuardModule) {
        throw new Error('WireGuard native module not available. Please rebuild the app.');
      }

      // Check if server has WireGuard config
      if (!selectedServer.config_data) {
        throw new Error('No WireGuard configuration available for this server');
      }

      // Parse the config
      const wgConfig = parseWireGuardConfig(selectedServer.config_data);

      if (!wgConfig) {
        throw new Error('Invalid WireGuard configuration');
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
        // Kill switch blocks all traffic if VPN disconnects unexpectedly
        includeAllNetworks: killSwitchEnabled,
        // On-demand rules for auto-connect
        onDemandEnabled: autoConnectWifi,
      });

      setConnectionStatus('connected');
      setConnectionStartTime(new Date());
      await addLog('connected', `Connected to ${selectedServer.city}. Your traffic is now encrypted.`);
    } catch (error) {
      console.error('VPN connection error:', error);
      setConnectionStatus('disconnected');
      await addLog('error', `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Simulation mode disconnect
  async function disconnectSimulation() {
    setConnectionStatus('disconnecting');
    await addLog('disconnecting', 'Disconnecting...');

    // Simulate disconnect delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const duration = connectionStartTime
      ? Math.floor((new Date().getTime() - connectionStartTime.getTime()) / 1000)
      : 0;

    setConnectionStatus('disconnected');
    setConnectionStartTime(null);

    const modeLabel = Platform.OS === 'web' ? 'Web' : 'Simulator/Demo';
    await addLog('disconnected', `Disconnected. (${modeLabel} mode)`, { duration_seconds: duration });
  }

  // Disconnect from VPN
  async function disconnect() {
    if (!selectedServer) return;

    // Use simulation for web only
    if (Platform.OS === 'web') {
      return disconnectSimulation();
    }

    setConnectionStatus('disconnecting');
    await addLog('disconnecting', 'Disconnecting...');

    try {
      if (WireGuardModule?.disconnect) {
        await WireGuardModule.disconnect();
      }

      const duration = connectionStartTime
        ? Math.floor((new Date().getTime() - connectionStartTime.getTime()) / 1000)
        : 0;

      setConnectionStatus('disconnected');
      setConnectionStartTime(null);
      await addLog('disconnected', 'VPN disconnected.', { duration_seconds: duration });
    } catch (error) {
      console.error('VPN disconnect error:', error);
      setConnectionStatus('disconnected');
      setConnectionStartTime(null);
    }
  }

  function selectServer(server: VPNServer) {
    setSelectedServer(server);
  }

  async function toggleFavorite(serverId: string) {
    if (!user) return;

    const isFavorite = favorites.includes(serverId);

    try {
      if (isFavorite) {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('server_id', serverId);
        setFavorites((prev) => prev.filter((id) => id !== serverId));
      } else {
        await supabase.from('user_favorites').insert({ user_id: user.id, server_id: serverId });
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
        autoConnectWifi,
        setAutoConnectWifi,
        killSwitchEnabled,
        setKillSwitchEnabled,
        connect,
        disconnect,
        selectServer,
        toggleFavorite,
        refreshServers,
        installVPNProfile,
        checkProfileInstalled,
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
