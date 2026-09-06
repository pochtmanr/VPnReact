-- PROPOSAL — not yet applied; apply only after VPnReact/supabase/live/2026-09-06-subscription-rpcs.sql exists and the body below has been reconciled against the live dump
-- =============================================================================
-- 20260906T100300 — revoke_subscription: stop it firing at the wrong account
-- =============================================================================
--
-- WHAT IT IS TODAY
--   revoke_subscription(p_account_id text) — repo copy at
--   migrations/20260102_subscription_ownership.sql:279-317. It takes one
--   argument, asks no questions, and unconditionally sets tier='free',
--   expires_at=NULL, and nulls store, transaction id, product id and claimed_at.
--
-- WHY THAT IS DANGEROUS
--   The RevenueCat webhook calls it BLIND on EXPIRATION and on
--   CANCELLATION/CUSTOMER_SUPPORT, with p_account_id = whatever
--   resolveAccountId() returned from the event. Three failure modes follow:
--
--   1. WRONG ACCOUNT. RENEWAL already resolves the real owner via
--      get_subscription_owner (index.ts:150-153) because the RC app_user_id and
--      the account that owns the transaction routinely differ after a transfer.
--      EXPIRATION does not. So an expiry can revoke an account that never held
--      that subscription.
--
--   2. WRONG CHANNEL. An account whose Pro came from revolut, oxapay or an
--      admin grant is revoked just as happily as an App Store one. A store
--      expiry says nothing about a web purchase, and the web purchase is not
--      refunded by it.
--
--   3. EXPIRY ERASED. expires_at=NULL destroys the record of what the customer
--      had bought. Support then cannot answer "until when was I Pro?", and the
--      backfill in 20260906T100600 has nothing to reason from.
--
-- WHAT THIS FILE DOES
--   DROPs the 1-arg function and CREATEs a 3-arg one IN THE SAME TRANSACTION,
--   so there is no window in which the function does not exist. It:
--     * skips (success:true, action:'skipped') unless the account's store
--       normalises to app_store or play_store
--     * skips when p_original_transaction_id is supplied and does not match the
--       transaction on the row
--     * on revoke, clamps expires_at with LEAST(expires_at, now()) — never NULL
--     * stamps doppler.reason so the audit row says why
--
-- POSTGREST NOTE — the ordering trap, in the safe direction
--   PostgREST resolves an RPC by the SET OF ARGUMENT NAMES SENT. The two new
--   arguments are DEFAULTed, so an existing caller sending only
--   {p_account_id} still resolves. This is the server-adds-it-defaulted step of
--   the correct sequence (§8): server first, clients after. Deploying the
--   revenuecat-webhook change BEFORE this migration would send
--   {p_account_id, p_original_transaction_id, p_reason} at a 1-arg function and
--   every revoke would fail with PGRST202 — which is why
--   landing/supabase/functions/revenuecat-webhook/DEPLOY.md says to apply this
--   migration first, and says it in bold.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Preconditions
-- -----------------------------------------------------------------------------
DO $guard$
DECLARE
    v_n    integer;
    v_args text;
BEGIN
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'revoke_subscription';

    IF v_n <> 1 THEN
        RAISE EXCEPTION
            'ABORT: public.revoke_subscription has % overloads, expected exactly 1. See live/2026-09-06-subscription-rpcs.sql §1. A DROP of the wrong overload is not recoverable from this file.',
            v_n;
    END IF;

    SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'revoke_subscription';

    IF v_args IS DISTINCT FROM 'text' THEN
        RAISE EXCEPTION
            'ABORT: revoke_subscription identity args are (%), expected (text). The DROP below names (text) and would either fail or drop something else.',
            v_args;
    END IF;

    RAISE NOTICE 'revoke_subscription declared args live: %',
        (SELECT pg_get_function_arguments(p.oid)
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'revoke_subscription');

    -- The store normaliser comes from 20260906T100200 and this body calls it.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'subscription_normalize_store'
    ) THEN
        RAISE EXCEPTION
            'ABORT: apply 20260906T100200_claim_subscription_guards.sql first — public.subscription_normalize_store(text) is missing.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.accounts'::regclass
          AND NOT tgisinternal
          AND tgname = 'trg_accounts_subscription_audit_upd'
    ) THEN
        RAISE EXCEPTION
            'ABORT: apply 20260906T100000_subscription_audit.sql first.';
    END IF;
END
$guard$;


-- -----------------------------------------------------------------------------
-- Replace the function
-- -----------------------------------------------------------------------------
-- DROP + CREATE rather than CREATE OR REPLACE, because the argument list
-- changes and CREATE OR REPLACE with a different argument list creates a
-- SECOND function instead of replacing the first. Both statements are inside
-- the single transaction opened at the top of this file: either the new
-- 3-argument function exists or the old 1-argument one still does. There is no
-- state in which revoke_subscription is missing.
DROP FUNCTION IF EXISTS public.revoke_subscription(TEXT);

CREATE FUNCTION public.revoke_subscription(
    p_account_id              TEXT,
    p_original_transaction_id TEXT DEFAULT NULL,
    p_reason                  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tier    TEXT;
    v_expires TIMESTAMPTZ;
    v_store   TEXT;
    v_store_n TEXT;
    v_txn     TEXT;
    v_new_exp TIMESTAMPTZ;
BEGIN
    -- FOR UPDATE: an EXPIRATION and a RENEWAL for the same account can arrive
    -- within milliseconds of each other, and "renew then revoke" versus
    -- "revoke then renew" are different outcomes for a paying customer.
    SELECT subscription_tier, subscription_expires_at, subscription_store,
           original_transaction_id
      INTO v_tier, v_expires, v_store, v_txn
    FROM accounts
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'account_not_found',
            'account_id', p_account_id
        );
    END IF;

    v_store_n := public.subscription_normalize_store(v_store);

    -- GUARD 1 — channel.
    -- A store expiry or refund speaks only for a store subscription. revolut,
    -- oxapay, admin, dev-grant and NULL are all outside its authority. Note
    -- that skipping returns success:true: the webhook must treat this as a
    -- handled event and stop retrying, not as a failure.
    IF v_store_n IS NULL OR v_store_n NOT IN ('app_store', 'play_store') THEN
        RAISE LOG '[revoke_subscription] skipped account=% store=% reason=store_not_revocable',
            p_account_id, v_store;
        RETURN jsonb_build_object(
            'success',    true,
            'action',     'skipped',
            'reason',     'store_not_revocable',
            'account_id', p_account_id,
            'store',      v_store,
            'tier',       v_tier,
            'expires_at', v_expires
        );
    END IF;

    -- GUARD 2 — identity.
    -- If the caller names a transaction, it must be THIS row's transaction.
    -- A NULL on the row counts as a mismatch: an account with no recorded
    -- transaction cannot be shown to be the one this event is about, and the
    -- expiry sweeper (20260906T100500) will collect it on its own three days
    -- after it genuinely lapses. Refusing here costs at most a 3-day grace;
    -- guessing costs a paying customer their access.
    IF p_original_transaction_id IS NOT NULL
       AND btrim(p_original_transaction_id) <> ''
       AND v_txn IS DISTINCT FROM p_original_transaction_id THEN
        RAISE LOG '[revoke_subscription] skipped account=% row_txn=% event_txn=% reason=transaction_mismatch',
            p_account_id, v_txn, p_original_transaction_id;
        RETURN jsonb_build_object(
            'success',              true,
            'action',               'skipped',
            'reason',               'transaction_mismatch',
            'account_id',           p_account_id,
            'account_transaction_id', v_txn,
            'event_transaction_id', p_original_transaction_id,
            'tier',                 v_tier,
            'expires_at',           v_expires
        );
    END IF;

    -- LEAST ignores NULLs, so a row with no expiry gets now() rather than NULL.
    -- The column must never go back to NULL: it is the only record of what the
    -- customer had bought, and support answers "until when was I Pro?" from it.
    v_new_exp := LEAST(v_expires, now());

    -- Stamped before the UPDATE so the audit trigger picks it up. set_config
    -- with is_local => true scopes it to this transaction.
    PERFORM set_config(
        'doppler.reason',
        coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'revoke_subscription'),
        true
    );

    UPDATE accounts SET
        subscription_tier       = 'free',
        subscription_expires_at = v_new_exp,
        subscription_store      = NULL,
        original_transaction_id = NULL,
        subscription_product_id = NULL,
        subscription_claimed_at = NULL,
        revenuecat_synced_at    = NOW(),
        updated_at              = NOW()
    WHERE account_id = p_account_id;

    -- Unchanged from the repo copy: the subscription_ownership row is NOT
    -- deleted. It is the audit trail, and the next claim updates current_owner
    -- in place.

    RETURN jsonb_build_object(
        'success',             true,
        'action',              'revoked',
        'account_id',          p_account_id,
        'revoked_from',        p_account_id,   -- back-compat: the old body returned this key
        'transaction_id',      v_txn,          -- back-compat: ditto
        'store',               v_store,
        'previous_tier',       v_tier,
        'previous_expires_at', v_expires,
        'expires_at',          v_new_exp,
        'reason',              p_reason
    );
END;
$fn$;

COMMENT ON FUNCTION public.revoke_subscription(TEXT, TEXT, TEXT) IS
    'Revokes a STORE subscription only. Skips (success:true, action:''skipped'') when the '
    'account''s store is not app_store/play_store after normalisation, or when '
    'p_original_transaction_id is supplied and differs from the row''s. Clamps expires_at '
    'with LEAST(expires_at, now()) — never NULL. service_role only.';

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- A fresh CREATE, so the ACL starts at the default — which for a function is
-- EXECUTE TO PUBLIC. That default is exactly the hazard: PostgREST exposes
-- every EXECUTE-able function in the public schema, so leaving it would make
-- revoke_subscription callable with the anon key that ships in every client
-- binary. Revoke first, then grant the one role that needs it.
REVOKE ALL ON FUNCTION public.revoke_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_subscription(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_subscription(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_subscription(TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- VERIFY  (read-only unless noted)
-- =============================================================================
--
-- 1. Exactly one revoke_subscription, with three arguments, service_role only:
--
--    SELECT pg_get_function_arguments(p.oid) AS args,
--           CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    LEFT JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a ON true
--    WHERE n.nspname='public' AND p.proname='revoke_subscription';
--    -- expect one args value, grantees = owner + service_role only
--
-- 2. The old 1-arg call shape still resolves (defaults do their job):
--
--    SELECT public.revoke_subscription('<SOME-FREE-TEST-ACCOUNT>');
--    -- expect {"success":true,"action":"skipped","reason":"store_not_revocable"}
--
-- 3. It refuses to touch a web-checkout account. Pick one of the stuck
--    revolut/oxapay pro rows from live/2026-09-06-subscription-rpcs.sql §7:
--
--    SELECT public.revoke_subscription('<REVOLUT-PRO-ACCOUNT>', NULL, 'verify');
--    -- expect action 'skipped', reason 'store_not_revocable'
--    -- and ZERO new subscription_audit rows for that account
--
-- 4. It refuses a transaction that is not the row's:
--
--    SELECT public.revoke_subscription('<STORE-PRO-ACCOUNT>', 'not-the-right-txn', 'verify');
--    -- expect action 'skipped', reason 'transaction_mismatch'
--
-- 5. It revokes when everything lines up, and does NOT null the expiry.
--    Use a disposable account: store app_store, a real txn, future expiry.
--
--    BEGIN;
--      SELECT public.revoke_subscription('<TEST>', '<ITS-TXN>', 'verify revoke');
--      SELECT subscription_tier, subscription_expires_at, subscription_store
--        FROM public.accounts WHERE account_id='<TEST>';
--      -- expect free, expires_at ~= now() (NOT NULL), store NULL
--      SELECT writer_fn, reason, old_expires_at, new_expires_at
--        FROM public.subscription_audit WHERE account_id='<TEST>'
--        ORDER BY id DESC LIMIT 1;
--      -- expect writer_fn 'revoke_subscription', reason 'verify revoke'
--    ROLLBACK;
--
-- 6. After the webhook change ships, how often the guards actually fire —
--    in the Dashboard Logs Explorer, search the Postgres logs for
--    "[revoke_subscription] skipped". Every hit is a revoke that would have
--    been wrong under the old function.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   Roll back the revenuecat-webhook deploy FIRST. The deployed function sends
--   {p_account_id, p_original_transaction_id, p_reason}; against the restored
--   1-arg function that is PGRST202 and every revoke fails.
--
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.revoke_subscription(TEXT, TEXT, TEXT);
--     -- Recreate the 1-arg original from live/2026-09-06-subscription-rpcs.sql
--     -- §2.2 — paste the dump verbatim, do NOT retype it from the repo copy at
--     -- migrations/20260102_subscription_ownership.sql:279-317, which may be
--     -- drifted. Then restore its grants from §3 of the same file
--     -- (expected: service_role only).
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- =============================================================================
