#import "WireGuardVpn.h"
#import <NetworkExtension/NetworkExtension.h>

static NSString *const kProviderBundleIdentifier = @"com.simnetiq.vpnreact.VPNShieldTunnel";
static NSString *const kVPNDescription = @"VPN Shield";

@implementation WireGuardVpn {
  NETunnelProviderManager *_cachedManager;
}

RCT_EXPORT_MODULE(WireGuardVpnModule)

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"vpnStateChanged"];
}

RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  // Load existing VPN configurations and find valid one
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
    if (error) {
      NSLog(@"[WireGuardVpn] Initialize load warning: %@", error.localizedDescription);
    }

    NSLog(@"[WireGuardVpn] Found %lu existing managers", (unsigned long)managers.count);

    // Find our existing valid manager
    NETunnelProviderManager *validManager = nil;
    NSMutableArray *managersToRemove = [NSMutableArray array];

    for (NETunnelProviderManager *manager in managers) {
      NETunnelProviderProtocol *protocol = (NETunnelProviderProtocol *)manager.protocolConfiguration;

      // Check if this is our VPN manager
      if ([protocol.providerBundleIdentifier isEqualToString:kProviderBundleIdentifier]) {
        if (protocol.serverAddress && protocol.serverAddress.length > 0) {
          // Valid manager found
          if (!validManager) {
            validManager = manager;
            NSLog(@"[WireGuardVpn] Found valid existing VPN configuration");
          } else {
            // Duplicate - mark for removal
            [managersToRemove addObject:manager];
          }
        } else {
          // Broken config - mark for removal
          [managersToRemove addObject:manager];
        }
      }
    }

    // Cache the valid manager
    self->_cachedManager = validManager;

    // Remove broken/duplicate configs
    for (NETunnelProviderManager *manager in managersToRemove) {
      NSLog(@"[WireGuardVpn] Removing broken/duplicate config...");
      [manager removeFromPreferencesWithCompletionHandler:^(NSError * _Nullable removeError) {
        if (removeError) {
          NSLog(@"[WireGuardVpn] Failed to remove config: %@", removeError.localizedDescription);
        }
      }];
    }

    resolve(nil);
  }];
}

RCT_EXPORT_METHOD(connect:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
    if (error) {
      NSLog(@"[WireGuardVpn] Load managers warning: %@", error.localizedDescription);
    }

    // Find existing manager with our bundle identifier (REUSE instead of delete!)
    NETunnelProviderManager *existingManager = nil;
    for (NETunnelProviderManager *manager in managers) {
      NETunnelProviderProtocol *protocol = (NETunnelProviderProtocol *)manager.protocolConfiguration;
      if ([protocol.providerBundleIdentifier isEqualToString:kProviderBundleIdentifier]) {
        existingManager = manager;
        NSLog(@"[WireGuardVpn] Found existing VPN manager, will reuse");
        break;
      }
    }

    // Reuse existing manager or create new one
    [self configureAndConnectManager:existingManager withConfig:config resolver:resolve rejecter:reject];
  }];
}

- (void)configureAndConnectManager:(NETunnelProviderManager *)existingManager
                         withConfig:(NSDictionary *)config
                           resolver:(RCTPromiseResolveBlock)resolve
                           rejecter:(RCTPromiseRejectBlock)reject
{
    BOOL isNewManager = (existingManager == nil);
    NETunnelProviderManager *manager = isNewManager ? [[NETunnelProviderManager alloc] init] : existingManager;

    if (isNewManager) {
        NSLog(@"[WireGuardVpn] Creating new VPN manager");
        manager.localizedDescription = kVPNDescription;
    } else {
        NSLog(@"[WireGuardVpn] Reusing existing VPN manager");
    }

    // Get or create protocol
    NETunnelProviderProtocol *protocol;
    if (isNewManager) {
        protocol = [[NETunnelProviderProtocol alloc] init];
    } else {
        protocol = (NETunnelProviderProtocol *)manager.protocolConfiguration;
        if (!protocol) {
            protocol = [[NETunnelProviderProtocol alloc] init];
        }
    }

    protocol.serverAddress = config[@"serverAddress"];
    protocol.providerBundleIdentifier = kProviderBundleIdentifier;

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

    NSLog(@"[WireGuardVpn] WireGuard config:\n%@", wgConfig);

    protocol.providerConfiguration = @{@"wgConfig": wgConfig};

    // Assign the protocol to the manager
    manager.protocolConfiguration = protocol;
    manager.enabled = YES;

    [manager saveToPreferencesWithCompletionHandler:^(NSError * _Nullable saveError) {
      if (saveError) {
        NSLog(@"[WireGuardVpn] Save error: %@", saveError.localizedDescription);
        reject(@"CONNECT_ERROR", saveError.localizedDescription, saveError);
        return;
      }

      NSLog(@"[WireGuardVpn] Configuration saved successfully");

      // Reload from preferences before starting (required by iOS)
      [manager loadFromPreferencesWithCompletionHandler:^(NSError * _Nullable loadError) {
        if (loadError) {
          NSLog(@"[WireGuardVpn] Load error: %@", loadError.localizedDescription);
          reject(@"CONNECT_ERROR", loadError.localizedDescription, loadError);
          return;
        }

        // Check current connection status
        NEVPNStatus currentStatus = manager.connection.status;
        if (currentStatus == NEVPNStatusConnected || currentStatus == NEVPNStatusConnecting) {
          NSLog(@"[WireGuardVpn] VPN already connected or connecting");
          resolve(nil);
          return;
        }

        NSError *startError;
        [manager.connection startVPNTunnelAndReturnError:&startError];

        if (startError) {
          NSLog(@"[WireGuardVpn] Start error: %@", startError.localizedDescription);
          reject(@"CONNECT_ERROR", startError.localizedDescription, startError);
          return;
        }

        // Cache the manager
        self->_cachedManager = manager;
        NSLog(@"[WireGuardVpn] VPN tunnel started successfully");
        resolve(nil);
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
    NSLog(@"[WireGuardVpn] VPN tunnel stopped");
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
