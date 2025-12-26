# Network Extension - VPNShieldTunnel

This document details the iOS Network Extension that handles the actual VPN tunnel.

## Overview

The Network Extension is a separate target that iOS launches when the VPN connects. It runs in its own process and handles all packet tunneling.

## Files

```
ios/VPNShieldTunnel/
├── PacketTunnelProvider.h   # Header file
├── PacketTunnelProvider.m   # Implementation
├── Info.plist               # Extension configuration
└── VPNShieldTunnel.entitlements
```

## PacketTunnelProvider.h

```objc
#import <NetworkExtension/NetworkExtension.h>

NS_ASSUME_NONNULL_BEGIN

@interface PacketTunnelProvider : NEPacketTunnelProvider

@end

NS_ASSUME_NONNULL_END
```

## PacketTunnelProvider.m

```objc
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
    NSArray *lines = [configString componentsSeparatedByString:@"\n"];

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
```

## Info.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
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
```

## VPNShieldTunnel.entitlements

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.simnetiq.vpnreact.vpn</string>
    </array>
    <key>com.apple.developer.networking.networkextension</key>
    <array>
        <string>packet-tunnel-provider</string>
    </array>
</dict>
</plist>
```

## Xcode Project Configuration

### Build Settings for VPNShieldTunnel Target

```
INFOPLIST_FILE = VPNShieldTunnel/Info.plist
CODE_SIGN_ENTITLEMENTS = VPNShieldTunnel/VPNShieldTunnel.entitlements
CODE_SIGN_STYLE = Automatic
PRODUCT_BUNDLE_IDENTIFIER = com.simnetiq.vpnreact.VPNShieldTunnel
PRODUCT_NAME = VPNShieldTunnel
SKIP_INSTALL = YES
TARGETED_DEVICE_FAMILY = "1,2"
IPHONEOS_DEPLOYMENT_TARGET = 15.1
LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"
```

### Required Build Phases

1. **Sources** - Must include `PacketTunnelProvider.m`
2. **Frameworks** - Must include `NetworkExtension.framework`

### Main App Embed Extension

The main app must have a "Copy Files" build phase that embeds `VPNShieldTunnel.appex` into the PlugIns folder.

## Debugging

### View Logs

Extension logs are visible in:
1. Xcode Console (when device is connected)
2. Console.app on Mac (filter by process: VPNShieldTunnel)

### Common Issues

#### Extension Not Starting

Check:
- Bundle identifier matches `providerBundleIdentifier` in main app
- Extension is embedded in main app (PlugIns folder)
- Entitlements are correct

#### Config Not Received

Check:
- `providerConfiguration` is set before calling `startVPNTunnel`
- Config string format is correct

#### Network Settings Fail

Check:
- `tunnelRemoteAddress` is valid IP
- Client address is in correct format (e.g., "10.0.0.2/32")

## Expo Plugin Integration

The extension is created by `plugins/withVPNExtension/index.js` during `npx expo prebuild`.

If the extension is missing after prebuild:
1. Check the plugin is in `app.json` plugins array
2. Run `npx expo prebuild --clean`
3. Verify files exist in `ios/VPNShieldTunnel/`

## Manual Recreation

If you need to recreate the extension manually:

1. Create `ios/VPNShieldTunnel/` directory
2. Add `PacketTunnelProvider.h`, `PacketTunnelProvider.m`, `Info.plist`, `VPNShieldTunnel.entitlements`
3. In Xcode: File > New > Target > Network Extension
4. Configure bundle identifier and entitlements
5. Add to main app's embed extensions build phase
