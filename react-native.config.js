/**
 * React Native configuration file.
 * Used to control autolinking behavior for native modules.
 */
module.exports = {
  dependencies: {
    // Enable react-native-wireguard-vpn-connect for Android
    // This package provides the WireGuard VPN implementation using the official tunnel library
    'react-native-wireguard-vpn-connect': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-wireguard-vpn-connect/android',
          packageImportPath: 'import com.wireguardvpn.WireGuardVpnPackage;',
          packageInstance: 'new WireGuardVpnPackage()',
        },
        // iOS uses the native NetworkExtension implementation
        ios: null,
      },
    },
  },
};
