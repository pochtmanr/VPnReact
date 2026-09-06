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
4. Apply the migrations in filename order, one at a time, reading the verification queries in the
   trailing comments of each file before moving to the next.

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
