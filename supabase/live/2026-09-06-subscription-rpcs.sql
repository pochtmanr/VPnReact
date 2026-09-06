-- =============================================================================
-- PLACEHOLDER — this file is EMPTY OF FACTS until somebody fills it in.
-- =============================================================================
--
-- Nothing in supabase/migrations/20260906T1*.sql may be applied while this
-- banner is still here. Every one of those files says so in its own header and
-- several of them refuse to run until their preconditions hold.
--
-- HOW TO FILL IT IN
--
--   1. Open the Supabase Dashboard SQL Editor for project fzlrhmjdjjzcgstaeblu.
--      (Not the CLI on Roman's Mac: it is authenticated to a different Supabase
--      org, and the Management API returns 403 for this project. See
--      SUBSCRIPTION-AND-ANTIFRAUD.md §6c.)
--   2. Run supabase/live/2026-09-06-dump-queries.sql. It is read-only: SELECTs
--      only, no DDL, no DML.
--   3. Paste each result under the matching heading below, VERBATIM. Do not
--      reformat pg_get_functiondef output — a clean diff against the repo copy
--      is the entire point of dumping it.
--   4. Delete this banner, commit, and only then start reconciling the
--      migrations.
--
-- WHY THIS EXISTS
--
--   The repo is not authoritative (SUBSCRIPTION-AND-ANTIFRAUD.md §7). The
--   committed create_account() is zero-arg; the live one is
--   create_account(p_brand text). Somebody added the parameter out of band and
--   never wrote a migration. CREATE OR REPLACE FUNCTION replaces the *whole*
--   body, so applying a repo-authored body silently deletes whatever drifted —
--   and PostgREST resolves an RPC by the set of argument NAMES sent, so the
--   caller does not degrade gracefully: it gets PGRST202 and every call fails.
--
--   The same hazard is known to apply to get_servers_v2, claim_subscription and
--   verify_restore. verify_restore has no DDL in any repo at all and yet both
--   mobile clients call it.
--
-- =============================================================================


-- =============================================================================
-- 1. OVERLOAD CENSUS   (dump-queries §1)
-- =============================================================================
-- Expect exactly one row per existing name with n_overloads = 1, and ZERO rows
-- for subscription_apply_grant / subscription_normalize_store /
-- subscription_audit_row / admin_grant_subscription / admin_revoke_subscription.
-- If any of those five already exist, the migrations would add an overload to
-- something live. Stop and re-plan.
--
-- << PASTE RESULT HERE >>


-- =============================================================================
-- 2. FULL FUNCTION DEFINITIONS   (dump-queries §2)
-- =============================================================================
-- One block per function, pasted verbatim from pg_get_functiondef.

-- -----------------------------------------------------------------------------
-- 2.1 claim_subscription
-- -----------------------------------------------------------------------------
-- Feeds: migrations/20260906T100200_claim_subscription_guards.sql
-- Repo copy for comparison: migrations/20260102_subscription_ownership.sql:74-229
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.2 revoke_subscription
-- -----------------------------------------------------------------------------
-- Feeds: migrations/20260906T100300_revoke_subscription_guards.sql
-- Repo copy: migrations/20260102_subscription_ownership.sql:279-317
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.3 sync_subscription
-- -----------------------------------------------------------------------------
-- Feeds: migrations/20260906T100100_lock_sync_subscription.sql
-- Repo copy: scripts/complete_account_migration.sql:118-156
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.4 downgrade_expired_subscriptions
-- -----------------------------------------------------------------------------
-- Feeds: migrations/20260906T100500_downgrade_expired_subscriptions.sql
-- NO repo copy exists. This dump is the ONLY source. In particular the RETURN
-- TYPE matters: CREATE OR REPLACE cannot change it, so if this is not jsonb the
-- migration must be switched to the alternative body it carries.
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.5 verify_restore
-- -----------------------------------------------------------------------------
-- No migration in this batch touches it. Dumped because both mobile clients
-- call it, it has no DDL anywhere, and it is the one lever with a working
-- client contract for refusing a subscription (§3).
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.6 admin_transfer_subscription
-- -----------------------------------------------------------------------------
-- No migration touches it. Dumped because 20260906T100400 adds two admin RPCs
-- beside it and they must not contradict what it already does.
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.7 get_subscription_owner
-- -----------------------------------------------------------------------------
-- No migration touches it. Dumped because the revenuecat-webhook change makes
-- EXPIRATION and CANCELLATION depend on it, as RENEWAL already does.
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.8 mint_device_token
-- -----------------------------------------------------------------------------
-- No DDL in any repo. Dumped to settle whether it REPLACES the row for a
-- given (account, device) or appends one — the device-limit reasoning depends
-- on it. Cross-check against dump-queries §6's duplicate count.
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.9 mint_token_for_existing_device
-- -----------------------------------------------------------------------------
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.10 revoke_device_token
-- -----------------------------------------------------------------------------
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.11 remove_device
-- -----------------------------------------------------------------------------
-- << PASTE pg_get_functiondef HERE >>

-- -----------------------------------------------------------------------------
-- 2.12 get_servers_v2
-- -----------------------------------------------------------------------------
-- No migration in this batch touches it. Dumped because it is THE Pro gate
-- (§1) and because the repo copy
-- (migrations/20260815221927_ios05_killswitch_flag.sql) is known to be a
-- CREATE OR REPLACE candidate that may already differ live.
-- << PASTE pg_get_functiondef HERE >>


-- =============================================================================
-- 3. EXECUTE GRANTS PER ROLE   (dump-queries §3)
-- =============================================================================
-- The pre-change state. 20260906T100100 and T100300 revoke from
-- PUBLIC/anon/authenticated; this is what makes those revokes reversible.
-- << PASTE BOTH RESULTS HERE >>


-- =============================================================================
-- 4. CRON   (dump-queries §4)
-- =============================================================================
-- SELECT * FROM cron.job — settles §6c's inference that
-- downgrade_expired_subscriptions runs on 0 */6 * * *.
-- NOTE: no migration in this batch edits cron.job. 20260906T100500 changes the
-- function body only; the existing schedule picks it up on its next run, which
-- is exactly why that file must not be applied before the backfill.
-- << PASTE cron.job AND cron.job_run_details HERE >>


-- =============================================================================
-- 5. accounts — COLUMNS, CONSTRAINTS, TRIGGERS, INDEXES, RLS   (dump-queries §5)
-- =============================================================================
-- The subscription_store CHECK is the one that settles hole #12. The committed
-- CHECK allows only app_store|play_store|stripe|NULL, and five live writers
-- store values outside that set. Whatever the dump says is the truth.
-- << PASTE ALL SIX RESULTS HERE >>


-- =============================================================================
-- 6. device_tokens   (dump-queries §6)
-- =============================================================================
-- DDL, constraints, indexes, and the (account_id, device_id) duplicate count.
-- An empty duplicate result confirms one token row per (account, device).
-- << PASTE RESULTS HERE >>


-- =============================================================================
-- 7. SUBSCRIPTION-STATE CENSUS   (dump-queries §7)
-- =============================================================================
-- Store/tier histogram, the rows past expiry, and the paid-web-invoice terms
-- the 20260906T100600 backfill consumes. Take these numbers BEFORE applying
-- anything; the backfill's REVIEW step is compared against them.
-- << PASTE RESULTS HERE >>


-- =============================================================================
-- 8. CKC4 / MQCL FORENSICS   (dump-queries §8)
-- =============================================================================
-- The evidence that survives today. After 20260906T100000 lands, this question
-- is one SELECT against subscription_audit instead of an inference from
-- updated_at timestamps.
-- << PASTE RESULTS HERE >>
