# Doppler VPN — How It Works

## Architecture

```
App (React Native) → Backend API (Vercel) → WireGuard API (VPS) → WireGuard Server
```

1. User taps Connect
2. App calls `POST https://www.dopplervpn.org/api/vpn/connect` with account_id, server_id, device_id
3. Backend calls WG API on the VPS to create a fresh peer (keypair + IP)
4. Backend returns a WireGuard config string to the app
5. App passes config to iOS/Android native module → VPN tunnel starts

## Servers

| Location | IP | WG Port | WG API | Supabase ID |
|----------|-----|---------|--------|-------------|
| Germany (Frankfurt) | 72.61.87.54 | 51820 | :9090/wg-api | e462c96b-af8b-4f09-b989-3ad9aec63413 |
| Russia | 45.10.43.204 | 51820 | :9090/wg-api | 078dadc9-871a-4d56-aa7a-f6ec6296bd59 |

**WG API Key:** `dpvpn-wg-2026-secret`

## Key Files

| File | What it does |
|------|-------------|
| `context/VPNContext.tsx` | Main VPN logic — calls API, parses config, connects/disconnects |
| `ios/WireGuardVpn.m` | iOS native bridge — receives config from JS, creates NETunnelProvider |
| `ios/VPNShieldTunnel/PacketTunnelProvider.swift` | iOS tunnel extension — uses WireGuardKit to create real WG tunnel |
| `ios/VPNShieldTunnel/WireGuardKit/` | WireGuardKit source files (compiled into tunnel target) |
| `ios/wireguard-apple/` | WireGuardGoBridge — builds `libwg-go.a` (the Go WireGuard implementation) |
| `android/.../WireGuardVpnModule.kt` | Android native bridge |

## iOS Build

```bash
# From project root
cd ios
pod install
# Open in Xcode:
open VPNShield.xcworkspace
# Build target: VPNShield → Roman's iPhone
```

**Targets in Xcode:**
- **VPNShield** — main app (3 compile sources: AppDelegate.swift, ExpoModulesProvider.swift, WireGuardVpn.m)
- **VPNShieldTunnel** — network extension (PacketTunnelProvider.swift + WireGuardKit files + WireGuardKitC)
- **WireGuardGoBridgeiOS** — builds libwg-go.a (dependency of VPNShieldTunnel)

**DO NOT** add WireGuardKit files to the VPNShield main app target. They belong ONLY in VPNShieldTunnel.

## Android Build

```bash
cd android
./gradlew assembleDebug
# Or via adb:
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Backend API

**Deployed at:** https://www.dopplervpn.org (Vercel)
**Source:** ~/Developer/dopplerLanding

- `POST /api/vpn/connect` — creates WG peer, returns config
- `POST /api/vpn/disconnect` — removes WG peer by public_key

## Environment

```
# ~/Developer/vpnReact/.env
EXPO_PUBLIC_VPN_API_URL=https://www.dopplervpn.org
```

⚠️ Must use `www.dopplervpn.org` (not `dopplervpn.org`) — the bare domain does a 307 redirect that drops POST body on mobile.

## Common Issues

### VPN connects but immediately disconnects
**Stale peer keys.** The WG server lost the peer (reboot, cleanup) but Supabase `vpn_user_configs` still has old config marked `is_active=true`. Fix:

```sql
-- Deactivate all stale configs
UPDATE vpn_user_configs SET is_active = false;
```

Then reconnect — app will get fresh keys from the WG API.

### Config parsing issues
The `parseWireGuardConfig()` function in VPNContext.tsx must handle the `address` field under `[Interface]`. Without it, the client uses a wrong IP and the tunnel fails silently.

### "VPN Shield wants to Add VPN Configurations"
Normal iOS behavior on first connect. User must tap Allow.
