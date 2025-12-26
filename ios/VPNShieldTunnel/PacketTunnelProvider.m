//
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
