-- =============================================================================
-- 20260910T090000 — the admin panel's four subscription verbs, standalone
-- =============================================================================
--
-- WHY
--   The panel already calls admin_grant_subscription and
--   admin_revoke_subscription (doppler-admin
--   src/app/api/admin/accounts/[id]/route.ts:61 and :94). Neither exists live,
--   so every Pro/Free click in the Accounts tab comes back as PGRST202:
--
--     Could not find the function public.admin_revoke_subscription(
--       p_account_id, p_actor, p_reason) in the schema cache
--
--   Their only definition is 20260906T100400_admin_subscription_rpcs.sql, one
--   of seven "PROPOSAL — not yet applied" files gated behind a live dump
--   (supabase/live/2026-09-06-subscription-rpcs.sql) that is still a
--   placeholder. That file cannot be applied on its own either: its guard
--   aborts unless subscription_normalize_store (unapplied 20260906T100200) and
--   trigger trg_accounts_subscription_audit_upd (unapplied 20260906T100000)
--   already exist. supabase/docs/ADMIN-PANEL-HANDOFF.md §7 predicted exactly
--   this failure and this is it.
--
--   Second, unrelated-looking but the same root: the panel cannot touch a
--   web-checkout customer at all. admin_set_subscription_expiry (20260908T174000,
--   applied) refuses any store outside admin/dev-grant with 'admin_grant_only',
--   so Revolut and OxaPay subscribers — who pay us directly — are the ones
--   support cannot help.
--
-- WHAT
--   This file is standalone by construction, the same way 20260908T174000 is:
--   it depends on nothing in the blocked batch. It installs
--
--     admin_grant_subscription(p_account_id, p_days, p_reason, p_actor)
--     admin_revoke_subscription(p_account_id, p_reason, p_actor)
--     admin_set_subscription_store(p_account_id, p_store, p_reason, p_actor)
--
--   and REPLACES admin_set_subscription_expiry with the same signature and the
--   same argument names, minus the admin_grant_only refusal.
--
--   Bodies for grant and revoke are lifted from 20260906T100400 with one edit:
--   its call to public.subscription_normalize_store() is inlined, because that
--   function ships in the unapplied 20260906T100200. The CASE is copied from
--   20260906T100200:178-195 verbatim, including '' -> NULL and the
--   ELSE lower(btrim(...)) pass-through that never promotes an unknown value
--   into a store name.
--
--   All four stamp doppler.reason / doppler.actor with set_config(..., true).
--   Nothing reads those today; subscription_audit (20260906T100000) does when
--   it lands, and stamping now costs nothing and means no later edit.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--   It does not create public.subscription_normalize_store(text). That function
--   belongs to the unapplied 20260906T100200, and creating it here would
--   silently PRE-SATISFY the precondition guards in 20260906T100200 and
--   20260906T100400 — letting somebody apply that batch against a database that
--   was never reconciled against the live dump. The CASE is inlined instead, in
--   each function that needs it, marked where it appears.
--
--   It does not touch the subscription_store CHECK. The committed constraint
--   (20260102_subscription_ownership.sql:18) permits only
--   app_store|play_store|stripe|NULL, yet production rows hold revolut, oxapay,
--   admin, dev-grant and paddle. That constraint is therefore already relaxed
--   or dropped, and the argument is a proof rather than an inference: Postgres
--   re-evaluates EVERY CHECK on a row for ANY update of that row, not only for
--   the columns being written. If the tight CHECK were live, the old panel
--   PATCH against an oxapay account would have been failing with 23514 for
--   months — and so would any update that merely touched updated_at. It has not.
--
--   Widening it anyway would mean DDL on accounts: a lock, a constraint that
--   has to be NOT VALID (the leaked ios/android/macos/windows values would fail
--   validation), and a half-run paste in the Dashboard SQL Editor holding
--   ACCESS EXCLUSIVE on accounts until the session ends. That is real risk
--   bought to fix a constraint the evidence says is not there. So both
--   functions that write the column — admin_grant_subscription (it writes
--   'admin') and admin_set_subscription_store — TRAP check_violation instead
--   and return store_rejected_by_check with the constraint named. Nothing is
--   written when they do. VERIFY section 6 settles the question read-only, if
--   you ever want the answer rather than the guard.
--
-- APPLY
--   Supabase Dashboard SQL Editor, project fzlrhmjdjjzcgstaeblu. The CLI on
--   this machine is authenticated to a different org and the Management API
--   returns 403 (supabase/live/README.md).
--
--   Apply this BEFORE deploying the panel that uses it. Backwards, the new
--   buttons get PGRST202 — which is how the bug at the top of this file was
--   created in the first place.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Preconditions — the overload trap
-- -----------------------------------------------------------------------------
-- PostgREST resolves an RPC by the SET OF ARGUMENT NAMES sent. A
-- CREATE OR REPLACE whose signature differs from what is live does not replace
-- anything: it ADDS AN OVERLOAD, leaving the old function callable while the
-- migration history reads as though the fix landed. The failure is silent,
-- which is the only reason it is worth aborting over.
--
-- This is deliberately laxer than 20260906T100400:47-85, which aborts if the
-- name exists at all. That is right for a first install and wrong for a
-- re-run: three of these four names should be absent, and the fourth
-- (admin_set_subscription_expiry) must already exist exactly once. What is
-- never acceptable is a same-named function whose identity arguments differ.
--
-- It also checks two things a CREATE OR REPLACE cannot do at all, rather than
-- letting them fail half-way through the file: rename an input parameter, and
-- change a return type. Both are hard errors, and both are more likely here
-- than the overload case, because argument NAMES are what PostgREST dispatches
-- on and are therefore what somebody would have been tempted to "fix" live.
DO $guard$
DECLARE
    r          record;
    v_expected regprocedure;
    v_bad      text;
    v_names    text[];
    v_ret      oid;
BEGIN
    IF to_regclass('public.accounts') IS NULL THEN
        RAISE EXCEPTION 'ABORT: public.accounts does not exist.';
    END IF;

    FOR r IN
        SELECT * FROM (VALUES
            ('admin_grant_subscription',
             'text, integer, text, text',
             ARRAY['p_account_id','p_days','p_reason','p_actor']),
            ('admin_revoke_subscription',
             'text, text, text',
             ARRAY['p_account_id','p_reason','p_actor']),
            ('admin_set_subscription_expiry',
             'text, text, text, timestamptz, integer',
             ARRAY['p_account_id','p_reason','p_actor','p_expires_at','p_days']),
            ('admin_set_subscription_store',
             'text, text, text, text',
             ARRAY['p_account_id','p_store','p_reason','p_actor'])
        ) AS v(fname, argtypes, argnames)
    LOOP
        -- to_regprocedure returns NULL for an absent function instead of raising,
        -- so the same expression covers "not there yet" and "already there".
        v_expected := to_regprocedure('public.' || r.fname || '(' || r.argtypes || ')');

        -- Any row with this name that is NOT the expected one is an overload.
        SELECT string_agg(
                   format('  %I.%I(%s) RETURNS %s',
                          n.nspname, p.proname,
                          pg_get_function_arguments(p.oid),
                          pg_get_function_result(p.oid)),
                   E'\n')
          INTO v_bad
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = r.fname
          AND (v_expected IS NULL OR p.oid <> v_expected::oid);

        IF v_bad IS NOT NULL THEN
            RAISE EXCEPTION E'ABORT: public.% already exists with a DIFFERENT argument list:\n%\nCREATE OR REPLACE would ADD an overload rather than replace it, and PostgREST would dispatch on argument names to whichever matched. Dump it with pg_get_functiondef, decide which one the panel calls, DROP the other, then re-run this file.',
                r.fname, v_bad;
        END IF;

        IF v_expected IS NOT NULL THEN
            SELECT p.proargnames, p.prorettype
              INTO v_names, v_ret
            FROM pg_proc p WHERE p.oid = v_expected::oid;

            -- CREATE OR REPLACE cannot rename an input parameter or change a
            -- return type; both are hard errors half-way through the file.
            -- Better to abort here, with the thing to do about it.
            IF v_names IS DISTINCT FROM r.argnames THEN
                RAISE EXCEPTION 'ABORT: public.% exists with the expected types but argument names %; expected %. CREATE OR REPLACE cannot rename an input parameter — DROP it first (and fix the caller).',
                    r.fname, v_names, r.argnames;
            END IF;

            IF v_ret <> 'jsonb'::regtype::oid THEN
                RAISE EXCEPTION 'ABORT: public.% exists RETURNS %; expected jsonb. CREATE OR REPLACE cannot change a return type — DROP it first.',
                    r.fname, format_type(v_ret, NULL);
            END IF;
        END IF;
    END LOOP;

    IF to_regprocedure('public.admin_set_subscription_expiry(text, text, text, timestamptz, integer)') IS NULL THEN
        RAISE NOTICE 'admin_set_subscription_expiry did not exist; this file installs it fresh rather than replacing 20260908T174000.';
    END IF;
END
$guard$;


-- =============================================================================
-- admin_grant_subscription — stacks, keeps the paid store, records who and why
-- =============================================================================
-- Body from 20260906T100400:91-227. The only edit is the inlined store
-- normalisation, marked below.
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
    --
    -- INLINED from 20260906T100200:178-195 (subscription_normalize_store),
    -- which ships in the blocked batch. Same CASE, same semantics: '' folds to
    -- NULL and an unrecognised value passes through lower-cased rather than
    -- being promoted to a store name.
    v_store_n := CASE lower(btrim(coalesce(v_store, '')))
        WHEN ''              THEN NULL
        WHEN 'ios'           THEN 'app_store'
        WHEN 'macos'         THEN 'app_store'
        WHEN 'mac_app_store' THEN 'app_store'
        WHEN 'app_store'     THEN 'app_store'
        WHEN 'android'       THEN 'play_store'
        WHEN 'play_store'    THEN 'play_store'
        ELSE lower(btrim(v_store))
    END;

    IF v_store_n IN ('app_store', 'play_store', 'stripe', 'paddle', 'revolut', 'oxapay') THEN
        v_new_store := v_store;   -- the ORIGINAL spelling, not the normalised one
    ELSE
        v_new_store := 'admin';
    END IF;

    PERFORM set_config('doppler.reason', v_reason, true);
    PERFORM set_config('doppler.actor',
                       coalesce(nullif(btrim(coalesce(p_actor, '')), ''), '(unattributed admin)'),
                       true);

    -- This is the one function here that WRITES subscription_store, and 'admin'
    -- is a value the committed CHECK (20260102_subscription_ownership.sql:18)
    -- forbids. See the header for why that CHECK is believed dead; the trap is
    -- here so that a belief is not load-bearing. Refuse in the RESULT, the way
    -- every other refusal in this file does — the panel checks data.success,
    -- and a raw 23514 out of PostgREST would surface to the operator as a 500
    -- with no idea what to do about it.
    BEGIN
        UPDATE accounts SET
            subscription_tier       = 'pro',
            subscription_expires_at = v_new_expires,
            subscription_store      = v_new_store,
            updated_at              = NOW()
        WHERE account_id = v_acct;
    EXCEPTION WHEN check_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'store_rejected_by_check',
            'detail',  'A CHECK constraint on public.accounts rejected this write and NOTHING was changed. Run VERIFY section 6 of 20260910T090000 to see the constraint.',
            'account_id', v_acct,
            'attempted_store', v_new_store,
            'constraint', SQLERRM
        );
    END;

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
        'store_managed', coalesce(v_store_n IN ('app_store', 'play_store'), false),
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
    'store on record and writes ''admin'' only when there is none, and stamps reason/actor for '
    'subscription_audit. Returns before/after. service_role only.';

REVOKE ALL ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT) TO service_role;


-- =============================================================================
-- admin_revoke_subscription — sets free, clamps expiry, keeps ownership
-- =============================================================================
-- Verbatim from 20260906T100400:241-332. Distinct from revoke_subscription on
-- purpose:
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
    -- The panel's old raw PATCH nulled this column; that is what destroys the
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
    'reversible and verify_restore keeps working. Stamps reason/actor. service_role only.';

REVOKE ALL ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_subscription(TEXT, TEXT, TEXT) TO service_role;


-- =============================================================================
-- admin_set_subscription_expiry — REPLACES 20260908T174000, minus the gate
-- =============================================================================
-- Signature and argument NAMES are unchanged, because PostgREST dispatches on
-- the set of argument names sent and the panel already calls this
-- (doppler-admin src/app/api/admin/subscriptions/route.ts:219). Changing a name
-- here would give every existing caller PGRST202.
--
-- What changes: the admin_grant_only refusal (20260908T174000:84-91) is gone.
-- It was written when the only editable rows were admin grants; the effect in
-- the field is that a Revolut or OxaPay customer — someone who paid us
-- directly, with no store to arbitrate — is the one customer support cannot
-- extend. An operator with the service-role key is trusted to write these
-- columns; the guard was never protecting the database from them.
--
-- What replaces it is a FLAG, not a refusal: store_managed is true when the
-- normalised store is app_store or play_store. Those are the only rows where
-- something else is authoritative — RevenueCat re-syncs them, so an edit here
-- can be overwritten at the next renewal event. The panel shows that as a
-- warning and leaves the controls enabled.
--
-- Two things deliberately kept:
--   * tier is still written as 'pro', unconditionally. The server's entitlement
--     rule (get_servers_v2) is tier <> 'free' AND expires_at > now(); setting a
--     future expiry while leaving tier 'free' would produce a row that looks
--     entitled in the panel and is refused every credential — the Windows
--     "PRO badge, eight servers that all refuse to connect" dead end.
--
--     Unconditionally, and not "preserve whatever tier is there", because the
--     only other tier the CHECK allows is 'premium' — and every client maps
--     every tier that is not 'pro' to FREE (20260906T100200:12). Preserving
--     'premium' would preserve a row that the customer experiences as not
--     entitled. Overwriting it with 'pro' is the repair, not the regression.
--     Nothing should ever write 'premium' again; ADMIN-PANEL-HANDOFF.md §5
--     says so outright.
--   * p_expires_at must still be in the future. Ending a term early is
--     admin_revoke_subscription's job, and it clamps rather than truncating
--     blind. Two verbs, no ambiguity about which one ends a subscription.
--
-- subscription_store is still never written here — that is
-- admin_set_subscription_store's job, below.
CREATE OR REPLACE FUNCTION public.admin_set_subscription_expiry(
    p_account_id TEXT,
    p_reason     TEXT,
    p_actor      TEXT DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_days       INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_key         TEXT;
    v_acct        TEXT;
    v_tier        TEXT;
    v_expires     TIMESTAMPTZ;
    v_store       TEXT;
    v_store_n     TEXT;
    v_reason      TEXT;
    v_entitled    BOOLEAN;
    v_new_expires TIMESTAMPTZ;
    v_action      TEXT;
BEGIN
    v_key := btrim(coalesce(p_account_id, ''));
    IF v_key = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_id_required');
    END IF;

    v_reason := btrim(coalesce(p_reason, ''));
    IF v_reason = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    IF (p_expires_at IS NULL AND p_days IS NULL)
       OR (p_expires_at IS NOT NULL AND p_days IS NOT NULL) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'specify_expires_at_or_days'
        );
    END IF;

    IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 3650) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'invalid_days',
            'given',   p_days
        );
    END IF;

    IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'expires_at_must_be_future',
            'detail',  'to end a term use admin_revoke_subscription, which clamps instead of truncating',
            'given',   p_expires_at
        );
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

    -- Inlined normaliser — see admin_grant_subscription for why.
    v_store_n := CASE lower(btrim(coalesce(v_store, '')))
        WHEN ''              THEN NULL
        WHEN 'ios'           THEN 'app_store'
        WHEN 'macos'         THEN 'app_store'
        WHEN 'mac_app_store' THEN 'app_store'
        WHEN 'app_store'     THEN 'app_store'
        WHEN 'android'       THEN 'play_store'
        WHEN 'play_store'    THEN 'play_store'
        ELSE lower(btrim(v_store))
    END;

    IF p_days IS NOT NULL THEN
        v_entitled := v_tier IS NOT NULL AND v_tier <> 'free'
                  AND v_expires IS NOT NULL AND v_expires > now();
        v_new_expires := (CASE WHEN v_entitled THEN v_expires ELSE now() END)
                         + make_interval(days => p_days);
        v_action := 'extended';
    ELSE
        v_entitled := false;
        v_new_expires := p_expires_at;
        v_action := 'set_expiry';
    END IF;

    PERFORM set_config('doppler.reason', v_reason, true);
    PERFORM set_config('doppler.actor',
                       coalesce(nullif(btrim(coalesce(p_actor, '')), ''), '(unattributed admin)'),
                       true);

    UPDATE accounts SET
        subscription_tier       = 'pro',
        subscription_expires_at = v_new_expires,
        updated_at              = NOW()
    WHERE account_id = v_acct;

    RETURN jsonb_build_object(
        'success', true,
        'action',  v_action,
        'account_id', v_acct,
        'days',    p_days,
        'reason',  v_reason,
        'actor',   p_actor,
        'stacked', CASE WHEN p_days IS NOT NULL THEN v_entitled ELSE NULL END,
        -- true = RevenueCat is authoritative for this row and may overwrite the
        -- edit at the next renewal event. Advisory; nothing is refused.
        'store_managed', coalesce(v_store_n IN ('app_store', 'play_store'), false),
        'before', jsonb_build_object(
            'tier',       v_tier,
            'expires_at', v_expires,
            'store',      v_store
        ),
        'after', jsonb_build_object(
            'tier',       'pro',
            'expires_at', v_new_expires,
            'store',      v_store
        )
    );
END;
$fn$;

COMMENT ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) IS
    'Set or stack a Pro expiry on ANY account, whatever the store — including revolut and oxapay. '
    'Pass p_expires_at XOR p_days. Never writes subscription_store. Returns store_managed=true for '
    'app_store/play_store rows, where RevenueCat may overwrite the edit. To END a term use '
    'admin_revoke_subscription. service_role only.';

REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO service_role;


-- =============================================================================
-- admin_set_subscription_store — correct the payment-source label, nothing else
-- =============================================================================
-- Why an operator needs this: the panel's old raw PATCH wrote
-- subscription_store = 'admin' unconditionally on every grant
-- (ADMIN-PANEL-HANDOFF.md §2), so an unknown number of rows now say 'admin'
-- for customers who actually paid through OxaPay or Revolut. Nothing else can
-- put that back, and the column is what every "how did this person pay?"
-- question is answered from.
--
-- It writes ONE column. It does not touch tier, expiry, or any ownership
-- column — relabelling how somebody paid is not a statement about what they
-- bought or until when.
--
-- p_store is normalised before it is validated, and the CANONICAL value is what
-- gets written: 'iOS' becomes app_store, ' Admin ' becomes admin. This is a
-- correction tool, so preserving the spelling it was invoked to fix would be an
-- odd thing for it to do. NULL, '', 'none' and 'clear' all clear the column.
CREATE OR REPLACE FUNCTION public.admin_set_subscription_store(
    p_account_id TEXT,
    p_store      TEXT,
    p_reason     TEXT,
    p_actor      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_key       TEXT;
    v_acct      TEXT;
    v_store     TEXT;
    v_txn       TEXT;
    v_raw       TEXT;
    v_new_store TEXT;
    v_reason    TEXT;
    v_warning   TEXT := NULL;
    v_allowed   CONSTANT TEXT[] := ARRAY[
        'app_store', 'play_store', 'stripe', 'paddle',
        'revolut', 'oxapay', 'admin', 'dev-grant'];
BEGIN
    v_key := btrim(coalesce(p_account_id, ''));
    IF v_key = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_id_required');
    END IF;

    v_reason := btrim(coalesce(p_reason, ''));
    IF v_reason = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    v_raw := lower(btrim(coalesce(p_store, '')));

    -- Clearing is a real operation, not a degenerate one: a row whose store was
    -- invented by the old panel PATCH is more honestly blank than wrong. It is
    -- spelled explicitly so it can never be reached by a typo falling through
    -- the allowlist.
    IF v_raw IN ('', 'none', 'clear') THEN
        v_new_store := NULL;
    ELSE
        -- Normalise BEFORE validating, and write the canonical value. This is a
        -- correction tool; preserving the misspelling it was invoked to fix
        -- would be an odd thing for it to do. INLINE
        -- subscription_normalize_store (20260906T100200:178-195), verbatim.
        v_new_store := CASE v_raw
            WHEN ''              THEN NULL
            WHEN 'ios'           THEN 'app_store'
            WHEN 'macos'         THEN 'app_store'
            WHEN 'mac_app_store' THEN 'app_store'
            WHEN 'app_store'     THEN 'app_store'
            WHEN 'android'       THEN 'play_store'
            WHEN 'play_store'    THEN 'play_store'
            ELSE v_raw
        END;

        IF NOT (v_new_store = ANY (v_allowed)) THEN
            RETURN jsonb_build_object(
                'success',    false,
                'error',      'invalid_store',
                'given',      p_store,
                'normalized', v_new_store,
                'allowed',    to_jsonb(v_allowed),
                'detail',     'Pass NULL, '''', ''none'' or ''clear'' to clear the column.'
            );
        END IF;
    END IF;

    IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT account_id, subscription_store, original_transaction_id
          INTO v_acct, v_store, v_txn
        FROM accounts WHERE id = v_key::uuid FOR UPDATE;
    ELSE
        SELECT account_id, subscription_store, original_transaction_id
          INTO v_acct, v_store, v_txn
        FROM accounts WHERE account_id = v_key FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_not_found',
                                  'account_id', p_account_id);
    END IF;

    -- Labelling a row app_store or play_store hands it to RevenueCat and to
    -- every guard that asks "is this a store subscription?" — including
    -- revoke_subscription, which acts on those rows and skips all others.
    -- Without an original_transaction_id there is nothing for any of them to
    -- key on, so that combination is almost always a mislabel. Warn, do not
    -- refuse: an operator correcting a row a webhook has not caught up with yet
    -- is a legitimate thing to be doing.
    IF v_new_store IN ('app_store', 'play_store')
       AND btrim(coalesce(v_txn, '')) = '' THEN
        v_warning := 'no_original_transaction_id';
    END IF;

    PERFORM set_config('doppler.reason', v_reason, true);
    PERFORM set_config('doppler.actor',
                       coalesce(nullif(btrim(coalesce(p_actor, '')), ''), '(unattributed admin)'),
                       true);

    -- The committed CHECK on subscription_store (20260102_subscription_ownership.sql:18)
    -- permits only app_store|play_store|stripe|NULL. Live rows hold revolut,
    -- oxapay, admin and dev-grant, so it has been relaxed or dropped — if it
    -- had not, the Revolut and OxaPay webhooks would already be failing. This
    -- file will not go near that constraint (see the header). It traps the
    -- violation instead, so the operator gets a sentence they can act on rather
    -- than a 500 out of PostgREST.
    BEGIN
        UPDATE accounts SET
            subscription_store = v_new_store,
            updated_at         = NOW()
        WHERE account_id = v_acct;
    EXCEPTION WHEN check_violation THEN
        RETURN jsonb_build_object(
            'success',    false,
            'error',      'store_rejected_by_check',
            'detail',     'A CHECK constraint on accounts.subscription_store rejected this write and NOTHING was changed. Run VERIFY section 6 of 20260910T090000 to see the constraint.',
            'given',      p_store,
            'normalized', v_new_store,
            'account_id', v_acct,
            'constraint', SQLERRM
        );
    END;

    RETURN jsonb_build_object(
        'success', true,
        'action',  CASE WHEN v_new_store IS NULL THEN 'store_cleared' ELSE 'store_set' END,
        'account_id', v_acct,
        'reason',  v_reason,
        'actor',   p_actor,
        'warning', v_warning,
        'store_managed', coalesce(v_new_store IN ('app_store', 'play_store'), false),
        'before',  jsonb_build_object('store', v_store),
        'after',   jsonb_build_object('store', v_new_store)
    );
END;
$fn$;

COMMENT ON FUNCTION public.admin_set_subscription_store(TEXT, TEXT, TEXT, TEXT) IS
    'Correct the payment-source label on an account (e.g. a row wrongly reading ''admin'' back '
    'to ''oxapay''). Normalises the input and writes the canonical value; allowlist is app_store, '
    'play_store, stripe, paddle, revolut, oxapay, admin, dev-grant, and NULL/''''/none/clear '
    'clears it. Writes ONLY subscription_store and updated_at — never the tier, expiry or an '
    'ownership column. service_role only.';

REVOKE ALL ON FUNCTION public.admin_set_subscription_store(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_subscription_store(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription_store(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription_store(TEXT, TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- VERIFY  (read-only unless noted)
-- =============================================================================
--
-- 0. RUN THIS ONE *BEFORE* APPLYING. This file replaces the body of exactly one
--    existing function, and the repo is not authoritative for live bodies
--    (supabase/live/README.md). The guard above catches a changed SIGNATURE; it
--    cannot see a changed BODY.
--
--    SELECT pg_get_functiondef(p.oid)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'admin_set_subscription_expiry';
--
--    Diff it against 20260908T174000_admin_set_subscription_expiry.sql. If it
--    differs by anything but the admin_grant_only block, reconcile the body
--    above against what came back — not against the repo file.
--
-- 1. CENSUS — all four exist, EXACTLY ONE overload each, RETURNS jsonb. This is
--    the query that catches the silent PostgREST failure mode; run it first.
--
--    SELECT p.proname,
--           pg_get_function_arguments(p.oid) AS args,
--           pg_get_function_result(p.oid)    AS returns,
--           count(*) OVER (PARTITION BY p.proname) AS overloads
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('admin_grant_subscription', 'admin_revoke_subscription',
--                        'admin_set_subscription_expiry', 'admin_set_subscription_store')
--    ORDER BY 1;
--    -- expect EXACTLY 4 rows, overloads = 1 on every one, returns = jsonb.
--    -- 5+ rows means an overload survived and the panel may be dispatching to
--    -- the wrong one. Stop; drop the stale one explicitly.
--
-- 1b. GRANTS — owner and service_role only. No anon, no authenticated, no PUBLIC.
--
--    SELECT p.proname,
--           CASE WHEN a.grantee = 0 THEN 'PUBLIC'
--                ELSE pg_get_userbyid(a.grantee) END AS grantee,
--           a.privilege_type
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    LEFT JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a ON true
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('admin_grant_subscription', 'admin_revoke_subscription',
--                        'admin_set_subscription_expiry', 'admin_set_subscription_store')
--    ORDER BY 1, 2;
--
-- 2. Validation, none of which writes anything:
--
--    SELECT public.admin_grant_subscription('VPN-DOES-NOT-EXIST', 30, 'x');
--    -- {"success":false,"error":"account_not_found"}
--    SELECT public.admin_grant_subscription('<TEST>', 0,    'x');   -- invalid_days
--    SELECT public.admin_grant_subscription('<TEST>', 4000, 'x');   -- invalid_days
--    SELECT public.admin_grant_subscription('<TEST>', 30,   '   '); -- reason_required
--    SELECT public.admin_set_subscription_expiry('<TEST>', 'x', NULL, NULL, NULL);
--    -- specify_expires_at_or_days
--    SELECT public.admin_set_subscription_expiry('<TEST>', 'x', NULL, now() - interval '1 day', NULL);
--    -- expires_at_must_be_future
--    SELECT public.admin_set_subscription_store('<TEST>', 'paypal', 'x');
--    -- invalid_store
--
-- 3. THE ONE THAT MATTERS — stacking. On an account with a long term left:
--
--    SELECT public.admin_grant_subscription('<TEST>', 30, 'verify stacking', 'you@example.com');
--    -- expect stacked = true and after.expires_at = before.expires_at + 30 days.
--    -- Under the old panel PATCH this account would now have 30 days TOTAL.
--
-- 4. THE OTHER ONE — a paid store survives a grant:
--
--    -- on an account with subscription_store = 'oxapay':
--    SELECT public.admin_grant_subscription('<OXAPAY-TEST>', 7, 'goodwill', 'you@example.com');
--    -- expect after.store = 'oxapay', NOT 'admin'
--
-- 5. Revoke keeps ownership and never NULLs the expiry:
--
--    SELECT public.admin_revoke_subscription('<TEST>', 'verify revoke', 'you@example.com');
--    SELECT subscription_tier, subscription_expires_at, subscription_store,
--           original_transaction_id, subscription_claimed_at
--    FROM public.accounts WHERE account_id = '<TEST>';
--    -- expect free, expires_at ~ now() and NOT NULL, store and txn intact
--
-- 6. Settle the subscription_store CHECK question (this is the read-only answer
--    to §7 of live/2026-09-06-dump-queries.sql, and what
--    'store_rejected_by_check' would be pointing at):
--
--    SELECT c.conname, pg_get_constraintdef(c.oid), c.convalidated
--    FROM pg_constraint c
--    WHERE c.conrelid = 'public.accounts'::regclass AND c.contype = 'c'
--      AND pg_get_constraintdef(c.oid) ILIKE '%subscription_store%';
--    -- Expect either NO ROW (constraint dropped live) or a definition that
--    -- already lists revolut/oxapay. A row still reading
--    -- ('app_store','play_store','stripe') means the four production writers of
--    -- revolut/oxapay/admin/dev-grant are failing silently and that is a bigger
--    -- problem than this file.
--
-- 7. Expiry editing now works on a web-checkout row — the whole point:
--
--    SELECT public.admin_set_subscription_expiry('<OXAPAY-TEST>', 'support extension',
--                                                'you@example.com', NULL, 14);
--    -- expect success:true, action:'extended', store_managed:false,
--    --        after.store unchanged. Before this file: {"error":"admin_grant_only"}
--
--    SELECT public.admin_set_subscription_expiry('<APPSTORE-TEST>', 'goodwill',
--                                                'you@example.com', NULL, 14);
--    -- expect success:true and store_managed:TRUE — the panel shows the
--    --        RevenueCat-may-overwrite warning off that flag.
--
-- 7b. STORE CORRECTION ROUND TRIP.  (WRITES)  This is the CKC4 repair:
--
--    SELECT public.admin_set_subscription_store('<TEST>', 'oxapay',
--             'store was overwritten by the old panel PATCH', 'you@example.com');
--    -- expect success, after.store 'oxapay', and before/after showing ONLY the
--    --        store moving. Confirm tier and expiry did not:
--    --        SELECT subscription_tier, subscription_expires_at FROM accounts ...
--
--    SELECT public.admin_set_subscription_store('<TEST>', 'iOS', 'alias normalises', 'you@example.com');
--    -- expect after.store 'app_store' (canonical, not 'iOS'), and warning
--    --        'no_original_transaction_id' when the row carries no txn id.
--
--    SELECT public.admin_set_subscription_store('<TEST>', 'clear', 'unlabel', 'you@example.com');
--    -- expect action 'store_cleared', after.store null
--
--    SELECT public.admin_set_subscription_store('<TEST>', 'paypal', 'x');
--    -- expect invalid_store, and NOTHING written
--
-- 8. Uuid and VPN-id both resolve to the same account:
--
--    SELECT (public.admin_grant_subscription(id::text, 1, 'uuid form', 'verify') ->> 'account_id')
--             = account_id AS resolves_the_same
--    FROM public.accounts WHERE account_id = '<TEST>';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   Roll back the doppler-admin deploy FIRST, or its subscription controls
--   start throwing PGRST202 again — the same failure this file exists to fix,
--   just pointed the other way.
--
--   Then:
--
--     BEGIN;
--     DROP FUNCTION IF EXISTS public.admin_grant_subscription(TEXT, INTEGER, TEXT, TEXT);
--     DROP FUNCTION IF EXISTS public.admin_revoke_subscription(TEXT, TEXT, TEXT);
--     DROP FUNCTION IF EXISTS public.admin_set_subscription_store(TEXT, TEXT, TEXT, TEXT);
--     -- and re-apply 20260908T174000_admin_set_subscription_expiry.sql verbatim
--     -- to restore the admin_grant_only version of the fourth function.
--     NOTIFY pgrst, 'reload schema';
--     COMMIT;
--
--   Nothing here writes DDL to a table, so there is no data to unwind. Rows
--   already changed through these functions stay changed — which is the point
--   of admin_revoke_subscription clamping rather than nulling: every one of
--   them is still readable and still reversible by hand.
--
-- =============================================================================
-- WHEN THE 20260906T1* BATCH IS FINALLY UNBLOCKED
-- =============================================================================
--
--   20260906T100400 installs the same two functions and its guard aborts if
--   either name already exists. By then they will, so that file must be SKIPPED
--   (its bodies are identical to these bar the inlined normaliser) — or edited
--   down to nothing but a CREATE OR REPLACE of admin_grant_subscription that
--   swaps the inlined CASE back for public.subscription_normalize_store(). The
--   other five files in the batch are untouched by this one.
--
--   20260906T100000 (subscription_audit) needs no change: all four functions
--   here already stamp doppler.reason / doppler.actor, so its trigger starts
--   recording who and why the moment it lands, with no edit to this file.
-- =============================================================================
