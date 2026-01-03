/**
 * Expo config plugin for Android VPN support.
 *
 * This plugin modifies the Android project during `expo prebuild` to add:
 * - VPN-related permissions
 * - Foreground service configuration for Android 14+
 *
 * Note: The actual VPN service is provided by react-native-wireguard-vpn-connect
 * which uses the official WireGuard tunnel library (com.wireguard.android.backend.GoBackend)
 */

const { withAndroidManifest, withGradleProperties } = require('@expo/config-plugins');

/**
 * Add VPN-related permissions to AndroidManifest.xml
 */
function withVpnManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Ensure permissions array exists
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    // Add VPN-related permissions
    const permissionsToAdd = [
      'android.permission.INTERNET',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.CHANGE_NETWORK_STATE',
      'android.permission.WAKE_LOCK',
    ];

    for (const permission of permissionsToAdd) {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === permission
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    }

    // Find the application element
    const application = manifest.application?.[0];
    if (!application) {
      console.warn('withAndroidVPN: No application element found in manifest');
      return config;
    }

    // Ensure service array exists
    if (!application.service) {
      application.service = [];
    }

    // The WireGuard GoBackend$VpnService is declared in the react-native-wireguard-vpn-connect library
    // but we need to ensure it has proper foregroundServiceType for Android 14+
    // We'll add a tools:replace attribute via manifest merger

    // Check if GoBackend VPN service needs foreground service type override
    const goBackendServiceIndex = application.service.findIndex(
      (s) => s.$?.['android:name'] === 'com.wireguard.android.backend.GoBackend$VpnService'
    );

    if (goBackendServiceIndex === -1) {
      // Add the GoBackend VPN service with proper Android 14+ configuration
      application.service.push({
        $: {
          'android:name': 'com.wireguard.android.backend.GoBackend$VpnService',
          'android:permission': 'android.permission.BIND_VPN_SERVICE',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
          'tools:replace': 'android:exported,android:foregroundServiceType',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.net.VpnService' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.net.VpnService.SUPPORTS_ALWAYS_ON',
              'android:value': 'true',
            },
          },
        ],
        'property': [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'vpn',
            },
          },
        ],
      });
      console.log('withAndroidVPN: Added GoBackend VpnService with Android 14+ config');
    }

    // Add tools namespace to manifest for merge rules
    if (!manifest.$) {
      manifest.$ = {};
    }
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    return config;
  });
}

/**
 * Add Gradle configuration for WireGuard
 */
function withGradleConfig(config) {
  return withGradleProperties(config, async (config) => {
    // Add properties for Android configuration
    const properties = [
      { type: 'property', key: 'android.useAndroidX', value: 'true' },
      { type: 'property', key: 'android.enableJetifier', value: 'true' },
    ];

    for (const prop of properties) {
      const exists = config.modResults.some(
        (p) => p.type === 'property' && p.key === prop.key
      );
      if (!exists) {
        config.modResults.push(prop);
      }
    }

    return config;
  });
}

/**
 * Main plugin function
 */
function withAndroidVPN(config) {
  config = withVpnManifest(config);
  config = withGradleConfig(config);
  return config;
}

module.exports = withAndroidVPN;
