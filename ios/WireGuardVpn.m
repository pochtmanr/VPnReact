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

    NSLog(@"[WireGuardVpn] WireGuard config:\n%@", wgConfig);

    protocol.providerConfiguration = @{@"wgConfig": wgConfig};
    manager.enabled = YES;

    [manager saveToPreferencesWithCompletionHandler:^(NSError * _Nullable error) {
      if (error) {
        NSLog(@"[WireGuardVpn] Save error: %@", error.localizedDescription);
        reject(@"CONNECT_ERROR", error.localizedDescription, error);
        return;
      }

      // Reload from preferences before starting
      [manager loadFromPreferencesWithCompletionHandler:^(NSError * _Nullable loadError) {
        if (loadError) {
          NSLog(@"[WireGuardVpn] Load error: %@", loadError.localizedDescription);
          reject(@"CONNECT_ERROR", loadError.localizedDescription, loadError);
          return;
        }

        NSError *startError;
        [manager.connection startVPNTunnelAndReturnError:&startError];

        if (startError) {
          NSLog(@"[WireGuardVpn] Start error: %@", startError.localizedDescription);
          reject(@"CONNECT_ERROR", startError.localizedDescription, startError);
          return;
        }

        NSLog(@"[WireGuardVpn] VPN tunnel started successfully");
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
