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
| 6 | run `20260906T100600` **steps 1-3** — one execution, run twice: reconstruct → REVIEW → (REPAIR) |
| 7 | apply `20260906T100500_downgrade_expired_subscriptions.sql` |
| 8 | run `20260906T100600` **steps 4-5** — one manual sweep → ASSERT |

**Why.** Step 6 must come before step 7: `T100500` changes a function pg_cron already calls every
six hours, so applying it starts a widened sweep within six hours whether or not anyone runs it by
hand. Any web-checkout customer whose term had been truncated would be swept to free before the
backfill got a chance to restore it. And step 8 cannot come before step 7, because the widened
body has to exist before it can be run — `T100600`'s step 4 has a guard that refuses otherwise.

**Sessions.** Steps 1-3 are a single `BEGIN;…COMMIT;` block, so its `TEMP` table never has to
survive a second trip to the server — the Dashboard SQL Editor does not guarantee that two
executions reach the same backend connection, and a temp table belongs to a connection. Run the
block once with `v_confirm := false` to get the REVIEW output (nothing is written), and only run it
again with `v_confirm := true` if that output showed rows. Steps 4 and 5 read no temp table, so
they need no session affinity with steps 1-3 and can be run later, elsewhere.

The same order block appears in the headers of both `20260906T100500` and `20260906T100600`. If the
three ever disagree, they are all wrong and must be fixed together.

## The reconcile gate

Two migrations replace a live function body that was **not** written from the live dump:

| File | Body came from | Diff it against |
|---|---|---|
| `20260906T100200_claim_subscription_guards.sql` | the repo copy, `20260102_subscription_ownership.sql:74-229` | `2026-09-06-subscription-rpcs.sql` **§2.1** |
| `20260906T100500_downgrade_expired_subscriptions.sql` | **observed behaviour only** — no copy exists in any repo | `2026-09-06-subscription-rpcs.sql` **§2.4** |

Both **refuse to run** until you say you have done the diff. After doing it, run this inside the
same transaction — after the `BEGIN;` and before the rest of the file:

```sql
SET LOCAL doppler.reconciled_from_dump = '2026-09-06-subscription-rpcs.sql';
```

`SET LOCAL` scopes it to that transaction, so it cannot leak into the next migration and silently
pre-satisfy its gate. (`SELECT set_config('doppler.reconciled_from_dump',
'2026-09-06-subscription-rpcs.sql', false);` works too, but is session-scoped — prefer `SET LOCAL`.)

Forgetting it costs a loud abort naming the file and the section to read, and nothing else. It is a
gate against skipping the diff, not against a bad diff — it cannot tell whether you actually
compared anything. It exists because every earlier instruction to do so was a comment, and a
comment is not a gate.

## Reading step 4's verification output

After the manual sweep, `20260906T100600` step 4 lists what was swept:

```sql
SELECT … FROM public.subscription_audit WHERE writer_fn = 'downgrade_expired_subscriptions' …
```

**Zero rows there is not proof the sweep did nothing.** `writer_fn` is parsed from the PL/pgSQL
call stack, and it is empty when the stack cannot be read or when the function was inlined or
renamed. Confirm against the sweeper's own return value (`{"downgraded": N}`) and against the
`reason = 'expiry sweep'` rows, and treat a disagreement between the three as a reason to look
harder — not as a clean run.

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
