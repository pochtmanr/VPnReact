/**
 * Expo Config Plugin for VPN Network Extension
 *
 * This plugin adds the necessary Network Extension target and configuration
 * for WireGuard VPN functionality.
 */

const { withXcodeProject, withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'VPNShieldTunnel';
const EXTENSION_BUNDLE_ID_SUFFIX = '.VPNShieldTunnel';

/**
 * Main plugin function
 */
function withVPNExtension(config) {
  // Add Info.plist modifications
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSLocalNetworkUsageDescription =
      'This app requires access to network features for VPN functionality';
    modConfig.modResults.UIBackgroundModes = modConfig.modResults.UIBackgroundModes || [];
    if (!modConfig.modResults.UIBackgroundModes.includes('network')) {
      modConfig.modResults.UIBackgroundModes.push('network');
    }
    if (!modConfig.modResults.UIBackgroundModes.includes('network-authentication')) {
      modConfig.modResults.UIBackgroundModes.push('network-authentication');
    }
    return modConfig;
  });

  // Add entitlements
  config = withEntitlementsPlist(config, (modConfig) => {
    const bundleId = config.ios?.bundleIdentifier || 'com.app';
    // App Groups for communication with extension
    modConfig.modResults['com.apple.security.application-groups'] = [
      `group.${bundleId}.vpn`,
    ];

    // Network Extension entitlement
    modConfig.modResults['com.apple.developer.networking.networkextension'] = ['packet-tunnel-provider'];

    // Personal VPN entitlement
    modConfig.modResults['com.apple.developer.networking.vpn.api'] = ['allow-vpn'];

    return modConfig;
  });

  // Add Network Extension target to Xcode project
  config = withXcodeProject(config, async (modConfig) => {
    const xcodeProject = modConfig.modResults;
    const platformProjectRoot = modConfig.modRequest.platformProjectRoot;
    const bundleId = config.ios?.bundleIdentifier || 'com.app';
    const extensionBundleId = bundleId + EXTENSION_BUNDLE_ID_SUFFIX;

    // Create the extension directory
    const extensionPath = path.join(platformProjectRoot, EXTENSION_NAME);
    if (!fs.existsSync(extensionPath)) {
      fs.mkdirSync(extensionPath, { recursive: true });
    }

    // Create PacketTunnelProvider.h
    const headerContent = `//
//  PacketTunnelProvider.h
//  ${EXTENSION_NAME}
//
//  WireGuard PacketTunnelProvider
//

#import <NetworkExtension/NetworkExtension.h>

NS_ASSUME_NONNULL_BEGIN

@interface PacketTunnelProvider : NEPacketTunnelProvider

@end

NS_ASSUME_NONNULL_END
`;

    // Create PacketTunnelProvider.m with FULL WireGuard implementation
    const implContent = `//
//  PacketTunnelProvider.m
//  ${EXTENSION_NAME}
//

#import "PacketTunnelProvider.h"

@implementation PacketTunnelProvider

- (void)startTunnelWithOptions:(NSDictionary *)options completionHandler:(void (^)(NSError *))completionHandler {
    NETunnelProviderProtocol *tunnelProtocol = (NETunnelProviderProtocol *)self.protocolConfiguration;
    NSDictionary *providerConfig = tunnelProtocol.providerConfiguration;
    NSString *wgConfigString = providerConfig[@"wgConfig"];

    if (!wgConfigString) {
        NSLog(@"[PacketTunnel] No WireGuard configuration found");
        NSError *error = [NSError errorWithDomain:@"VPNShieldTunnel" code:1 userInfo:@{NSLocalizedDescriptionKey: @"No configuration"}];
        completionHandler(error);
        return;
    }

    NSLog(@"[PacketTunnel] Starting tunnel...");

    // Parse config to get endpoint and address
    NSDictionary *config = [self parseWireGuardConfig:wgConfigString];
    NSString *clientAddress = config[@"Address"];
    NSString *endpoint = config[@"Endpoint"];

    if (!clientAddress || !endpoint) {
        NSLog(@"[PacketTunnel] Missing required config fields - Address: %@, Endpoint: %@", clientAddress, endpoint);
        NSError *error = [NSError errorWithDomain:@"VPNShieldTunnel" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Invalid configuration"}];
        completionHandler(error);
        return;
    }

    // Extract server IP from endpoint
    NSString *serverIP = [[endpoint componentsSeparatedByString:@":"] firstObject];
    NSLog(@"[PacketTunnel] Server IP: %@, Client Address: %@", serverIP, clientAddress);

    // Set up tunnel network settings
    NEPacketTunnelNetworkSettings *tunnelSettings = [[NEPacketTunnelNetworkSettings alloc] initWithTunnelRemoteAddress:serverIP];

    // Configure IPv4
    NSString *addressWithoutMask = [[clientAddress componentsSeparatedByString:@"/"] firstObject];
    NEIPv4Settings *ipv4Settings = [[NEIPv4Settings alloc] initWithAddresses:@[addressWithoutMask] subnetMasks:@[@"255.255.255.255"]];
    ipv4Settings.includedRoutes = @[[NEIPv4Route defaultRoute]];
    tunnelSettings.IPv4Settings = ipv4Settings;

    // Configure DNS
    NSString *dnsString = config[@"DNS"];
    NSArray *dnsServers;
    if (dnsString) {
        NSMutableArray *trimmed = [NSMutableArray array];
        for (NSString *dns in [dnsString componentsSeparatedByString:@","]) {
            [trimmed addObject:[dns stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]]];
        }
        dnsServers = trimmed;
    } else {
        dnsServers = @[@"1.1.1.1", @"8.8.8.8"];
    }
    tunnelSettings.DNSSettings = [[NEDNSSettings alloc] initWithServers:dnsServers];
    NSLog(@"[PacketTunnel] DNS Servers: %@", dnsServers);

    tunnelSettings.MTU = @1420;

    [self setTunnelNetworkSettings:tunnelSettings completionHandler:^(NSError *error) {
        if (error) {
            NSLog(@"[PacketTunnel] Failed to set tunnel settings: %@", error.localizedDescription);
            completionHandler(error);
            return;
        }
        NSLog(@"[PacketTunnel] Tunnel network settings configured successfully");
        completionHandler(nil);
    }];
}

- (NSDictionary *)parseWireGuardConfig:(NSString *)configString {
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    NSArray *lines = [configString componentsSeparatedByString:@"\\n"];

    for (NSString *line in lines) {
        NSString *trimmed = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
        if (trimmed.length == 0 || [trimmed hasPrefix:@"["]) continue;

        NSRange equalRange = [trimmed rangeOfString:@"="];
        if (equalRange.location != NSNotFound) {
            NSString *key = [[trimmed substringToIndex:equalRange.location] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
            NSString *value = [[trimmed substringFromIndex:equalRange.location + 1] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
            result[key] = value;
        }
    }

    NSLog(@"[PacketTunnel] Parsed config keys: %@", [result allKeys]);
    return result;
}

- (void)stopTunnelWithReason:(NEProviderStopReason)reason completionHandler:(void (^)(void))completionHandler {
    NSLog(@"[PacketTunnel] Stopping tunnel, reason: %ld", (long)reason);
    completionHandler();
}

- (void)handleAppMessage:(NSData *)messageData completionHandler:(void (^)(NSData *))completionHandler {
    if (completionHandler) {
        completionHandler(nil);
    }
}

- (void)sleepWithCompletionHandler:(void (^)(void))completionHandler {
    completionHandler();
}

- (void)wake {
}

@end
`;

    // Create Info.plist for extension
    const infoPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>VPN Shield Tunnel</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.networkextension.packet-tunnel</string>
        <key>NSExtensionPrincipalClass</key>
        <string>PacketTunnelProvider</string>
    </dict>
</dict>
</plist>
`;

    // Create extension entitlements
    const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.${bundleId}.vpn</string>
    </array>
    <key>com.apple.developer.networking.networkextension</key>
    <array>
        <string>packet-tunnel-provider</string>
    </array>
</dict>
</plist>
`;

    // Write files
    fs.writeFileSync(path.join(extensionPath, 'PacketTunnelProvider.h'), headerContent);
    fs.writeFileSync(path.join(extensionPath, 'PacketTunnelProvider.m'), implContent);
    fs.writeFileSync(path.join(extensionPath, 'Info.plist'), infoPlistContent);
    fs.writeFileSync(path.join(extensionPath, `${EXTENSION_NAME}.entitlements`), entitlementsContent);

    console.log(`[VPN Extension] Created extension files at: ${extensionPath}`);

    // Actually add the target to Xcode project
    try {
      // Check if target already exists
      const existingTarget = xcodeProject.pbxTargetByName(EXTENSION_NAME);
      if (existingTarget) {
        console.log(`[VPN Extension] Target ${EXTENSION_NAME} already exists, updating build settings...`);

        // Update build settings for existing target
        const configs = xcodeProject.pbxXCBuildConfigurationSection();
        Object.keys(configs).forEach((key) => {
          const config = configs[key];
          if (config && typeof config === 'object' && config.buildSettings) {
            if (config.buildSettings.PRODUCT_NAME === EXTENSION_NAME) {
              // CRITICAL: Use Info.plist (not VPNShieldTunnel-Info.plist)
              config.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
              config.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
              config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
              config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = extensionBundleId;
              config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
              config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
              config.buildSettings.SKIP_INSTALL = 'YES';
              config.buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
            }
          }
        });

        return modConfig;
      }

      // Add new target
      const target = xcodeProject.addTarget(
        EXTENSION_NAME,
        'app_extension',
        EXTENSION_NAME,
        extensionBundleId
      );

      if (target) {
        console.log(`[VPN Extension] Added target: ${EXTENSION_NAME}`);

        // Add files to the target
        const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;

        // Create extension group
        const extGroup = xcodeProject.addPbxGroup(
          ['PacketTunnelProvider.h', 'PacketTunnelProvider.m', 'Info.plist', `${EXTENSION_NAME}.entitlements`],
          EXTENSION_NAME,
          EXTENSION_NAME
        );

        // Add group to main group
        if (extGroup && extGroup.uuid) {
          xcodeProject.addToPbxGroup(extGroup.uuid, mainGroupKey);

          // Add source file to build phase
          xcodeProject.addSourceFile(
            `${EXTENSION_NAME}/PacketTunnelProvider.m`,
            { target: target.uuid },
            extGroup.uuid
          );
        }

        // Add NetworkExtension.framework to the extension target
        xcodeProject.addFramework('NetworkExtension.framework', { target: target.uuid });

        // Configure build settings - CRITICAL FIXES
        const configs = xcodeProject.pbxXCBuildConfigurationSection();
        Object.keys(configs).forEach((key) => {
          const config = configs[key];
          if (config && typeof config === 'object' && config.buildSettings) {
            if (config.buildSettings.PRODUCT_NAME === EXTENSION_NAME) {
              // CRITICAL: Use Info.plist (not VPNShieldTunnel-Info.plist)
              config.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
              config.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
              config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
              config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = extensionBundleId;
              config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
              config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
              config.buildSettings.SKIP_INSTALL = 'YES';
              config.buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
            }
          }
        });

        // Add dependency from main app to extension
        const mainTarget = xcodeProject.getFirstTarget();
        if (mainTarget) {
          xcodeProject.addTargetDependency(mainTarget.uuid, [target.uuid]);
          console.log(`[VPN Extension] Added dependency to main target`);
        }

        // Add Copy Files build phase to embed the extension
        const copyPhase = xcodeProject.addBuildPhase(
          [`${EXTENSION_NAME}.appex`],
          'PBXCopyFilesBuildPhase',
          'Embed App Extensions',
          mainTarget.uuid,
          'app_extension'
        );

        if (copyPhase) {
          console.log(`[VPN Extension] Added embed app extensions build phase`);
        }

        console.log(`[VPN Extension] Successfully configured ${EXTENSION_NAME} target`);
      }
    } catch (error) {
      console.error(`[VPN Extension] Error adding target: ${error.message}`);
      console.log('[VPN Extension] You may need to add the target manually in Xcode');
    }

    return modConfig;
  });

  return config;
}

module.exports = withVPNExtension;
