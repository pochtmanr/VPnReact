# Doppler VPN — legacy React Native client

> ## ⚠️ The app here is superseded. The database schema here is not.
>
> **The Expo / React Native client is dead.** It was replaced by `doppler-apple` (native
> SwiftUI, iOS + macOS) and `doppler-android` (native Kotlin). Do not build on it, ship it, or
> treat it as a reference for client behaviour.
>
> **`supabase/` is a different matter.** It holds the authoritative migrations for the *core VPN
> product* — accounts, devices, subscriptions, servers and the admin RPCs — current through
> September 2026 and referenced by
> [`../SUBSCRIPTION-AND-ANTIFRAUD.md`](../SUBSCRIPTION-AND-ANTIFRAUD.md). **Do not delete this
> repository.**

## Why this repo still exists

Doppler's database migrations are split across two repos, for historical rather than logical
reasons:

| Location | Owns |
|---|---|
| **`doppler-legacy-rn/supabase/migrations/`** *(here, 24 files)* | The core product: `accounts`, `device_sessions`, `vpn_servers`, subscription ownership and audit, `client_flags`, server capacity and SNI health, per-account VLESS identity, `get_servers_v2`, admin fleet RPCs |
| `doppler-web/supabase/migrations/` *(10 files)* | Web-side concerns: blog system, checkout tokens, ad conversions, promo redemptions, business inquiries, support-bot tables |

The two sets are disjoint — neither is a copy of the other. The core schema simply never moved
when the app was rewritten natively.

**Recommendation for a future maintainer:** consolidate both into a single migrations directory
under `doppler-web`, which already hosts the Supabase CLI config the rest of the product points
at. That is a deliberate migration, not a file move — the live database is ahead of the repo in
places (see `supabase/live/README.md`), so reconcile before consolidating.

## What is in here

```
supabase/
  migrations/     24 SQL migrations — the core VPN schema (KEEP)
  live/           Dumps of the live database where it has drifted from the repo,
                  plus a README explaining the drift (KEEP — read it)
  docs/           ADMIN-PANEL-HANDOFF.md — notes on a migration and the admin panel
  schema.sql  config.toml
DESIGN_SYSTEM.md  Design specification, v1.0 (2026-01-20). Superseded for the native
                  clients but still the clearest written statement of the visual system.
VPN-SETUP.md      App → backend → WireGuard API architecture note. Historical.
docs/VPN_SETUP.md iOS-specific deep dive. Historical.
ios/wireguard-apple/   Vendored third-party WireGuard-for-Apple. Not ours.
app/  assets/  components/  scripts/   The dead Expo client.
```

> Note the WireGuard references: this prototype predates the move to VLESS-REALITY over
> Xray-core. **The shipping product does not use WireGuard.** Anything in `VPN-SETUP.md` or
> `ios/wireguard-apple/` describes an abandoned direction.

## The live-schema drift

`supabase/live/` exists because the repo is **not** fully authoritative for the live database —
some objects were created directly against Supabase and dumped back here afterwards. Read
`supabase/live/README.md` before assuming a migration file reflects production. Reconciling that
drift is real, known technical debt.

## Signing key

`upload-keystore.jks` sits in the working tree, correctly gitignored and never committed. It
belongs to the dead Android build path; `doppler-android` has its own keys. Keep a backup before
deleting anything here.

## Running it (you probably should not)

```bash
npm install
npx expo start
```

There is no build, test or CI pipeline, and the client has not been maintained since the native
rewrite.

## Related

`doppler-apple` and `doppler-android` — what replaced this ·
[`../SUBSCRIPTION-AND-ANTIFRAUD.md`](../SUBSCRIPTION-AND-ANTIFRAUD.md) — the spec these
migrations back
