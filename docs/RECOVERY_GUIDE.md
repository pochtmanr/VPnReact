# VPN Recovery Guide

This guide helps you recover VPN functionality if something breaks.

## Quick Fixes

### 1. "Native module not available" Error

```bash
# Clean and rebuild
rm -rf ios/build ios/Pods
cd ios && pod install && cd ..
npx expo run:ios --device <DEVICE_UDID>
```

### 2. Build Fails After Clean

If `npx expo prebuild --clean` breaks VPN:

1. **Re-add WireGuardVpn files** to `ios/` directory:
   - Copy `WireGuardVpn.h` and `WireGuardVpn.m` from this repo's `ios/` folder

2. **Update project.pbxproj** - add these entries:

   In `PBXBuildFile` section:
   ```
   WGVPN_SRC_001 /* WireGuardVpn.m in Sources */ = {isa = PBXBuildFile; fileRef = WGVPN_FILE_M /* WireGuardVpn.m */; };
   MAINAPP_NE_FW /* NetworkExtension.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = TUNNEL_FW_REF /* NetworkExtension.framework */; };
   ```

   In `PBXFileReference` section:
   ```
   WGVPN_FILE_H /* WireGuardVpn.h */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.h; path = WireGuardVpn.h; sourceTree = "<group>"; };
   WGVPN_FILE_M /* WireGuardVpn.m */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = WireGuardVpn.m; sourceTree = "<group>"; };
   ```

   In VPNShield group children:
   ```
   WGVPN_FILE_H /* WireGuardVpn.h */,
   WGVPN_FILE_M /* WireGuardVpn.m */,
   ```

   In VPNShield Sources build phase files:
   ```
   WGVPN_SRC_001 /* WireGuardVpn.m in Sources */,
   ```

   In VPNShield Frameworks build phase files:
   ```
   MAINAPP_NE_FW /* NetworkExtension.framework in Frameworks */,
   ```

### 3. VPN Connects But No Traffic

Check these in order:

1. **Verify extension bundle ID**
   - In `ios/WireGuardVpn.m`, find `providerBundleIdentifier`
   - Must be: `com.simnetiq.vpnreact.VPNShieldTunnel`

2. **Check extension is embedded**
   - Open Xcode project
   - VPNShield target > Build Phases > Copy Files
   - Should contain `VPNShieldTunnel.appex`

3. **Verify entitlements**
   - Main app needs: Network Extensions, Personal VPN, App Groups
   - Extension needs: Network Extensions, App Groups

### 4. Extension Target Missing

If VPNShieldTunnel target is gone:

1. Run `npx expo prebuild` (not --clean)
2. The withVPNExtension plugin should recreate it
3. If not, manually add target in Xcode

## Full Recovery Steps

If everything is broken, follow these steps:

### Step 1: Backup Current State

```bash
# Save current ios folder
cp -r ios ios_backup
```

### Step 2: Clean Rebuild

```bash
# Remove ios folder
rm -rf ios

# Regenerate
npx expo prebuild --platform ios
```

### Step 3: Add Native Module

Copy files from backup or this repo:
```bash
cp ios_backup/WireGuardVpn.h ios/
cp ios_backup/WireGuardVpn.m ios/
```

### Step 4: Update Xcode Project

Open `ios/VPNShield.xcodeproj/project.pbxproj` and add:

1. File references for WireGuardVpn.h and WireGuardVpn.m
2. Add files to VPNShield group
3. Add WireGuardVpn.m to Sources build phase
4. Add NetworkExtension.framework to Frameworks build phase

See `IOS_NATIVE_MODULE.md` for exact syntax.

### Step 5: Pod Install

```bash
cd ios && pod install && cd ..
```

### Step 6: Build

```bash
npx expo run:ios --device <DEVICE_UDID>
```

## Files You Need

Make sure these files exist and are correct:

### ios/WireGuardVpn.h
```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface WireGuardVpn : RCTEventEmitter <RCTBridgeModule>
@end
```

### ios/WireGuardVpn.m
See `IOS_NATIVE_MODULE.md` for full source.

Key line to verify:
```objc
protocol.providerBundleIdentifier = @"com.simnetiq.vpnreact.VPNShieldTunnel";
```

### ios/VPNShieldTunnel/PacketTunnelProvider.m
See `NETWORK_EXTENSION.md` for full source.

### ios/VPNShieldTunnel/Info.plist
Must have:
```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.networkextension.packet-tunnel</string>
    <key>NSExtensionPrincipalClass</key>
    <string>PacketTunnelProvider</string>
</dict>
```

## Checklist

Use this checklist to verify VPN setup:

- [ ] `ios/WireGuardVpn.h` exists
- [ ] `ios/WireGuardVpn.m` exists
- [ ] WireGuardVpn.m exports as `WireGuardVpnModule`
- [ ] WireGuardVpn.m has correct `providerBundleIdentifier`
- [ ] WireGuardVpn files are in Xcode project
- [ ] WireGuardVpn.m is in Sources build phase
- [ ] NetworkExtension.framework is in Frameworks
- [ ] `ios/VPNShieldTunnel/` directory exists
- [ ] PacketTunnelProvider.h and .m exist
- [ ] VPNShieldTunnel/Info.plist has NSExtension config
- [ ] VPNShieldTunnel.entitlements has correct entitlements
- [ ] VPNShieldTunnel target exists in Xcode
- [ ] VPNShieldTunnel is embedded in main app
- [ ] Both targets have Network Extension capability

## Getting Device UDID

```bash
xcrun xctrace list devices 2>/dev/null | grep iPhone
```

Use the UDID (alphanumeric string in parentheses) with:
```bash
npx expo run:ios --device <UDID>
```

## Contact

If all else fails, refer to:
- Apple Network Extension documentation
- React Native Native Modules documentation
- This repository's git history for working configurations
