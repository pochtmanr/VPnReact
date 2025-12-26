# VPN Shield - iOS VPN Setup Guide

This document explains how to set up WireGuard VPN functionality for the iOS app.

## Overview

The VPN implementation consists of:
1. **React Native Bridge** (`WireGuardVpn.m`) - Bridges React Native to iOS NetworkExtension APIs
2. **Network Extension** (`VPNShieldTunnel`) - App extension that handles the actual VPN tunnel
3. **VPNContext** - React context that manages VPN state and operations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              VPNContext.tsx                          │    │
│  │  - Manages connection state                          │    │
│  │  - Fetches servers from Supabase                     │    │
│  │  - Calls native module                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         NativeModules.WireGuardVpnModule             │    │
│  │  (ios/WireGuardVpn.m)                                │    │
│  │  - initialize()                                      │    │
│  │  - connect(config)                                   │    │
│  │  - disconnect()                                      │    │
│  │  - getStatus()                                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              iOS NetworkExtension Framework                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         NETunnelProviderManager                      │    │
│  │  - Manages VPN configuration                         │    │
│  │  - Starts/stops tunnel                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │    VPNShieldTunnel.appex (Network Extension)         │    │
│  │    PacketTunnelProvider.m                            │    │
│  │  - Parses WireGuard config                           │    │
│  │  - Sets up tunnel network settings                   │    │
│  │  - Handles packet routing                            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
ios/
├── WireGuardVpn.h              # React Native bridge header
├── WireGuardVpn.m              # React Native bridge implementation
├── VPNShield/
│   ├── VPNShield.entitlements  # Main app entitlements
│   └── Info.plist
├── VPNShieldTunnel/
│   ├── PacketTunnelProvider.h  # Network extension header
│   ├── PacketTunnelProvider.m  # Network extension implementation
│   ├── Info.plist              # Extension info plist
│   └── VPNShieldTunnel.entitlements
└── VPNShield.xcodeproj/
    └── project.pbxproj         # Xcode project configuration
```

## Required Entitlements

### Main App (VPNShield.entitlements)
```xml
<key>com.apple.security.application-groups</key>
<array>
    <string>group.com.simnetiq.vpnreact.vpn</string>
</array>
<key>com.apple.developer.networking.networkextension</key>
<array>
    <string>packet-tunnel-provider</string>
</array>
<key>com.apple.developer.networking.vpn.api</key>
<array>
    <string>allow-vpn</string>
</array>
```

### Network Extension (VPNShieldTunnel.entitlements)
```xml
<key>com.apple.security.application-groups</key>
<array>
    <string>group.com.simnetiq.vpnreact.vpn</string>
</array>
<key>com.apple.developer.networking.networkextension</key>
<array>
    <string>packet-tunnel-provider</string>
</array>
```

## Bundle Identifiers

- Main App: `com.simnetiq.vpnreact`
- Network Extension: `com.simnetiq.vpnreact.VPNShieldTunnel`

**CRITICAL**: The `providerBundleIdentifier` in `WireGuardVpn.m` MUST match the extension bundle ID exactly!

## How It Works

### Connection Flow

1. **User taps Connect** in the app
2. **VPNContext.connect()** is called
3. Context builds WireGuard config string from server data
4. **WireGuardVpnModule.connect(config)** is called
5. Native module:
   - Loads existing VPN manager or creates new one
   - Sets `providerBundleIdentifier` to extension bundle ID
   - Saves config as `wgConfig` in `providerConfiguration`
   - Calls `startVPNTunnel()`
6. iOS launches **VPNShieldTunnel** extension
7. **PacketTunnelProvider.startTunnelWithOptions**:
   - Reads `wgConfig` from `providerConfiguration`
   - Parses WireGuard config string
   - Sets up `NEPacketTunnelNetworkSettings`
   - Calls completion handler

### WireGuard Config Format

The config is passed as a string in INI format:
```
[Interface]
PrivateKey = <client_private_key>
Address = 10.0.0.2/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1420

[Peer]
PublicKey = <server_public_key>
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = <server_ip>:51820
```

## Troubleshooting

### "WireGuard native module not available"

**Cause**: Native module not properly linked

**Fix**:
1. Ensure `WireGuardVpn.h` and `WireGuardVpn.m` are in the `ios/` directory
2. Check they're added to the Xcode project (VPNShield target)
3. Check `WireGuardVpn.m` is in Sources build phase
4. Rebuild: `npx expo run:ios --device`

### VPN connects but no traffic

**Cause**: Network Extension not receiving config or not setting up routes

**Fix**:
1. Check Xcode Console logs for `[PacketTunnel]` messages
2. Verify `providerBundleIdentifier` matches extension bundle ID
3. Ensure extension has correct entitlements

### "Configuration is invalid"

**Cause**: Missing or malformed WireGuard config

**Fix**:
1. Check server has `wg_public_key` and `wg_endpoint` in database
2. Verify client private key is generated
3. Check config string format in logs

## Rebuilding After Changes

If native code is modified:

```bash
# Clean and rebuild
rm -rf ios/build
cd ios && pod install && cd ..
npx expo run:ios --device
```

If Xcode project is corrupted:

```bash
# Full clean rebuild
rm -rf ios/
npx expo prebuild --platform ios
# Then manually add WireGuardVpn files back
```

## Apple Developer Portal Setup

Required capabilities in App ID:
1. **App Groups** - For sharing data between app and extension
2. **Network Extensions** - For packet tunnel provider
3. **Personal VPN** - For VPN functionality

Both the main app and extension App IDs need these capabilities.
