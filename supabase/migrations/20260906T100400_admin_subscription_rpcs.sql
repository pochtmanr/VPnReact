-- PROPOSAL — not yet applied; apply only after VPnReact/supabase/live/2026-09-06-subscription-rpcs.sql exists and the body below has been reconciled against the live dump
-- =============================================================================
-- 20260906T100400 — admin_grant_subscription / admin_revoke_subscription
-- =============================================================================
--
-- WHY
--   The admin panel changes subscriptions with a raw PostgREST PATCH against
--   accounts (doppler-admin src/app/api/admin/accounts/[id]/route.ts:23-50).
--   Three consequences:
--
--   1. ABSOLUTE EXPIRY. It computes now() + duration_days and writes it. An
--      admin granting 30 days to a customer who already has 200 days left
--      SHORTENS them to 30. The web webhooks and /api/dev/grant-pro have always
--      stacked correctly; this one never has.
--
--   2. STORE OVERWRITTEN. It sets subscription_store = 'admin'
--      unconditionally, erasing app_store / play_store / revolut / oxapay. After
--      one goodwill grant, revoke_subscription can no longer tell what channel
--      the customer paid through — and neither can anyone reading the row.
--      This is the fingerprint on the CKC4 account: paid via OxaPay at 08:01,
--      store still 'oxapay' after the 11:44:41 downgrade, then store rewritten
--      by the 20:02 admin grant.
--
--   3. NO REASON, NO ACTOR. Nothing records which admin did it or why.
--
--   The panel cannot fix (1) or (2) on its own without re-implementing the
--   stacking rule in TypeScript — which is how the rule ends up implemented
--   three times and correct once. It belongs in one function.
--
-- WHAT THIS FILE INSTALLS
--   admin_grant_subscription(p_account_id, p_days, p_reason, p_actor)
--   admin_revoke_subscription(p_account_id, p_reason, p_actor)
--   Both service_role only. Both return before/after JSON so the panel can show
--   the operator what actually happened rather than re-fetching and guessing.
--
-- HANDOFF
--   supabase/docs/ADMIN-PANEL-HANDOFF.md describes exactly how the panel must
--   call these, and why any "sync from RevenueCat" button must do NOTHING when
--   RevenueCat reports no active entitlement.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Preconditions
-- -----------------------------------------------------------------------------
DO $guard$
DECLARE
    v_sig text;
BEGIN
    -- Neither name may already exist. admin_transfer_subscription DOES exist
    -- live (§6b) and these sit beside it; if somebody already added an
    -- admin_grant_subscription out of band, a CREATE OR REPLACE with a
    -- different argument list would silently add an overload and PostgREST
    -- would then dispatch on argument names to whichever matched.
    FOR v_sig IN
        SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('admin_grant_subscription', 'admin_revoke_subscription')
    LOOP
        RAISE EXCEPTION
            'ABORT: % already exists live. Reconcile against live/2026-09-06-subscription-rpcs.sql §1 before applying.',
            v_sig;
    END LOOP;

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
            'ABORT: apply 20260906T100000_subscription_audit.sql first — p_reason and p_actor would be written nowhere.';
    END IF;
END
$guard$;


-- =============================================================================
-- admin_grant_subscription — stacks, keeps the paid store, records who and why
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_grant_subscription(
    p_account_id TEXT,
    p_days       INTEGER,
    p_reason     TEXT,
    p_actor      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_key         TEXT;
    v_uuid        UUID;
    v_acct        TEXT;
    v_tier        TEXT;
    v_expires     TIMESTAMPTZ;
    v_store       TEXT;
    v_store_n     TEXT;
    v_entitled    BOOLEAN;
    v_start       TIMESTAMPTZ;
    v_new_expires TIMESTAMPTZ;
    v_new_store   TEXT;
    v_reason      TEXT;
BEGIN
    -- ---- validate arguments before touching anything -----------------------
    v_key := btrim(coalesce(p_account_id, ''));
    IF v_key = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_id_required');
    END IF;

    IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'invalid_days',
            'detail',  'p_days must be an integer between 1 and 3650',
            'given',   p_days
        );
    END IF;

    -- A grant with no stated reason is a grant nobody can explain later. This
    -- is the whole point of routing the panel through an RPC.
    v_reason := btrim(coalesce(p_reason, ''));
    IF v_reason = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    -- ---- resolve the account: VPN-XXXX-XXXX-XXXX or accounts.id (uuid) -----
    -- The panel holds the uuid (it PATCHes /api/admin/accounts/<uuid>);
    -- support tickets and the clients hold the VPN id. Accept both so neither
    -- caller has to look the other up first.
    IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_uuid := v_key::uuid;
        SELECT account_id, subscription_tier, subscription_expires_at, subscription_store
          INTO v_acct, v_tier, v_expires, v_store
        FROM accounts WHERE id = v_uuid FOR UPDATE;
    ELSE
        SELECT account_id, subscription_tier, subscription_expires_at, subscription_store
          INTO v_acct, v_tier, v_expires, v_store
        FROM accounts WHERE account_id = v_key FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_not_found',
                                  'account_id', p_account_id);
    END IF;

    -- ---- stack, do not overwrite -------------------------------------------
    v_entitled := v_tier IS NOT NULL AND v_tier <> 'free'
              AND v_expires IS NOT NULL AND v_expires > now();

    -- The idiom the web webhooks and /api/dev/grant-pro already share:
    --   start = current expiry if it is in the future, else now
    v_start       := CASE WHEN v_entitled THEN v_expires ELSE now() END;
    v_new_expires := v_start + make_interval(days => p_days);

    -- ---- keep the paid store on record -------------------------------------
    -- Overwriting app_store/play_store with 'admin' would make
    -- revoke_subscription skip this account forever (it revokes store
    -- subscriptions only), so a later genuine refund would never land.
    -- Overwriting revolut/oxapay would erase the customer's actual payment
    -- channel. 'admin' is written only when there is nothing worth keeping.
    v_store_n := public.subscription_normalize_store(v_store);
    IF v_store_n IN ('app_store', 'play_store', 'stripe', 'paddle', 'revolut', 'oxapay') THEN
        v_new_store := v_store;   -- the ORIGINAL spelling, not the normalised one
    ELSE
        v_new_store := 'admin';
    END IF;

    PERFORM set_config('doppler.reason', v_reason, true);
    PERFORM set_config('doppler.actor',
                       coalesce(nullif(btrim(coalesce(p_actor, '')), ''), '(unattributed admin)'),
                       true);

    UPDATE accounts SET
        subscription_tier       = 'pro',
        subscription_expires_at = v_new_expires,
        subscription_store      = v_new_store,
        updated_at              = NOW()
    WHERE account_id = v_acct;

    -- Ownership columns (original_transaction_id, subscription_product_id,
    -- subscription_claimed_at) are deliberately untouched: an admin grant does
    -- not create or transfer a store purchase.

    RETURN jsonb_build_object(
        'success', true,
        'action',  'granted',
        'account_id', v_acct,
        'days',    p_days,
        'reason',  v_reason,
        'actor',   p_actor,
        'stacked', v_entitled,     -- true = extended a live term rather than starting a new one
        'before', jsonb_build_object(
            'tier',       v_tier,
            'expires_at', v_expires,
            'store',      v_store
        ),
        'after', jsonb_build_object(
            'tier',       'pro',
            'expires_at', v_new_expires,
            'store',      v_new_store
        )
    );
END;
$fn$;

COMMENT ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) IS
    'Manual Pro grant. Accepts a VPN account id or an accounts.id uuid. STACKS on an active '
    'term (start = max(now, current expiry)) instead of overwriting it, keeps an existing paid '
    'store on record and writes ''admin'' only when there is none, and records reason/actor '
    'into subscription_audit. Returns before/after. service_role only.';

REVOKE ALL ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) TO service_role;


-- =============================================================================
-- admin_revoke_subscription — sets free, clamps expiry, keeps ownership
-- =============================================================================
-- Distinct from revoke_subscription (20260906T100300) on purpose:
--   revoke_subscription  = the STORE said this ended. Refuses non-store rows,
--                          clears ownership, is called by the webhook.
--   admin_revoke_...     = a HUMAN decided this ends. Applies to any store,
--                          KEEPS the ownership columns, is called by the panel.
-- Keeping original_transaction_id matters: if an admin downgrades someone by
-- mistake, the ownership row and the transaction id are what make it
-- recoverable, and verify_restore keeps working for that customer.
CREATE OR REPLACE FUNCTION public.admin_revoke_subscription(
    p_account_id TEXT,
    p_reason     TEXT,
    p_actor      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_key     TEXT;
    v_acct    TEXT;
    v_tier    TEXT;
    v_expires TIMESTAMPTZ;
    v_store   TEXT;
    v_new_exp TIMESTAMPTZ;
    v_reason  TEXT;
BEGIN
    v_key := btrim(coalesce(p_account_id, ''));
    IF v_key = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_id_required');
    END IF;

    v_reason := btrim(coalesce(p_reason, ''));
    IF v_reason = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT account_id, subscription_tier, subscription_expires_at, subscription_store
          INTO v_acct, v_tier, v_expires, v_store
        FROM accounts WHERE id = v_key::uuid FOR UPDATE;
    ELSE
        SELECT account_id, subscription_tier, subscription_expires_at, subscription_store
          INTO v_acct, v_tier, v_expires, v_store
        FROM accounts WHERE account_id = v_key FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_not_found',
                                  'account_id', p_account_id);
    END IF;

    -- LEAST ignores NULLs, so a row with no expiry gets now(), never NULL.
    -- The panel's raw PATCH nulls this column; that is what destroys the
    -- record of what the customer had bought.
    v_new_exp := LEAST(v_expires, now());

    PERFORM set_config('doppler.reason', v_reason, true);
    PERFORM set_config('doppler.actor',
                       coalesce(nullif(btrim(coalesce(p_actor, '')), ''), '(unattributed admin)'),
                       true);

    UPDATE accounts SET
        subscription_tier       = 'free',
        subscription_expires_at = v_new_exp,
        updated_at              = NOW()
    WHERE account_id = v_acct;

    -- subscription_store, original_transaction_id, subscription_product_id and
    -- subscription_claimed_at are all KEPT. See the header.

    RETURN jsonb_build_object(
        'success', true,
        'action',  'revoked',
        'account_id', v_acct,
        'reason',  v_reason,
        'actor',   p_actor,
        'before', jsonb_build_object(
            'tier',       v_tier,
            'expires_at', v_expires,
            'store',      v_store
        ),
        'after', jsonb_build_object(
            'tier',       'free',
            'expires_at', v_new_exp,
            'store',      v_store
        )
    );
END;
$fn$;

COMMENT ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) IS
    'Manual downgrade. Sets tier=free and clamps expires_at with LEAST(expires_at, now()) — '
    'never NULL — and KEEPS subscription_store and the ownership columns so the action stays '
    'reversible and verify_restore keeps working. Records reason/actor. service_role only.';

REVOKE ALL ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- VERIFY  (read-only unless noted)
-- =============================================================================
--
-- 1. Both exist once, service_role only:
--
--    SELECT p.proname, pg_get_function_arguments(p.oid) AS args,
--           CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    LEFT JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a ON true
--    WHERE n.nspname='public' AND p.proname LIKE 'admin_%_subscription'
--    ORDER BY p.proname;
--    -- expect: owner + service_role only. NO anon, NO authenticated.
--
-- 2. Validation, all four of which write nothing:
--
--    SELECT public.admin_grant_subscription('VPN-DOES-NOT-EXIST', 30, 'x');
--    -- {"success":false,"error":"account_not_found"}
--    SELECT public.admin_grant_subscription('<TEST>', 0,    'x');
--    -- {"success":false,"error":"invalid_days"}
--    SELECT public.admin_grant_subscription('<TEST>', 4000, 'x');
--    -- {"success":false,"error":"invalid_days"}
--    SELECT public.admin_grant_subscription('<TEST>', 30,   '   ');
--    -- {"success":false,"error":"reason_required"}
--
-- 3. THE ONE THAT MATTERS — stacking. On an account with ~200 days left:
--
--    SELECT public.admin_grant_subscription('<TEST>', 30, 'verify stacking', 'you@example.com');
--    -- expect stacked = true and after.expires_at ≈ before.expires_at + 30 days.
--    -- Under the old panel PATCH this account would now have 30 days total.
--
-- 4. The paid store survives a grant:
--
--    -- on an account with subscription_store='oxapay':
--    SELECT public.admin_grant_subscription('<OXAPAY-TEST>', 7, 'goodwill', 'you@example.com');
--    -- expect after.store = 'oxapay', NOT 'admin'
--
-- 5. Reason and actor reach the audit trail:
--
--    SELECT writer_fn, reason, actor, old_expires_at, new_expires_at, jwt_role
--    FROM public.subscription_audit ORDER BY id DESC LIMIT 1;
--    -- expect writer_fn 'admin_grant_subscription', the reason string, the actor email
--
-- 6. Revoke keeps ownership:
--
--    SELECT public.admin_revoke_subscription('<TEST>', 'verify revoke', 'you@example.com');
--    SELECT subscription_tier, subscription_expires_at, subscription_store,
--           original_transaction_id, subscription_claimed_at
--    FROM public.accounts WHERE account_id='<TEST>';
--    -- expect free, expires_at ≈ now() (NOT NULL), store and txn intact
--
-- 7. Uuid and VPN-id both resolve to the same account:
--
--    SELECT (public.admin_grant_subscription(id::text, 1, 'uuid form', 'verify') ->> 'account_id')
--             = account_id AS resolves_the_same
--    FROM public.accounts WHERE account_id = '<TEST>';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   Roll back the doppler-admin deploy first, or its grant and set-free actions
--   get PGRST202 with no fallback.
--
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT);
--     DROP FUNCTION IF EXISTS public.admin_revoke_subscription(TEXT, TEXT, TEXT);
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
--   Nothing else references either function, and neither has ever been the only
--   writer of anything: the raw PATCH still works if the panel is rolled back.
--
--   To undo a specific grant rather than the migration, read the before/after
--   out of subscription_audit and restore it:
--
--     SELECT account_id, old_tier, old_expires_at, old_store, reason, actor, changed_at
--     FROM public.subscription_audit
--     WHERE writer_fn IN ('admin_grant_subscription','admin_revoke_subscription')
--     ORDER BY changed_at DESC LIMIT 20;
--
-- =============================================================================
