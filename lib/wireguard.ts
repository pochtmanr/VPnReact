/**
 * WireGuard VPN Service
 *
 * Handles WireGuard VPN connections using react-native-wireguard-vpn-connect
 */

import { Platform } from 'react-native';

// Types for WireGuard configuration
export interface WireGuardConfig {
  privateKey: string;
  publicKey: string;
  serverAddress: string;
  serverPort: number;
  allowedIPs: string[];
  dns?: string[];
  mtu?: number;
  presharedKey?: string;
  clientAddress?: string; // The IP assigned to this client
}

export interface WireGuardStatus {
  isConnected: boolean;
  tunnelState: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  error?: string;
}

export interface WireGuardServer {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  city?: string;
  publicKey: string;
  endpoint: string; // format: "ip:port"
  allowedIPs: string[];
  dns: string[];
  ping?: number;
  load?: number;
}

// Demo/Test servers - these would need to be replaced with real servers
// For production, you'd fetch these from your backend or a provider API
export const DEMO_SERVERS: WireGuardServer[] = [
  {
    id: 'demo-us-1',
    name: 'US East',
    country: 'United States',
    countryCode: 'US',
    city: 'New York',
    publicKey: 'DEMO_PUBLIC_KEY_REPLACE_ME', // Replace with actual public key
    endpoint: '0.0.0.0:51820', // Replace with actual server IP
    allowedIPs: ['0.0.0.0/0', '::/0'],
    dns: ['1.1.1.1', '1.0.0.1'],
  },
  {
    id: 'demo-de-1',
    name: 'Germany',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Frankfurt',
    publicKey: 'DEMO_PUBLIC_KEY_REPLACE_ME',
    endpoint: '0.0.0.0:51820',
    allowedIPs: ['0.0.0.0/0', '::/0'],
    dns: ['1.1.1.1', '1.0.0.1'],
  },
  {
    id: 'demo-nl-1',
    name: 'Netherlands',
    country: 'Netherlands',
    countryCode: 'NL',
    city: 'Amsterdam',
    publicKey: 'DEMO_PUBLIC_KEY_REPLACE_ME',
    endpoint: '0.0.0.0:51820',
    allowedIPs: ['0.0.0.0/0', '::/0'],
    dns: ['1.1.1.1', '1.0.0.1'],
  },
];

class WireGuardVPNService {
  private isInitialized = false;
  private currentStatus: WireGuardStatus = {
    isConnected: false,
    tunnelState: 'INACTIVE',
  };
  private WireGuardModule: any = null;

  /**
   * Initialize the WireGuard VPN module
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamically import to avoid issues if module isn't properly linked
      const module = await import('react-native-wireguard-vpn-connect');
      this.WireGuardModule = module.default;

      if (this.WireGuardModule?.initialize) {
        await this.WireGuardModule.initialize();
      }

      this.isInitialized = true;
      console.log('WireGuard VPN service initialized');
    } catch (error) {
      console.error('Failed to initialize WireGuard:', error);
      throw new Error('WireGuard initialization failed');
    }
  }

  /**
   * Check if WireGuard is supported on this device
   */
  async isSupported(): Promise<boolean> {
    try {
      await this.initialize();
      if (this.WireGuardModule?.isSupported) {
        return await this.WireGuardModule.isSupported();
      }
      // Assume supported on iOS 12+ and Android 5+
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Connect to a WireGuard server
   */
  async connect(config: WireGuardConfig): Promise<void> {
    await this.initialize();

    if (!this.WireGuardModule) {
      throw new Error('WireGuard module not available');
    }

    // Parse endpoint to get address and port
    const [serverAddress, portStr] = config.serverAddress.includes(':')
      ? config.serverAddress.split(':')
      : [config.serverAddress, String(config.serverPort)];

    const wgConfig = {
      privateKey: config.privateKey,
      publicKey: config.publicKey,
      serverAddress: serverAddress,
      serverPort: parseInt(portStr) || config.serverPort,
      allowedIPs: config.allowedIPs,
      dns: config.dns || ['1.1.1.1', '1.0.0.1'],
      mtu: config.mtu || 1420,
      presharedKey: config.presharedKey,
    };

    try {
      await this.WireGuardModule.connect(wgConfig);
      this.currentStatus = {
        isConnected: true,
        tunnelState: 'ACTIVE',
      };
    } catch (error: any) {
      this.currentStatus = {
        isConnected: false,
        tunnelState: 'ERROR',
        error: error?.message || 'Connection failed',
      };
      throw error;
    }
  }

  /**
   * Connect to a predefined server
   */
  async connectToServer(server: WireGuardServer, privateKey: string): Promise<void> {
    const [address, port] = server.endpoint.split(':');

    const config: WireGuardConfig = {
      privateKey,
      publicKey: server.publicKey,
      serverAddress: address,
      serverPort: parseInt(port) || 51820,
      allowedIPs: server.allowedIPs,
      dns: server.dns,
    };

    await this.connect(config);
  }

  /**
   * Disconnect from the VPN
   */
  async disconnect(): Promise<void> {
    if (!this.WireGuardModule) {
      this.currentStatus = {
        isConnected: false,
        tunnelState: 'INACTIVE',
      };
      return;
    }

    try {
      await this.WireGuardModule.disconnect();
      this.currentStatus = {
        isConnected: false,
        tunnelState: 'INACTIVE',
      };
    } catch (error: any) {
      console.error('Disconnect error:', error);
      this.currentStatus = {
        isConnected: false,
        tunnelState: 'ERROR',
        error: error?.message,
      };
    }
  }

  /**
   * Get current VPN status
   */
  async getStatus(): Promise<WireGuardStatus> {
    if (!this.WireGuardModule?.getStatus) {
      return this.currentStatus;
    }

    try {
      const status = await this.WireGuardModule.getStatus();
      this.currentStatus = status;
      return status;
    } catch {
      return this.currentStatus;
    }
  }

  /**
   * Generate a new WireGuard key pair
   * Note: This is a placeholder - in production you'd use a proper crypto library
   */
  generateKeyPair(): { privateKey: string; publicKey: string } {
    // For demo purposes - in production, use a proper WireGuard key generation
    // You could use libraries like 'tweetnacl' or native crypto
    console.warn('Key generation is a placeholder - implement proper crypto');
    return {
      privateKey: 'GENERATE_PROPER_PRIVATE_KEY',
      publicKey: 'GENERATE_PROPER_PUBLIC_KEY',
    };
  }

  /**
   * Parse a WireGuard config file (.conf format)
   */
  parseConfigFile(configContent: string): Partial<WireGuardConfig> {
    const config: Partial<WireGuardConfig> = {};
    const lines = configContent.split('\n');
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
            config.dns = value.split(',').map(d => d.trim());
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
            config.allowedIPs = value.split(',').map(ip => ip.trim());
            break;
          case 'endpoint':
            const [addr, port] = value.split(':');
            config.serverAddress = addr;
            config.serverPort = parseInt(port) || 51820;
            break;
        }
      }
    }

    return config;
  }

  /**
   * Get list of available servers
   * In production, this would fetch from your backend
   */
  async getServers(): Promise<WireGuardServer[]> {
    // TODO: Implement actual server fetching from your backend
    // For now, return demo servers
    return DEMO_SERVERS;
  }
}

// Export singleton instance
export const wireGuardService = new WireGuardVPNService();
export default wireGuardService;
