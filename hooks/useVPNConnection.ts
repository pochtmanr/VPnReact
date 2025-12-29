/**
 * VPN Connection Hook
 *
 * This hook provides VPN connection functionality using react-native-simple-openvpn.
 *
 * IMPORTANT: react-native-simple-openvpn requires a development build (not Expo Go).
 * To use this in production:
 *
 * 1. Install the package:
 *    npm install react-native-simple-openvpn
 *
 * 2. Create a development build:
 *    npx expo prebuild
 *    npx expo run:ios  (or run:android)
 *
 * 3. For iOS, add to Info.plist:
 *    <key>NSVPNNetworkExtensionUsageDescription</key>
 *    <string>This app uses VPN to protect your privacy.</string>
 *
 * 4. For Android, the package handles permissions automatically.
 *
 * Current implementation is simulated for Expo Go compatibility.
 */

import { useState, useCallback } from 'react';
import { ConnectionStatus, VPNServer } from '@/types/database';

interface VPNConnectionState {
  status: ConnectionStatus;
  error: string | null;
  connectedSince: Date | null;
  bytesIn: number;
  bytesOut: number;
}

interface VPNConnectionHook extends VPNConnectionState {
  connect: (server: VPNServer) => Promise<void>;
  disconnect: () => Promise<void>;
  isSimulated: boolean;
}

// Check if we're in Expo Go (simulated mode)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isExpoGo = !(global as any).nativeModuleProxy;

export function useVPNConnection(): VPNConnectionHook {
  const [state, setState] = useState<VPNConnectionState>({
    status: 'disconnected',
    error: null,
    connectedSince: null,
    bytesIn: 0,
    bytesOut: 0,
  });

  // In a real implementation, you would import and use:
  // import RNSimpleOpenvpn, { VpnEventEmitter } from 'react-native-simple-openvpn';

  const connect = useCallback(async (server: VPNServer) => {
    setState(prev => ({ ...prev, status: 'connecting', error: null }));

    if (isExpoGo) {
      // Simulated connection for Expo Go
      await simulateConnection(server, setState);
      return;
    }

    // Real VPN connection code (uncomment when using dev build):
    /*
    try {
      const ovpnConfig = {
        ovpnString: server.config_data,
        notificationTitle: 'VPN Simnetiq',
        compatMode: Platform.OS === 'ios' ? 'ovpn_connect' : 'default',
        providerBundleIdentifier: 'com.yourapp.vpnextension',
        localizedDescription: 'VPN Simnetiq Connection',
      };

      await RNSimpleOpenvpn.connect(ovpnConfig);

      setState(prev => ({
        ...prev,
        status: 'connected',
        connectedSince: new Date(),
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    }
    */
  }, []);

  const disconnect = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'disconnecting' }));

    if (isExpoGo) {
      // Simulated disconnection for Expo Go
      await simulateDisconnection(setState);
      return;
    }

    // Real VPN disconnection code (uncomment when using dev build):
    /*
    try {
      await RNSimpleOpenvpn.disconnect();
      setState({
        status: 'disconnected',
        error: null,
        connectedSince: null,
        bytesIn: 0,
        bytesOut: 0,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Disconnection failed',
      }));
    }
    */
  }, []);

  // VPN event listeners (for real implementation):
  /*
  useEffect(() => {
    if (isExpoGo) return;

    const stateChangeListener = VpnEventEmitter.addListener('STATE_CHANGED', (event) => {
      switch (event.state) {
        case 'CONNECTED':
          setState(prev => ({ ...prev, status: 'connected', connectedSince: new Date() }));
          break;
        case 'DISCONNECTED':
          setState(prev => ({ ...prev, status: 'disconnected', connectedSince: null }));
          break;
        case 'CONNECTING':
          setState(prev => ({ ...prev, status: 'connecting' }));
          break;
        case 'DISCONNECTING':
          setState(prev => ({ ...prev, status: 'disconnecting' }));
          break;
      }
    });

    const byteCountListener = VpnEventEmitter.addListener('BYTE_COUNT', (event) => {
      setState(prev => ({
        ...prev,
        bytesIn: event.bytesIn,
        bytesOut: event.bytesOut,
      }));
    });

    return () => {
      stateChangeListener.remove();
      byteCountListener.remove();
    };
  }, []);
  */

  return {
    ...state,
    connect,
    disconnect,
    isSimulated: isExpoGo,
  };
}

// Simulation helpers for Expo Go
async function simulateConnection(
  server: VPNServer,
  setState: React.Dispatch<React.SetStateAction<VPNConnectionState>>
): Promise<void> {
  // Simulate connection delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  setState({
    status: 'connected',
    error: null,
    connectedSince: new Date(),
    bytesIn: 0,
    bytesOut: 0,
  });

  // Simulate byte count updates
  const interval = setInterval(() => {
    setState(prev => {
      if (prev.status !== 'connected') {
        clearInterval(interval);
        return prev;
      }
      return {
        ...prev,
        bytesIn: prev.bytesIn + Math.floor(Math.random() * 100000),
        bytesOut: prev.bytesOut + Math.floor(Math.random() * 50000),
      };
    });
  }, 1000);
}

async function simulateDisconnection(
  setState: React.Dispatch<React.SetStateAction<VPNConnectionState>>
): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 1000));

  setState({
    status: 'disconnected',
    error: null,
    connectedSince: null,
    bytesIn: 0,
    bytesOut: 0,
  });
}
