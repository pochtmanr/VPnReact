# `supabase/live/` — dumps of what is actually running

This directory exists because **the repo is not authoritative** for this project's database.
`SUBSCRIPTION-AND-ANTIFRAUD.md` §7 demonstrates the drift rather than asserting it: the committed
`create_account()` is zero-arg, the live one is `create_account(p_brand text)`. Nobody wrote a
migration. 57 functions exist live; a third of them have no DDL in any repo.

Every `CREATE OR REPLACE FUNCTION` replaces the **whole body**. Applying a repo copy of a function
that drifted live silently deletes the drift. That is how you delete a parameter a caller still
sends, and PostgREST resolves an RPC by *the set of argument names sent*, so the caller does not
degrade — it gets `PGRST202` and every call fails.

## The rule

> **Before `CREATE OR REPLACE` on anything, dump the live body with `pg_get_functiondef` and edit
> that.** Never apply a body written from the repo copy alone.

## The workflow this directory implements

1. Run `2026-09-06-dump-queries.sql` — **read-only**, no DDL, no DML — in the Supabase Dashboard
   SQL Editor for project `fzlrhmjdjjzcgstaeblu` (see `SUBSCRIPTION-AND-ANTIFRAUD.md` §0; the CLI
   on Roman's Mac is authenticated to a *different* Supabase org and the Management API returns
   403 for this project, so the Dashboard is the only route today).
2. Paste each result into `2026-09-06-subscription-rpcs.sql`, replacing its placeholder banner.
   Commit that file. It becomes the record of what live looked like on 2026-09-06.
3. **Only then** reconcile the bodies in `supabase/migrations/20260906T1*.sql` against the dump.
   Each of those files carries a `PROPOSAL — not yet applied` header and inline
   `-- RECONCILE:` markers on every line that was written from the repo copy or inferred from
   observed behaviour rather than read from live.
4. Apply the migrations one at a time, reading the verification queries in the trailing comments
   of each file before moving to the next. **Filename order is not quite the apply order** — see
   below.

## The apply order

Six of the seven migrations go in filename order. The seventh, `20260906T100600` (the backfill),
is deliberately run in **two sittings** with `20260906T100500` applied in between:

| # | Do this |
|---|---|
| 1 | apply `20260906T100000_subscription_audit.sql` |
| 2 | apply `20260906T100100_lock_sync_subscription.sql` |
| 3 | apply `20260906T100200_claim_subscription_guards.sql` |
| 4 | apply `20260906T100300_revoke_subscription_guards.sql` |
| 5 | apply `20260906T100400_admin_subscription_rpcs.sql` |
| 6 | run `20260906T100600` **steps 1-3** — temp table → REVIEW → REPAIR |
| 7 | apply `20260906T100500_downgrade_expired_subscriptions.sql` |
| 8 | run `20260906T100600` **steps 4-5** — one manual sweep → ASSERT |

**Why.** Step 6 must come before step 7: `T100500` changes a function pg_cron already calls every
six hours, so applying it starts a widened sweep within six hours whether or not anyone runs it by
hand. Any web-checkout customer whose term had been truncated would be swept to free before the
backfill got a chance to restore it. And step 8 cannot come before step 7, because the widened
body has to exist before it can be run — `T100600`'s step 4 has a guard that refuses otherwise.

Run steps 6 and 8 **in the same SQL Editor session**: step 1 creates a `TEMP` table that steps 2
and 3 read, and a temp table does not outlive its session. Losing it is harmless — step 1 is
idempotent and read-only — but you have to re-run it.

The same block appears in the headers of both `20260906T100500` and `20260906T100600`. If the
three ever disagree, they are all wrong and must be fixed together.

## What is *not* allowed from this machine

- No `supabase db push` from `landing/` — `landing/supabase/.temp/project-ref` is stale and names
  a different project (`seakhlgyzkerxabitgoo`). Clear `.temp/` first if you ever link.
- No replay of `20260102_subscription_ownership.sql`. If the `subscription_store` CHECK was
  relaxed live (four writers store `revolut` / `oxapay` / `paddle` / `dev-grant`, which the
  committed CHECK forbids), replaying re-tightens it and turns a latent bug into an outage.
  `2026-09-06-dump-queries.sql` §7 settles which it is.

## Files

| File | What it is |
|---|---|
| `2026-09-06-dump-queries.sql` | The read-only queries to run. Safe to run at any time. |
| `2026-09-06-subscription-rpcs.sql` | Placeholder. Filled by whoever runs the queries above. |
