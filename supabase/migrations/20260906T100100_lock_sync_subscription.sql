-- PROPOSAL — not yet applied; apply only after VPnReact/supabase/live/2026-09-06-subscription-rpcs.sql exists and the body below has been reconciled against the live dump
-- =============================================================================
-- 20260906T100100 — sync_subscription: deprecate the blind UPDATE
-- =============================================================================
--
-- WHAT sync_subscription IS TODAY
--   scripts/complete_account_migration.sql:118-156 — a SECURITY DEFINER
--   function granted EXECUTE to anon, authenticated and service_role, whose
--   entire body is:
--
--       UPDATE accounts SET subscription_tier = p_tier,
--                           subscription_expires_at = p_expires_at,
--                           revenuecat_synced_at = NOW(), updated_at = NOW()
--        WHERE account_id = p_account_id;
--
--   No ownership check. No entitlement check. No transaction id. No store. It
--   takes whatever tier and whatever expiry the caller names and writes them.
--   Because it is granted to anon, ANY holder of the public anon key — which
--   ships inside every client binary — can set any account to any tier with any
--   expiry, or to free with a NULL expiry.
--
-- WHY NOW
--   This is the shape of writer that produced the CKC4 downgrade: a paid
--   OxaPay customer whose row went to free while the store column still said
--   oxapay. Only a tier-only writer leaves that fingerprint, and there are
--   exactly two candidates — this function and claim_subscription's legacy
--   no-transaction-id branch. 20260906T100200 closes the other one.
--
-- WHAT THIS FILE DOES
--   Replaces the body with a stub that writes NOTHING and returns
--   {success:false, error:'deprecated'}, and removes the anon/authenticated
--   grants. service_role EXECUTE is kept for 30 days so that any server-side
--   caller nobody has found yet fails loudly in a log rather than silently at
--   a 404.
--
--   *** DROP THE FUNCTION ENTIRELY ON OR AFTER 2026-10-06. ***
--   The DROP statement is at the bottom of this file, commented out.
--
-- WHY A STUB RATHER THAN A DROP TODAY
--   PostgREST resolves an RPC by the set of argument NAMES sent. Dropping the
--   function turns every existing caller into PGRST202 with no server-side
--   trace of who called. The stub answers, is logged, and cannot write.
--
-- BLAST RADIUS
--   Any client still calling this stops being able to change its own
--   subscription. That is the point. Both mobile clients use
--   claim_subscription, not this. Before applying, check the live grant dump
--   (live/2026-09-06-subscription-rpcs.sql §3) and grep the four client repos:
--       grep -rn "sync_subscription" dopplerswift DopplerAndroid dopplerWindows landing
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Precondition: exactly one overload, and it is the signature we think it is
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE with a signature that differs from live does not replace
-- anything — it ADDS an overload, leaving the writable original callable and
-- making the stub dead code that reads as a fix. That failure is silent, which
-- is why this aborts instead.
DO $guard$
DECLARE
    v_n    integer;
    v_args text;
BEGIN
    SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_subscription';

    IF v_n = 0 THEN
        RAISE EXCEPTION
            'ABORT: public.sync_subscription does not exist live. Nothing to deprecate — do not create it.';
    END IF;

    IF v_n <> 1 THEN
        RAISE EXCEPTION
            'ABORT: public.sync_subscription has % overloads, expected exactly 1. Reconcile against live/2026-09-06-subscription-rpcs.sql §1 first.',
            v_n;
    END IF;

    SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_subscription';

    IF v_args IS DISTINCT FROM 'text, text, timestamp with time zone' THEN
        RAISE EXCEPTION
            'ABORT: public.sync_subscription identity args are (%), expected (text, text, timestamp with time zone).',
            v_args;
    END IF;

    RAISE NOTICE 'sync_subscription declared args live: %',
        (SELECT pg_get_function_arguments(p.oid)
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'sync_subscription');
END
$guard$;


-- -----------------------------------------------------------------------------
-- The stub
-- -----------------------------------------------------------------------------
-- RECONCILE: the argument NAMES below (p_account_id, p_tier, p_expires_at) come
-- from the repo copy. PostgREST dispatches on those names, so if the live
-- declared args differ — check the NOTICE the guard above prints, and §2.3 of
-- the live dump — change them here to match live EXACTLY or existing callers
-- will get PGRST202 instead of the deprecation answer.
CREATE OR REPLACE FUNCTION public.sync_subscription(
    p_account_id TEXT,
    p_tier       TEXT,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_ua text;
BEGIN
    -- Guarded: a stub that raises is worse than a stub that logs less. The GUC
    -- is only ever set by PostgREST, but a malformed value must not turn a
    -- deprecation answer into an exception.
    BEGIN
        v_ua := (nullif(current_setting('request.headers', true), '')::jsonb) ->> 'user-agent';
    EXCEPTION WHEN OTHERS THEN
        v_ua := NULL;
    END;

    -- Deliberately writes nothing. Logged so that a caller nobody has found
    -- shows up in the Postgres logs with enough context to identify it.
    RAISE LOG '[sync_subscription] DEPRECATED call refused: account=% tier=% expires=% role=% ua=%',
        p_account_id,
        p_tier,
        p_expires_at,
        coalesce(nullif(current_setting('role', true), 'none'), session_user::text),
        coalesce(v_ua, '(no request context)');

    RETURN jsonb_build_object(
        'success', false,
        'error',   'deprecated'
    );
END;
$fn$;

COMMENT ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) IS
    'DEPRECATED 2026-09-06 — non-writing stub. Was an anon-callable blind UPDATE of '
    'subscription_tier/subscription_expires_at with no ownership or entitlement check. '
    'Use claim_subscription (store purchases) or admin_grant_subscription (manual grants). '
    'DROP THIS FUNCTION ON OR AFTER 2026-10-06; the DROP is at the foot of '
    'supabase/migrations/20260906T100100_lock_sync_subscription.sql.';

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION *preserves* the existing ACL, so the anon grant
-- survives the body change and has to be revoked explicitly. PostgREST exposes
-- every EXECUTE-able function in the public schema.
REVOKE ALL ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;

-- Kept for 30 days only, so a forgotten server-side caller gets the logged
-- 'deprecated' answer instead of a PGRST202 nobody can trace.
GRANT EXECUTE ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- VERIFY  (read-only)
-- =============================================================================
--
-- 1. The stub is what is installed, and it contains no UPDATE:
--
--    SELECT pg_get_functiondef(p.oid) LIKE '%UPDATE%' AS still_writes,
--           pg_get_functiondef(p.oid)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='sync_subscription';
--    -- expect still_writes = f
--
-- 2. anon and authenticated no longer hold EXECUTE:
--
--    SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
--           a.privilege_type
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
--    WHERE n.nspname='public' AND p.proname='sync_subscription';
--    -- expect: the owner and service_role only
--
-- 3. It really cannot write. Pick a free test account; nothing should change.
--
--    SELECT public.sync_subscription('<SOME-FREE-TEST-ACCOUNT>', 'pro', now() + interval '30 days');
--    -- expect {"success": false, "error": "deprecated"}
--    SELECT subscription_tier, subscription_expires_at FROM public.accounts
--     WHERE account_id = '<SOME-FREE-TEST-ACCOUNT>';
--    -- expect unchanged, and ZERO new rows in subscription_audit for it
--
-- 4. Nobody is still calling it, 30 days on. In the Dashboard Logs Explorer:
--       search the Postgres logs for "[sync_subscription] DEPRECATED"
--    Zero hits over a full week is the green light for the DROP below.
--
-- =============================================================================
-- THE DROP — run this on or after 2026-10-06, not before
-- =============================================================================
--
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ);
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- =============================================================================
-- ROLLBACK (restores the writable original — think hard before running it)
-- =============================================================================
--
-- Do NOT reconstruct the body from this comment. Restore it from
-- live/2026-09-06-subscription-rpcs.sql §2.3, which is the dump of what was
-- actually running, and restore the grants from §3 of the same file. The repo
-- copy at scripts/complete_account_migration.sql:118-156 may itself be drifted.
--
-- =============================================================================
