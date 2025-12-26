# iOS Native Module - WireGuardVpnModule

This document details the React Native native module that bridges JavaScript to iOS VPN APIs.

## Files

### WireGuardVpn.h

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface WireGuardVpn : RCTEventEmitter <RCTBridgeModule>
@end
```

### WireGuardVpn.m

Located at: `ios/WireGuardVpn.m`

Key points:
- Exports as `WireGuardVpnModule` (this is what JS imports)
- Uses `NETunnelProviderManager` for VPN management
- Passes config to extension via `providerConfiguration`

## API Methods

### initialize()
Initializes the VPN manager. Creates a new manager if none exists.

```javascript
await WireGuardVpnModule.initialize();
```

### connect(config)
Connects to VPN with the provided configuration.

```javascript
await WireGuardVpnModule.connect({
  privateKey: 'client_private_key',
  publicKey: 'server_public_key',
  serverAddress: '192.168.1.1',
  serverPort: 51820,
  allowedIPs: ['0.0.0.0/0', '::/0'],
  dns: ['1.1.1.1', '8.8.8.8'],
  mtu: 1420,
  clientAddress: '10.0.0.2/32'
});
```

### disconnect()
Disconnects from VPN.

```javascript
await WireGuardVpnModule.disconnect();
```

### getStatus()
Returns current VPN status.

```javascript
const status = await WireGuardVpnModule.getStatus();
// { isConnected: true, tunnelState: 'ACTIVE' }
```

### isSupported()
Checks if VPN is supported on this device.

```javascript
const supported = await WireGuardVpnModule.isSupported();
```

## Critical Configuration

### Provider Bundle Identifier

In `WireGuardVpn.m`, line ~54:
```objc
protocol.providerBundleIdentifier = @"com.simnetiq.vpnreact.VPNShieldTunnel";
```

**This MUST match your Network Extension's bundle identifier exactly!**

If you change the app's bundle ID, update this line accordingly:
- Main app: `com.yourapp.name`
- Extension: `com.yourapp.name.VPNShieldTunnel`

## Adding to Xcode Project

The native module must be added to the Xcode project manually:

### 1. Add File References

In `project.pbxproj`, add to `PBXFileReference` section:
```
WGVPN_FILE_H /* WireGuardVpn.h */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.h; path = WireGuardVpn.h; sourceTree = "<group>"; };
WGVPN_FILE_M /* WireGuardVpn.m */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = WireGuardVpn.m; sourceTree = "<group>"; };
```

### 2. Add to Group

In the VPNShield group children:
```
WGVPN_FILE_H /* WireGuardVpn.h */,
WGVPN_FILE_M /* WireGuardVpn.m */,
```

### 3. Add Build File

In `PBXBuildFile` section:
```
WGVPN_SRC_001 /* WireGuardVpn.m in Sources */ = {isa = PBXBuildFile; fileRef = WGVPN_FILE_M /* WireGuardVpn.m */; };
```

### 4. Add to Sources Build Phase

In the VPNShield target's Sources build phase:
```
WGVPN_SRC_001 /* WireGuardVpn.m in Sources */,
```

### 5. Add NetworkExtension Framework

In main app's Frameworks build phase:
```
MAINAPP_NE_FW /* NetworkExtension.framework in Frameworks */,
```

## Complete WireGuardVpn.m Source

```objc
#import "WireGuardVpn.h"
#import <NetworkExtension/NetworkExtension.h>

@implementation WireGuardVpn

RCT_EXPORT_MODULE(WireGuardVpnModule)

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"vpnStateChanged"];
}

RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
    if (error) {
      reject(@"INIT_ERROR", error.localizedDescription, error);
      return;
    }

    NETunnelProviderManager *manager = managers.firstObject ?: [[NETunnelProviderManager alloc] init];
    manager.localizedDescription = @"VPN Shield";

    NETunnelProviderProtocol *protocol = [[NETunnelProviderProtocol alloc] init];
    protocol.providerBundleIdentifier = @"com.simnetiq.vpnreact.VPNShieldTunnel";
    manager.protocolConfiguration = protocol;

    [manager saveToPreferencesWithCompletionHandler:^(NSError * _Nullable error) {
      if (error) {
        reject(@"INIT_ERROR", error.localizedDescription, error);
        return;
      }
      resolve(nil);
    }];
  }];
}

RCT_EXPORT_METHOD(connect:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
    if (error) {
      reject(@"CONNECT_ERROR", error.localizedDescription, error);
      return;
    }

    NETunnelProviderManager *manager = managers.firstObject;
    if (!manager) {
      reject(@"CONNECT_ERROR", @"VPN manager not initialized. Call initialize() first.", nil);
      return;
    }

    NETunnelProviderProtocol *protocol = (NETunnelProviderProtocol *)manager.protocolConfiguration;
    protocol.serverAddress = config[@"serverAddress"];
    protocol.providerBundleIdentifier = @"com.simnetiq.vpnreact.VPNShieldTunnel";

    // Build WireGuard config string
    NSString *privateKey = config[@"privateKey"];
    NSString *publicKey = config[@"publicKey"];
    NSString *serverAddress = config[@"serverAddress"];
    NSNumber *serverPort = config[@"serverPort"] ?: @51820;
    NSArray *allowedIPs = config[@"allowedIPs"] ?: @[@"0.0.0.0/0", @"::/0"];
    NSArray *dns = config[@"dns"] ?: @[@"1.1.1.1", @"8.8.8.8"];
    NSNumber *mtu = config[@"mtu"] ?: @1420;
    NSString *clientAddress = config[@"clientAddress"] ?: @"10.0.0.2/32";

    NSString *wgConfig = [NSString stringWithFormat:
      @"[Interface]\n"
      @"PrivateKey = %@\n"
      @"Address = %@\n"
      @"DNS = %@\n"
      @"MTU = %@\n"
      @"\n"
      @"[Peer]\n"
      @"PublicKey = %@\n"
      @"AllowedIPs = %@\n"
      @"Endpoint = %@:%@\n",
      privateKey,
      clientAddress,
      [dns componentsJoinedByString:@", "],
      mtu,
      publicKey,
      [allowedIPs componentsJoinedByString:@", "],
      serverAddress,
      serverPort
    ];

    protocol.providerConfiguration = @{@"wgConfig": wgConfig};
    manager.enabled = YES;

    [manager saveToPreferencesWithCompletionHandler:^(NSError * _Nullable error) {
      if (error) {
        reject(@"CONNECT_ERROR", error.localizedDescription, error);
        return;
      }

      [manager loadFromPreferencesWithCompletionHandler:^(NSError * _Nullable loadError) {
        if (loadError) {
          reject(@"CONNECT_ERROR", loadError.localizedDescription, loadError);
          return;
        }

        NSError *startError;
        [manager.connection startVPNTunnelAndReturnError:&startError];

        if (startError) {
          reject(@"CONNECT_ERROR", startError.localizedDescription, startError);
          return;
        }

        resolve(nil);
      }];
    }];
  }];
}

RCT_EXPORT_METHOD(disconnect:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
    if (error) {
      reject(@"DISCONNECT_ERROR", error.localizedDescription, error);
      return;
    }

    NETunnelProviderManager *manager = managers.firstObject;
    if (!manager) {
      reject(@"DISCONNECT_ERROR", @"VPN manager not initialized", nil);
      return;
    }

    [manager.connection stopVPNTunnel];
    resolve(nil);
  }];
}

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
    if (error) {
      reject(@"STATUS_ERROR", error.localizedDescription, error);
      return;
    }

    NETunnelProviderManager *manager = managers.firstObject;
    if (!manager) {
      resolve(@{
        @"isConnected": @NO,
        @"tunnelState": @"INACTIVE"
      });
      return;
    }

    NEVPNStatus status = manager.connection.status;
    resolve(@{
      @"isConnected": @(status == NEVPNStatusConnected),
      @"tunnelState": [self stringFromVPNStatus:status]
    });
  }];
}

RCT_EXPORT_METHOD(isSupported:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES);
}

- (NSString *)stringFromVPNStatus:(NEVPNStatus)status
{
  switch (status) {
    case NEVPNStatusConnected:
      return @"ACTIVE";
    case NEVPNStatusConnecting:
      return @"CONNECTING";
    case NEVPNStatusDisconnecting:
      return @"DISCONNECTING";
    case NEVPNStatusDisconnected:
      return @"INACTIVE";
    case NEVPNStatusInvalid:
      return @"ERROR";
    default:
      return @"UNKNOWN";
  }
}

@end
```

## Debugging

Check Xcode console for logs prefixed with `[WireGuardVpn]`.

Common issues:
1. Module not found - check it's in Sources build phase
2. Connection fails - check bundle identifier matches
3. Status always INACTIVE - check entitlements
