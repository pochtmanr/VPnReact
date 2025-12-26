/**
 * Expo Config Plugin to add Network Extension target for WireGuard VPN
 * This plugin adds a VPNShieldTunnel target with PacketTunnelProvider
 */

const { withXcodeProject, withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Network Extension target name
const EXTENSION_NAME = 'VPNShieldTunnel';
const EXTENSION_BUNDLE_ID_SUFFIX = '.VPNShieldTunnel';
const APP_GROUP = 'group.com.simnetiq.vpnreact.vpn';

function withNetworkExtension(config) {
  // Get the main app bundle ID
  const mainBundleId = config.ios?.bundleIdentifier || 'com.simnetiq.vpnreact';
  const extensionBundleId = mainBundleId + EXTENSION_BUNDLE_ID_SUFFIX;

  // Add entitlements to main app
  config = withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.developer.networking.networkextension'] = ['packet-tunnel-provider'];
    config.modResults['com.apple.developer.networking.vpn.api'] = ['allow-vpn'];
    config.modResults['com.apple.security.application-groups'] = [APP_GROUP];
    return config;
  });

  // Add VPN usage description to Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSVPNNetworkExtensionUsageDescription =
      'This app uses VPN to protect your privacy and secure your internet connection.';
    config.modResults.UIBackgroundModes = [
      ...(config.modResults.UIBackgroundModes || []),
      'network-authentication',
    ].filter((v, i, a) => a.indexOf(v) === i);
    return config;
  });

  // Add the Network Extension target to Xcode project
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const iosPath = path.join(projectRoot, 'ios');
    const extensionPath = path.join(iosPath, EXTENSION_NAME);

    // Create extension directory if it doesn't exist
    if (!fs.existsSync(extensionPath)) {
      fs.mkdirSync(extensionPath, { recursive: true });
    }

    // Write PacketTunnelProvider.h for WireGuard
    const headerContent = `//
//  PacketTunnelProvider.h
//  VPNShieldTunnel
//
//  WireGuard PacketTunnelProvider
//

#import <NetworkExtension/NetworkExtension.h>

@interface PacketTunnelProvider : NEPacketTunnelProvider
@end
`;
    fs.writeFileSync(path.join(extensionPath, 'PacketTunnelProvider.h'), headerContent);

    // Write PacketTunnelProvider.m for WireGuard
    const implementationContent = `//
//  PacketTunnelProvider.m
//  VPNShieldTunnel
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
        NSLog(@"[PacketTunnel] Missing required config fields");
        NSError *error = [NSError errorWithDomain:@"VPNShieldTunnel" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Invalid configuration"}];
        completionHandler(error);
        return;
    }

    // Extract server IP from endpoint
    NSString *serverIP = [[endpoint componentsSeparatedByString:@":"] firstObject];

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

- (NSDictionary *)parseWireGuardConfig:(NSString *)config {
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    NSArray *lines = [config componentsSeparatedByString:@"\\n"];

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
    fs.writeFileSync(path.join(extensionPath, 'PacketTunnelProvider.m'), implementationContent);

    // Write Info.plist for extension
    const infoPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>VPNShieldTunnel</string>
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
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
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
    fs.writeFileSync(path.join(extensionPath, 'Info.plist'), infoPlistContent);

    // Write entitlements for extension
    const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.networking.networkextension</key>
  <array>
    <string>packet-tunnel-provider</string>
  </array>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP}</string>
  </array>
</dict>
</plist>
`;
    fs.writeFileSync(path.join(extensionPath, `${EXTENSION_NAME}.entitlements`), entitlementsContent);

    console.log(`[VPN Extension] Created extension files at: ${extensionPath}`);

    // Check if target already exists
    const existingTarget = xcodeProject.pbxTargetByName(EXTENSION_NAME);
    if (existingTarget) {
      console.log(`[VPN Extension] Target ${EXTENSION_NAME} already exists, skipping creation`);
      return config;
    }

    // Add the target to Xcode project
    try {
      const target = xcodeProject.addTarget(
        EXTENSION_NAME,
        'app_extension',
        EXTENSION_NAME,
        extensionBundleId
      );

      if (target) {
        // Create a group for the extension files
        const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;

        // Add group for extension
        const extensionGroup = xcodeProject.addPbxGroup(
          ['PacketTunnelProvider.h', 'PacketTunnelProvider.m', 'Info.plist', `${EXTENSION_NAME}.entitlements`],
          EXTENSION_NAME,
          EXTENSION_NAME
        );

        // Add group to main project
        xcodeProject.addToPbxGroup(extensionGroup.uuid, mainGroup);

        // Add source file to compile sources
        xcodeProject.addSourceFile(
          `${EXTENSION_NAME}/PacketTunnelProvider.m`,
          { target: target.uuid },
          extensionGroup.uuid
        );

        // Get build configurations for the target
        const targetBuildConfigs = xcodeProject.pbxXCBuildConfigurationSection();

        Object.keys(targetBuildConfigs).forEach((key) => {
          const buildConfig = targetBuildConfigs[key];
          if (buildConfig && typeof buildConfig === 'object' && buildConfig.buildSettings) {
            // Check if this config belongs to our extension target
            if (buildConfig.buildSettings.PRODUCT_NAME === EXTENSION_NAME ||
                buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === extensionBundleId) {
              buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
              buildConfig.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
              buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = extensionBundleId;
              buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
              buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
              buildConfig.buildSettings.SKIP_INSTALL = 'YES';
              buildConfig.buildSettings.SWIFT_VERSION = '5.0';
            }
          }
        });

        // Add embed extension build phase to main app
        const mainTarget = xcodeProject.getFirstTarget();
        if (mainTarget) {
          xcodeProject.addTargetDependency(mainTarget.uuid, [target.uuid]);
        }

        console.log(`[VPN Extension] Successfully added ${EXTENSION_NAME} target`);
      }
    } catch (error) {
      console.error(`[VPN Extension] Error adding target: ${error.message}`);
      console.log('[VPN Extension] You may need to add the target manually in Xcode');
    }

    return config;
  });

  return config;
}

module.exports = withNetworkExtension;
