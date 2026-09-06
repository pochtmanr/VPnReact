-- PROPOSAL — not yet applied; apply only after VPnReact/supabase/live/2026-09-06-subscription-rpcs.sql exists and the body below has been reconciled against the live dump
--
-- *** DEFINE ONLY — APPLY IN THE MIDDLE OF 20260906T100600, NOT AFTER IT ***
--
-- 20260906T100600 is deliberately run in TWO SITTINGS and this file goes
-- between them. This is the single true order; T100600 carries the same block
-- under the heading "THE APPLY ORDER", and if the two ever disagree they are
-- both wrong and must be fixed together.
--
--   1-5.  apply 20260906T100000 / T100100 / T100200 / T100300 / T100400
--   6.    run 20260906T100600 STEPS 1-3   (temp table -> REVIEW -> REPAIR)
--   7.    >>> APPLY THIS FILE <<<
--   8.    run 20260906T100600 STEPS 4-5   (one manual sweep -> ASSERT)
--
-- WHY THE ORDER IS THIS AND NOT SOMETHING SIMPLER
--   Step 6 must precede step 7: this file changes a function that pg_cron
--   already calls every six hours, so the moment it is applied the NEXT
--   scheduled run sweeps a population it has never swept before — the ~11
--   stuck revolut/oxapay accounts. If any of those is a paying customer whose
--   term was truncated by one of the writers this batch fixes, the sweep makes
--   that permanent and silent. T100600 steps 1-3 reconstruct each web-checkout
--   account's paid term from vpn_invoices and repair it first.
--
--   Step 8 cannot precede step 7: the widened body has to exist before it can
--   be run. T100600's step 4 refuses to run if this file has not been applied.
--
--   No ordering of whole files satisfies both constraints, which is why
--   T100600 is split rather than this file being moved.
--
-- DO NOT TOUCH cron.job in this file or in any file in this batch. The schedule
-- is correct; only the WHERE clause is wrong. Adding a second cron entry would
-- call the same function and skip the same rows (§6c).
--
-- =============================================================================
-- 20260906T100500 — downgrade_expired_subscriptions: sweep every store
-- =============================================================================
--
-- THE BUG
--   The sweeper is scheduled and has been running for months. It applies a
--   ~3-day grace and it works. But 11 revolut/oxapay accounts sit at
--   tier='pro' up to 111 days past expiry, which means its WHERE clause
--   restricts to store-backed rows. Every stuck row shares one signature:
--   original_transaction_id IS NULL, subscription_claimed_at IS NULL,
--   revenuecat_synced_at IS NULL, store revolut/oxapay — i.e. they arrived
--   through landing web checkout and never went through claim_subscription.
--
--   Web checkout is Windows' ONLY purchase path, so the sweeper's blind spot
--   and the Windows entitlement defect are the same population by construction.
--
-- THE FIX
--   Delete the store filter. Sweep on the entitlement rule and nothing else.
--
-- =============================================================================
-- RECONCILE — READ THIS BEFORE APPLYING
-- =============================================================================
--   There is NO copy of this function in any repo. The body below was
--   RECONSTRUCTED from observed behaviour (SUBSCRIPTION-AND-ANTIFRAUD.md §6c:
--   what swept rows look like, diffed against what the clients write at claim
--   time). It is a hypothesis, not a dump.
--
--   You MUST replace the body below with live/2026-09-06-subscription-rpcs.sql
--   §2.4 and then make exactly TWO edits to it. Do not apply this
--   reconstruction as written unless the dump turns out to match it.
--
--     EDIT 1 (the functional change): delete the store predicate from the
--             WHERE clause.
--     EDIT 2 (MANDATORY, not optional): add
--                 PERFORM set_config('doppler.reason', 'expiry sweep', true);
--             as the first statement of the body, exactly as spelled here.
--
--   Edit 2 is load-bearing in two places, which is why it is not a nicety:
--     * every swept row's audit entry carries a reason, so the sweep stops
--       being the silent writer it has always been;
--     * 20260906T100600 step 4 has a precheck that REFUSES to run the manual
--       sweep unless this exact string is present in the installed body. Drop
--       the line and that step aborts with a message about the store predicate
--       that will send you looking in the wrong place.
--
--   Specifically unknown until the dump exists:
--     * the RETURN TYPE. CREATE OR REPLACE CANNOT CHANGE IT. If live returns
--       void or integer, the CREATE below fails outright with
--       "cannot change return type of existing function" — the guard block
--       catches this and tells you which alternative to use.
--     * whether it writes subscription_events, updates a counter, or touches
--       any table other than accounts.
--     * whether the grace is exactly 3 days or a different interval that merely
--       measured as 3.06-3.24 days in the field.
--     * whether it nulls subscription_product_id as well as subscription_store.
--
--   What is NOT negotiable, whatever the dump says:
--     * it must PRESERVE subscription_expires_at, original_transaction_id,
--       subscription_claimed_at and revenuecat_synced_at. That is what makes
--       the sweeper meaningfully less destructive than revoke_subscription, and
--       it is what keeps verify_restore working for a lapsed subscriber who
--       later renews.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Preconditions
-- -----------------------------------------------------------------------------
DO $guard$
DECLARE
    v_n   integer;
    v_ret text;
BEGIN
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'downgrade_expired_subscriptions';

    IF v_n = 0 THEN
        RAISE EXCEPTION
            'ABORT: public.downgrade_expired_subscriptions does not exist live. §6c says it does and that it is on cron. Something is very wrong — stop and find out what.';
    END IF;

    IF v_n <> 1 THEN
        RAISE EXCEPTION
            'ABORT: downgrade_expired_subscriptions has % overloads, expected exactly 1. cron.job names it without a signature; guess wrong and the cron keeps calling the OLD one.',
            v_n;
    END IF;

    SELECT pg_get_function_result(p.oid) INTO v_ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'downgrade_expired_subscriptions';

    IF v_ret IS DISTINCT FROM 'jsonb' THEN
        RAISE EXCEPTION
            'ABORT: downgrade_expired_subscriptions returns %, but the body below declares jsonb. CREATE OR REPLACE cannot change a return type. Use the ALTERNATIVE BODY at the foot of this file (RETURNS %) instead, or DROP+CREATE in one transaction and re-point cron.job — but do NOT drop a function a live cron job calls without confirming the schedule first.',
            v_ret, v_ret;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.accounts'::regclass
          AND NOT tgisinternal
          AND tgname = 'trg_accounts_subscription_audit_upd'
    ) THEN
        RAISE EXCEPTION
            'ABORT: apply 20260906T100000_subscription_audit.sql first. A sweep that widens its own blast radius must be attributable.';
    END IF;

    -- Loud, because the next cron tick applies this to real customers.
    RAISE NOTICE
        'downgrade_expired_subscriptions: % rows currently match the WIDENED predicate and will be swept on the next cron tick.',
        (SELECT count(*) FROM public.accounts
          WHERE subscription_tier IS NOT NULL
            AND subscription_tier <> 'free'
            AND subscription_expires_at IS NOT NULL
            AND subscription_expires_at < now() - interval '3 days');
END
$guard$;


-- -----------------------------------------------------------------------------
-- The function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.downgrade_expired_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_count integer;
BEGIN
    -- MANDATORY — do not drop this line when reconciling against the dump, and
    -- do not reword the string. Two things depend on it:
    --   1. every swept row's audit entry carries a reason, so the sweep stops
    --      being the silent writer it has always been. It writes no
    --      subscription_events row and, before 20260906T100000, left nothing
    --      behind but an updated_at on a 6-hour boundary — which is how "is it
    --      even scheduled?" stayed an open question for months and got answered
    --      wrong once;
    --   2. 20260906T100600 step 4 asserts this exact literal is present in the
    --      installed body before it will run the manual sweep.
    PERFORM set_config('doppler.reason', 'expiry sweep', true);

    UPDATE public.accounts SET
        subscription_tier       = 'free',
        subscription_store      = NULL,
        subscription_product_id = NULL,
        updated_at              = NOW()
    WHERE subscription_tier IS NOT NULL
      AND subscription_tier <> 'free'
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at < now() - interval '3 days';
      -- ^ THE EDIT. Whatever store predicate the live body carries goes HERE,
      --   and deleting it is the entire change. Everything above and below is
      --   reconstruction that must be replaced by the dump.
      --
      --   The 3-day grace is deliberate and stays: a renewal that is late by a
      --   few hours must not cost the customer their access, and RevenueCat's
      --   EXPIRATION events are not instantaneous.

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- PRESERVED, deliberately and non-negotiably:
    --   subscription_expires_at   — the record of what was bought
    --   original_transaction_id   — ownership; verify_restore reads it
    --   subscription_claimed_at   — when this account first got it
    --   revenuecat_synced_at      — last time a client agreed with us
    -- This is what makes the sweeper safe to widen. revoke_subscription nulls
    -- all four; the sweeper must not.

    RAISE LOG '[downgrade_expired_subscriptions] swept % rows', v_count;

    RETURN jsonb_build_object(
        'success',    true,
        'downgraded', v_count,
        'swept_at',   now()
    );
END;
$fn$;

COMMENT ON FUNCTION public.downgrade_expired_subscriptions() IS
    'pg_cron expiry sweeper (0 */6 * * *). Sweeps EVERY store — the store filter that '
    'skipped revolut/oxapay web-checkout rows was removed 2026-09-06. Applies a 3-day grace '
    'and preserves expires_at / original_transaction_id / claimed_at / revenuecat_synced_at.';

-- Grants: deliberately NOT changed. pg_cron runs jobs as the job owner, not
-- through PostgREST, so whatever ACL is live already works. Re-granting or
-- revoking here risks breaking the schedule for no benefit. Record the live
-- grants from live/2026-09-06-subscription-rpcs.sql §3 before applying, so a
-- rollback can restore them.
--
-- CHECK THE DUMP: if this function currently holds EXECUTE for anon or
-- authenticated, revoke it in a SEPARATE, deliberate change — an anon-callable
-- mass-downgrade function is its own incident, and bundling it here would make
-- this file's rollback ambiguous.

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- ALTERNATIVE BODY — use this if the guard says the live return type is not jsonb
-- =============================================================================
-- CREATE OR REPLACE cannot change a return type. If live returns void:
--
--   CREATE OR REPLACE FUNCTION public.downgrade_expired_subscriptions()
--   RETURNS void
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public, pg_temp
--   AS $alt$
--   DECLARE
--       v_count integer;
--   BEGIN
--       -- MANDATORY here too — see EDIT 2 in the header.
--       PERFORM set_config('doppler.reason', 'expiry sweep', true);
--       UPDATE public.accounts SET
--           subscription_tier       = 'free',
--           subscription_store      = NULL,
--           subscription_product_id = NULL,
--           updated_at              = NOW()
--       WHERE subscription_tier IS NOT NULL
--         AND subscription_tier <> 'free'
--         AND subscription_expires_at IS NOT NULL
--         AND subscription_expires_at < now() - interval '3 days';
--       GET DIAGNOSTICS v_count = ROW_COUNT;
--       RAISE LOG '[downgrade_expired_subscriptions] swept % rows', v_count;
--   END;
--   $alt$;
--
-- If live returns integer, the same body with RETURNS integer and
-- `RETURN v_count;`. In every variant the only functional change is the
-- deleted store predicate.
--
-- =============================================================================
-- VERIFY  (read-only)
-- =============================================================================
--
-- 1. The store predicate is gone:
--
--    SELECT pg_get_functiondef(p.oid) ILIKE '%subscription_store%IN%' AS still_filters_by_store,
--           pg_get_functiondef(p.oid)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='downgrade_expired_subscriptions';
--    -- read the body; the only subscription_store reference should be the
--    -- `= NULL` in the SET list, never one in the WHERE clause
--
-- 2. The cron entry is untouched and still points at the same name:
--
--    SELECT jobid, schedule, command, active FROM cron.job ORDER BY jobid;
--    -- expect: identical to what live/2026-09-06-subscription-rpcs.sql §4 recorded
--
-- 3. Nothing is left stuck. After the backfill has run this by hand:
--
--    SELECT count(*) FROM public.accounts
--    WHERE subscription_tier IS NOT NULL AND subscription_tier <> 'free'
--      AND subscription_expires_at IS NOT NULL
--      AND subscription_expires_at < now() - interval '3 days';
--    -- expect 0, and it should STAY 0 from then on
--
-- 4. The sweep is now attributable:
--
--    SELECT changed_at, account_id, old_tier, old_store, old_expires_at, reason
--    FROM public.subscription_audit
--    WHERE writer_fn = 'downgrade_expired_subscriptions'
--    ORDER BY changed_at DESC LIMIT 50;
--    -- every row should carry reason 'expiry sweep'
--
-- 5. Confirm the cron actually picked up the new body — six hours later:
--
--    SELECT jobid, status, return_message, start_time
--    FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   The widened sweep is NOT self-reversing: rows it downgrades stay
--   downgraded. Restore the function first, then repair the rows from the
--   audit trail.
--
--   BEGIN;
--     -- 1. Restore the pre-change body VERBATIM from
--     --    live/2026-09-06-subscription-rpcs.sql §2.4.
--     -- 2. Put back any rows this swept that should not have been:
--     --
--     --    SELECT account_id, old_tier, old_expires_at, old_store, changed_at
--     --    FROM public.subscription_audit
--     --    WHERE writer_fn = 'downgrade_expired_subscriptions'
--     --      AND reason = 'expiry sweep'
--     --      AND changed_at > '<the moment this migration was applied>'
--     --    ORDER BY changed_at;
--     --
--     --    UPDATE public.accounts a SET
--     --        subscription_tier       = s.old_tier,
--     --        subscription_store      = s.old_store,
--     --        subscription_expires_at = s.old_expires_at,
--     --        updated_at              = now()
--     --    FROM public.subscription_audit s
--     --    WHERE s.account_id = a.account_id
--     --      AND s.writer_fn = 'downgrade_expired_subscriptions'
--     --      AND s.changed_at > '<applied at>'
--     --      AND s.id = (SELECT max(id) FROM public.subscription_audit x
--     --                   WHERE x.account_id = a.account_id);
--     --    (set doppler.reason first, e.g.
--     --     SELECT set_config('doppler.reason','rollback of widened expiry sweep',true);)
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- =============================================================================
