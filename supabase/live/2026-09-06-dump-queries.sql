-- =============================================================================
-- 2026-09-06 — READ-ONLY dump queries for the subscription-state work
-- =============================================================================
-- Run this whole file in the Supabase Dashboard SQL Editor for project
-- fzlrhmjdjjzcgstaeblu. It contains NO DDL and NO DML. Every statement is a
-- SELECT. Running it twice is free.
--
-- Paste each numbered result into supabase/live/2026-09-06-subscription-rpcs.sql
-- under the matching heading, then commit that file. The migrations in
-- supabase/migrations/20260906T1*.sql must not be applied until it exists.
--
-- Why: the repo is not authoritative (SUBSCRIPTION-AND-ANTIFRAUD.md §7).
-- create_account() is zero-arg in the repo and create_account(p_brand text)
-- live. CREATE OR REPLACE replaces the whole body, so applying a repo-authored
-- body deletes whatever drifted. Dump first, edit the dump.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Overload census — how many functions share each name we intend to touch
-- -----------------------------------------------------------------------------
-- CRITICAL. Every migration in this batch that edits an existing function
-- aborts unless the overload count for that name is exactly 1. If any row here
-- shows n_overloads > 1, STOP: the CREATE OR REPLACE in the migration would
-- either create a *second* overload (leaving the old one callable) or replace
-- the wrong one. Resolve by hand before applying anything.
SELECT
    p.proname                                        AS function_name,
    count(*)                                         AS n_overloads,
    string_agg(pg_get_function_identity_arguments(p.oid), ' | ' ORDER BY p.oid) AS identity_args,
    string_agg(pg_get_function_result(p.oid),          ' | ' ORDER BY p.oid)    AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'claim_subscription',
      'revoke_subscription',
      'sync_subscription',
      'downgrade_expired_subscriptions',
      'verify_restore',
      'admin_transfer_subscription',
      'get_subscription_owner',
      'mint_device_token',
      'mint_token_for_existing_device',
      'revoke_device_token',
      'remove_device',
      'get_servers_v2',
      -- new names this batch introduces; each MUST return zero rows here,
      -- otherwise the migration would add an overload to something that exists
      'subscription_apply_grant',
      'subscription_normalize_store',
      'subscription_audit_row',
      'admin_grant_subscription',
      'admin_revoke_subscription'
  )
GROUP BY p.proname
ORDER BY p.proname;


-- -----------------------------------------------------------------------------
-- 2. Full definitions — this is the material the migrations must be edited from
-- -----------------------------------------------------------------------------
-- Copy each `definition` value VERBATIM into 2026-09-06-subscription-rpcs.sql.
-- Do not reformat it; a diff against the repo copy is the point.
SELECT
    p.proname                                    AS function_name,
    pg_get_function_identity_arguments(p.oid)    AS identity_args,
    pg_get_function_arguments(p.oid)             AS declared_args,   -- names + defaults; PostgREST resolves on these NAMES
    pg_get_function_result(p.oid)                AS returns,
    p.prosecdef                                  AS security_definer,
    p.provolatile                                AS volatility,      -- i=immutable s=stable v=volatile
    p.proconfig                                  AS set_clauses,     -- expect {search_path=public}
    r.rolname                                    AS owner,
    pg_get_functiondef(p.oid)                    AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r     ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN (
      'claim_subscription',
      'revoke_subscription',
      'sync_subscription',
      'downgrade_expired_subscriptions',
      'verify_restore',
      'admin_transfer_subscription',
      'get_subscription_owner',
      'mint_device_token',
      'mint_token_for_existing_device',
      'revoke_device_token',
      'remove_device',
      'get_servers_v2'
  )
ORDER BY p.proname, p.oid;


-- -----------------------------------------------------------------------------
-- 3. EXECUTE grants, per function, per role
-- -----------------------------------------------------------------------------
-- The migrations REVOKE from PUBLIC/anon/authenticated. Record what was there
-- first, so a revoke that breaks a live caller can be identified and undone.
-- A function with NO row for anon here is already closed; one with an anon row
-- is reachable over the anon key from any client on the internet.
SELECT
    p.proname                                 AS function_name,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
WHERE n.nspname = 'public'
  AND p.proname IN (
      'claim_subscription','revoke_subscription','sync_subscription',
      'downgrade_expired_subscriptions','verify_restore','admin_transfer_subscription',
      'get_subscription_owner','mint_device_token','mint_token_for_existing_device',
      'revoke_device_token','remove_device','get_servers_v2'
  )
ORDER BY p.proname, grantee;

-- A function with a NULL proacl has never had its grants touched and carries
-- the default, which for a function is EXECUTE to PUBLIC. Those are the
-- dangerous ones: PostgREST exposes every EXECUTE-able function in `public`.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       p.proacl IS NULL AS never_granted_explicitly,
       p.proacl::text   AS raw_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'claim_subscription','revoke_subscription','sync_subscription',
      'downgrade_expired_subscriptions','verify_restore','admin_transfer_subscription',
      'get_subscription_owner','mint_device_token','mint_token_for_existing_device',
      'revoke_device_token','remove_device','get_servers_v2'
  )
ORDER BY p.proname;


-- -----------------------------------------------------------------------------
-- 4. The scheduler — is downgrade_expired_subscriptions actually on cron?
-- -----------------------------------------------------------------------------
-- §6c infers a 0 */6 * * * schedule from 12 accounts whose updated_at lands on
-- an exact 6-hour UTC boundary. This settles it. Do NOT edit cron.job in this
-- batch: migration 20260906T100500 changes the function body only, and the
-- existing schedule picks the new body up on its next run.
SELECT * FROM cron.job ORDER BY jobid;

-- The last 20 runs, so "it is scheduled" can be distinguished from
-- "it is scheduled and erroring every time".
SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;


-- -----------------------------------------------------------------------------
-- 5. accounts — columns, constraints, triggers
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'accounts'
ORDER BY ordinal_position;

-- CHECK constraints. Hole #12 turns on this: the committed
-- subscription_store CHECK allows only app_store|play_store|stripe|NULL, yet
-- live rows carry revolut/oxapay/admin/paddle/dev-grant/ios/android. Either
-- the CHECK was relaxed live or a great many writes are failing silently.
-- Whatever this returns is the truth; write it down.
SELECT con.conname,
       pg_get_constraintdef(con.oid) AS definition,
       con.contype
FROM pg_constraint con
JOIN pg_class c     ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'accounts'
ORDER BY con.contype, con.conname;

-- Existing triggers on accounts. Migration 20260906T100000 adds two AFTER
-- triggers; if something already audits this table, reconcile rather than
-- stacking a second writer onto the same rows.
SELECT t.tgname,
       pg_get_triggerdef(t.oid) AS definition,
       t.tgenabled
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'accounts' AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Indexes, so the audit table's own indexes do not duplicate one that exists.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'accounts'
ORDER BY indexname;

-- RLS posture on accounts. §0 records that the committed
-- "Anyone can read accounts by account_id … USING (true)" policy is NOT what
-- is live — RLS was tightened out of band. Record the live policies.
SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'accounts';

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'accounts'
ORDER BY policyname;


-- -----------------------------------------------------------------------------
-- 6. device_tokens — DDL, and the one-row-per-(account,device) claim
-- -----------------------------------------------------------------------------
-- device_tokens has no DDL in any repo (§7). The closest thing is
-- dopplerswift/docs/device-auth-migration.md:435-468. This is the record.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'device_tokens'
ORDER BY ordinal_position;

SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c     ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'device_tokens'
ORDER BY con.conname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'device_tokens'
ORDER BY indexname;

-- The load-bearing question: does mint_device_token REPLACE the row for a
-- given (account, device), or append a new one? If any row here has n > 1,
-- the "one token row per (account, device)" claim in
-- SUBSCRIPTION-AND-ANTIFRAUD.md §4 is wrong and the device-limit reasoning
-- built on it has to be redone.
SELECT account_id, device_id, count(*) AS n
FROM public.device_tokens
GROUP BY account_id, device_id
HAVING count(*) > 1
ORDER BY n DESC
LIMIT 50;


-- -----------------------------------------------------------------------------
-- 7. Subscription-state census — the numbers the migrations were designed against
-- -----------------------------------------------------------------------------
-- Distinct store values actually present. The migrations normalise
-- ios/macos -> app_store and android -> play_store; anything here that is not
-- in (app_store, play_store, revolut, oxapay, admin, stripe, paddle, dev-grant,
-- ios, android, macos, windows, NULL) is a value nobody has accounted for.
SELECT coalesce(subscription_store, '(null)') AS store,
       subscription_tier,
       count(*) AS n
FROM public.accounts
GROUP BY 1, 2
ORDER BY n DESC;

-- Rows the widened sweeper (20260906T100500) will pick up that the current
-- store-filtered one does not. Expected: the ~11 stuck revolut/oxapay rows
-- from §6c, 4-111 days past expiry.
SELECT account_id,
       subscription_tier,
       subscription_store,
       subscription_expires_at,
       now() - subscription_expires_at AS overdue_by,
       original_transaction_id IS NOT NULL AS has_txn,
       subscription_claimed_at,
       revenuecat_synced_at,
       updated_at
FROM public.accounts
WHERE subscription_tier IS NOT NULL
  AND subscription_tier <> 'free'
  AND subscription_expires_at IS NOT NULL
  AND subscription_expires_at < now()
ORDER BY subscription_expires_at;

-- Paid web invoices whose plan string is parseable, per account. This is the
-- input to the 20260906T100600 backfill; run it now so the backfill's REVIEW
-- step can be compared against a number taken before anything changed.
SELECT split_part(plan, ':', 2) AS account_id,
       count(*)                 AS paid_invoices,
       min(created_at)          AS first_paid_at,
       max(created_at)          AS last_paid_at
FROM public.vpn_invoices
WHERE status = 'paid'
  AND plan ~ '^(monthly|6month|yearly):VPN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
GROUP BY 1
ORDER BY last_paid_at DESC;

-- Paid invoices whose plan string does NOT parse. If this returns rows, the
-- backfill silently ignores those payers and the regex needs widening before
-- 20260906T100600 is trusted.
SELECT id, plan, provider, status, created_at
FROM public.vpn_invoices
WHERE status = 'paid'
  AND plan !~ '^(monthly|6month|yearly):VPN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
ORDER BY created_at DESC
LIMIT 100;


-- -----------------------------------------------------------------------------
-- 8. CKC4 forensics — the row that started this
-- -----------------------------------------------------------------------------
-- Replace the account id if a different case is being investigated. This is
-- the only evidence that survives today, which is the whole argument for the
-- subscription_audit table in 20260906T100000: after that lands, this question
-- is answered by one SELECT instead of by inference.
SELECT account_id, subscription_tier, subscription_store, subscription_product_id,
       subscription_expires_at, subscription_claimed_at, revenuecat_synced_at,
       original_transaction_id, created_at, updated_at
FROM public.accounts
WHERE account_id LIKE 'VPN-CKC4%'
   OR account_id LIKE 'VPN-MQCL%'
ORDER BY created_at;

SELECT * FROM public.vpn_invoices
WHERE plan LIKE '%CKC4%' OR plan LIKE '%MQCL%'
ORDER BY created_at;

-- subscription_events exists live with no DDL in any repo. If it has rows for
-- these accounts they are the closest thing to an audit trail that exists
-- before 20260906T100000.
SELECT * FROM public.subscription_events
WHERE account_id LIKE 'VPN-CKC4%' OR account_id LIKE 'VPN-MQCL%'
ORDER BY created_at;
