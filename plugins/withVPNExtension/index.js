/**
 * Expo Config Plugin for VPN Network Extension
 *
 * This plugin adds the necessary Network Extension target and configuration
 * for WireGuard VPN functionality using Swift and WireGuardKit.
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

    // Create Swift PacketTunnelProvider using WireGuardKit
    const swiftContent = `//
//  PacketTunnelProvider.swift
//  ${EXTENSION_NAME}
//
//  WireGuard VPN Packet Tunnel Provider using WireGuardKit
//

import NetworkExtension
import WireGuardKit

class PacketTunnelProvider: NEPacketTunnelProvider {

    // MARK: - Properties

    private lazy var adapter: WireGuardAdapter = {
        return WireGuardAdapter(with: self) { logLevel, message in
            wg_log(logLevel, message: message)
        }
    }()

    // MARK: - Tunnel Lifecycle

    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        wg_log(.info, message: "Starting tunnel...")

        // Get configuration from provider protocol
        guard let tunnelProtocol = protocolConfiguration as? NETunnelProviderProtocol,
              let providerConfig = tunnelProtocol.providerConfiguration,
              let wgConfigString = providerConfig["wgConfig"] as? String else {
            wg_log(.error, message: "Missing WireGuard configuration")
            let error = NSError(
                domain: "VPNShieldTunnel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "No WireGuard configuration found"]
            )
            completionHandler(error)
            return
        }

        wg_log(.info, message: "WireGuard config received, parsing...")

        do {
            // Parse the WireGuard configuration
            let tunnelConfiguration = try TunnelConfiguration(fromWgQuickConfig: wgConfigString, called: "VPN Shield")

            wg_log(.info, message: "Configuration parsed successfully")
            wg_log(.info, message: "Interface address: \\(tunnelConfiguration.interface.addresses.map { $0.stringRepresentation }.joined(separator: ", "))")

            if let peer = tunnelConfiguration.peers.first {
                wg_log(.info, message: "Peer endpoint: \\(peer.endpoint?.stringRepresentation ?? "none")")
                wg_log(.info, message: "Allowed IPs: \\(peer.allowedIPs.map { $0.stringRepresentation }.joined(separator: ", "))")
            }

            // Start the WireGuard adapter
            adapter.start(tunnelConfiguration: tunnelConfiguration) { adapterError in
                if let error = adapterError {
                    wg_log(.error, message: "Adapter start failed: \\(error.localizedDescription)")
                    completionHandler(error)
                } else {
                    wg_log(.info, message: "WireGuard tunnel started successfully")
                    completionHandler(nil)
                }
            }
        } catch {
            wg_log(.error, message: "Failed to parse WireGuard config: \\(error.localizedDescription)")
            completionHandler(error)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        wg_log(.info, message: "Stopping tunnel, reason: \\(reason.rawValue)")

        adapter.stop { error in
            if let error = error {
                wg_log(.error, message: "Adapter stop error: \\(error.localizedDescription)")
            } else {
                wg_log(.info, message: "Tunnel stopped successfully")
            }

            #if os(macOS)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                completionHandler()
            }
            #else
            completionHandler()
            #endif
        }
    }

    // MARK: - App Messages

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        guard let message = String(data: messageData, encoding: .utf8) else {
            completionHandler?(nil)
            return
        }

        wg_log(.info, message: "Received app message: \\(message)")

        switch message {
        case "getStatus":
            adapter.getRuntimeConfiguration { settings in
                if let settings = settings {
                    let response = settings.data(using: .utf8)
                    completionHandler?(response)
                } else {
                    completionHandler?(nil)
                }
            }
        default:
            completionHandler?(nil)
        }
    }

    // MARK: - Sleep/Wake

    override func sleep(completionHandler: @escaping () -> Void) {
        wg_log(.info, message: "Tunnel going to sleep")
        completionHandler()
    }

    override func wake() {
        wg_log(.info, message: "Tunnel waking up")
    }
}

// MARK: - Logging

private func wg_log(_ level: OSLogType, message: String) {
    let levelString: String
    switch level {
    case .debug:
        levelString = "DEBUG"
    case .info:
        levelString = "INFO"
    case .error:
        levelString = "ERROR"
    case .fault:
        levelString = "FAULT"
    default:
        levelString = "LOG"
    }
    NSLog("[PacketTunnel] [\\(levelString)] \\(message)")
}
`;

    // Create Info.plist for extension (Swift version)
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
        <string>$(PRODUCT_MODULE_NAME).PacketTunnelProvider</string>
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

    // Write files (Swift instead of Objective-C)
    fs.writeFileSync(path.join(extensionPath, 'PacketTunnelProvider.swift'), swiftContent);
    fs.writeFileSync(path.join(extensionPath, 'Info.plist'), infoPlistContent);
    fs.writeFileSync(path.join(extensionPath, `${EXTENSION_NAME}.entitlements`), entitlementsContent);

    // Remove old Objective-C files if they exist
    const oldHeaderPath = path.join(extensionPath, 'PacketTunnelProvider.h');
    const oldImplPath = path.join(extensionPath, 'PacketTunnelProvider.m');
    if (fs.existsSync(oldHeaderPath)) {
      fs.unlinkSync(oldHeaderPath);
    }
    if (fs.existsSync(oldImplPath)) {
      fs.unlinkSync(oldImplPath);
    }

    console.log(`[VPN Extension] Created Swift extension files at: ${extensionPath}`);

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
              config.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
              config.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
              config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
              config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = extensionBundleId;
              config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
              config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
              config.buildSettings.SKIP_INSTALL = 'YES';
              config.buildSettings.SWIFT_VERSION = '5.0';
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

        // Create extension group with Swift file
        const extGroup = xcodeProject.addPbxGroup(
          ['PacketTunnelProvider.swift', 'Info.plist', `${EXTENSION_NAME}.entitlements`],
          EXTENSION_NAME,
          EXTENSION_NAME
        );

        // Add group to main group
        if (extGroup && extGroup.uuid) {
          xcodeProject.addToPbxGroup(extGroup.uuid, mainGroupKey);

          // Add Swift source file to build phase
          xcodeProject.addSourceFile(
            `${EXTENSION_NAME}/PacketTunnelProvider.swift`,
            { target: target.uuid },
            extGroup.uuid
          );
        }

        // Add NetworkExtension.framework to the extension target
        xcodeProject.addFramework('NetworkExtension.framework', { target: target.uuid });

        // Configure build settings for Swift
        const configs = xcodeProject.pbxXCBuildConfigurationSection();
        Object.keys(configs).forEach((key) => {
          const config = configs[key];
          if (config && typeof config === 'object' && config.buildSettings) {
            if (config.buildSettings.PRODUCT_NAME === EXTENSION_NAME) {
              config.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
              config.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
              config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
              config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = extensionBundleId;
              config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
              config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
              config.buildSettings.SKIP_INSTALL = 'YES';
              config.buildSettings.SWIFT_VERSION = '5.0';
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

        console.log(`[VPN Extension] Successfully configured ${EXTENSION_NAME} target with Swift`);
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
