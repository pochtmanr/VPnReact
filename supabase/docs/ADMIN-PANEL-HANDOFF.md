# Admin panel → database: how subscription changes must be made

**Audience:** whoever maintains the VPS admin panel (`doppler-admin`, GitHub
`pochtmanr/doppler-admin`, deployed by `scripts/deploy.sh`).
**Depends on:** `supabase/migrations/20260906T100400_admin_subscription_rpcs.sql`.
**Status:** the migration is written but **not applied**. Nothing below works until it is.

---

## 1. The rule

> The admin panel must never `UPDATE accounts` directly for anything
> subscription-shaped. Every change goes through an RPC.

Four columns are in scope: `subscription_tier`, `subscription_expires_at`,
`subscription_store`, `original_transaction_id`.

## 2. What the panel does today, and what each defect costs

`src/app/api/admin/accounts/[id]/route.ts` — the PATCH handler, lines 23-50:

```ts
const updateData: Record<string, unknown> = {
  subscription_tier,
  updated_at: new Date().toISOString(),
};
if (subscription_tier === "free") {
  updateData.subscription_expires_at = null;      // :30
  updateData.subscription_store = null;           // :31
} else if (subscription_tier === "pro") {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);  // :41-42  <- absolute, from now()
  updateData.subscription_expires_at = expiresAt.toISOString();
  updateData.subscription_store = "admin";        // :44     <- unconditional
}
await untypedClient.from("accounts").update(updateData).eq("id", id);   // :46-49
```

| Defect | Line | What it costs |
|---|---|---|
| Expiry is **absolute**, computed from `now()` | `:41-42` | Granting 30 goodwill days to a customer with 200 days left **cuts them to 30**. Every other grant path in the product stacks (`landing/src/app/api/oxapay/webhook/route.ts:144-151`, `revolut/webhook/route.ts:191-199`, `/api/dev/grant-pro`); this one does not. |
| `subscription_store` overwritten with `'admin'` | `:44` | Erases `app_store` / `play_store` / `revolut` / `oxapay`. After one grant the row no longer says how the customer paid, and `revoke_subscription` — which only revokes store subscriptions — can never act on them again. |
| Downgrade **nulls** `subscription_expires_at` | `:30` | Destroys the only record of what the customer had bought. Support cannot answer "until when was I Pro?"; the backfill has nothing to reason from. |
| Downgrade **nulls** `subscription_store` | `:31` | Same, for the payment channel. |
| No reason, no actor, no trail | whole handler | Until `subscription_audit` lands, an admin action is indistinguishable from a webhook, a cron sweep, or an anon-key call to `sync_subscription`. This is why the CKC4 downgrade could only be reconstructed by inference. |

## 3. What to call instead

Use the **service-role** client (`createUntypedAdminClient()`); both RPCs are
`service_role`-only and will 404 for any other key.

### 3.1 Grant / extend Pro

```ts
const { data, error } = await supabase.rpc('admin_grant_subscription', {
  p_account_id: id,          // accounts.id uuid OR the VPN-XXXX-XXXX-XXXX id — both work
  p_days: days,              // integer 1..3650
  p_reason: reason,          // REQUIRED, non-empty after trim
  p_actor: admin.email,      // from requireAdmin()
});
```

It **stacks**: `start = current expiry when it is in the future, else now()`. It
keeps an existing paid store (`app_store`, `play_store`, `stripe`, `paddle`,
`revolut`, `oxapay`) and writes `'admin'` only when there was nothing worth
keeping. It never touches `original_transaction_id`,
`subscription_product_id` or `subscription_claimed_at` — an admin grant is not
a store purchase and must not pretend to be one.

Returns:

```jsonc
{
  "success": true, "action": "granted",
  "account_id": "VPN-XXXX-XXXX-XXXX",
  "days": 30, "reason": "...", "actor": "...",
  "stacked": true,                       // true = extended a live term
  "before": { "tier": "pro",  "expires_at": "...", "store": "oxapay" },
  "after":  { "tier": "pro",  "expires_at": "...", "store": "oxapay" }
}
```

Failure shapes, all of which write nothing:
`account_id_required`, `invalid_days`, `reason_required`, `account_not_found`.
They come back as `success: false` in `data` with **no** `error` from
`supabase.rpc` — the call succeeded, the operation did not. **Check
`data.success`, not `error`.** Reading only `error` is how a refused write gets
reported to the operator as a success.

### 3.2 Downgrade to free

```ts
const { data, error } = await supabase.rpc('admin_revoke_subscription', {
  p_account_id: id,
  p_reason: reason,
  p_actor: admin.email,
});
```

Sets `tier='free'` and clamps `expires_at` to `LEAST(expires_at, now())` —
**never NULL**. Keeps `subscription_store` and every ownership column, so the
action is reversible and `verify_restore` keeps working for that customer.

### 3.3 Show the operator what happened

`before`/`after` exist so the panel does not have to re-fetch and diff. Show at
minimum the expiry change, and show `stacked` — an operator who granted 30 days
to a 200-day customer needs to see that the result is 230, not 30, or they will
"fix" it by hand.

## 4. "Sync from RevenueCat" — the rule that matters most

**A sync must never write `'free'`.**

RevenueCat is authoritative for **App Store and Play Store** subscriptions and
for nothing else. It knows nothing about `revolut`, `oxapay`, `admin` or
`dev-grant` terms. "RC has no active entitlement" therefore means *"RC has
nothing to say about this account"* — it does **not** mean *"this account is not
entitled"*.

So:

- **No active entitlement in RC → do nothing.** Not a downgrade, not a tier
  write, not an expiry write. Report "no RevenueCat entitlement; left unchanged"
  in the UI and stop.
- **Active entitlement in RC → call `claim_subscription`**, with RC's *real*
  `original_transaction_id`:

  ```ts
  await supabase.rpc('claim_subscription', {
    p_account_id: vpnAccountId,
    p_tier: 'pro',
    p_expires_at: rcExpiresAt,                 // ISO8601
    p_original_transaction_id: rcOriginalTxnId, // REQUIRED — no txn id is refused
    p_store: rcStore === 'PLAY_STORE' ? 'play_store' : 'app_store',
    p_product_id: rcProductId,
  });
  ```

  `claim_subscription` will not shorten a term that is already longer, will not
  write any tier but `pro`, and refuses a call with no transaction id
  (`{success:false, error:'transaction_id_required'}`).

This is not hypothetical. A tier-only writer set a **paid OxaPay customer**
(`VPN-CKC4-…`, paid 2026-09-06 08:01) to `free` at 11:44:41 while leaving
`subscription_store = 'oxapay'` on the row — a fingerprint only a writer that
touches tier and expiry but not store can leave. RevenueCat had no entitlement
for that account at all, because the customer had never bought through a store.
A sync that treats "RC says nothing" as "downgrade" produces exactly that row.

*(As of 2026-09-06 the recovered `doppler-admin` source contains **no**
RevenueCat sync route — only a dashboard link to `app.revenuecat.com` and a
read-only event log. Either the deployed panel carries code that is not in the
recovered tree, or the CKC4 writer was `sync_subscription` / the
`claim_subscription` legacy branch. Both of those are closed by
`20260906T100100` and `20260906T100200`. This section stands as the rule for any
sync feature added in future.)*

## 5. Do not

- Do **not** `UPDATE accounts` for anything in §1's four columns.
- Do **not** call `sync_subscription`. It is a non-writing stub as of
  `20260906T100100` and is dropped on **2026-10-06**.
- Do **not** call `revoke_subscription` from the panel. That one is for the
  RevenueCat webhook: it means *the store said this ended*, it refuses
  non-store rows, and it clears ownership. The panel's verb is
  `admin_revoke_subscription`.
- Do **not** write `subscription_source`. Nothing reads it and nothing writes
  it today; do not start.
- Do **not** introduce a `premium` tier. The clients map every tier that is not
  `pro` to FREE; `premium` exists only inside immutable product ids.

## 6. One more thing to fix while you are in there

`src/app/api/admin/subscriptions/route.ts:32-38`:

```ts
function isActive(account: SubscriptionAccount): boolean {
  return (
    account.subscription_tier !== "free" &&
    (!account.subscription_expires_at ||                    // <- treats NULL expiry as ACTIVE
      new Date(account.subscription_expires_at) > new Date())
  );
}
```

The server's rule (`get_servers_v2`, the only authority) is:

```
tier IS NOT NULL AND tier <> 'free'
AND expires_at IS NOT NULL AND expires_at > now()
```

A NULL expiry is **not** entitled. The panel currently shows such accounts as
active subscribers while the server withholds every credential from them — the
same class of divergence that produced the Windows "PRO badge, eight servers
that all refuse to connect" dead end. It is a display bug, not an enforcement
one, but it is the display an operator makes decisions from.

## 7. Deploy order

1. Apply `20260906T100400_admin_subscription_rpcs.sql`.
2. Verify both RPCs exist and are `service_role`-only (§VERIFY in that file).
3. Only then deploy the panel.

Backwards, the panel's grant and set-free buttons get `PGRST202` — PostgREST
resolves an RPC by the set of argument names sent, and a function that does not
exist yet resolves to nothing.
