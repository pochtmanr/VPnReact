-- PROPOSAL — not yet applied; apply only after VPnReact/supabase/live/2026-09-06-subscription-rpcs.sql exists and the body below has been reconciled against the live dump
-- =============================================================================
-- 20260906T100200 — claim_subscription: stop it shortening a paid term
-- =============================================================================
--
-- THE FOUR DEFECTS THIS FILE FIXES
--
--   1. It writes p_tier VERBATIM. The old React Native client calls
--      claim_subscription with p_tier='free' on every foreground. Any such call
--      that reaches the legacy branch downgrades the account. p_tier is
--      attacker-controlled over the anon key, so 'premium' — a tier the app maps
--      to FREE (see SUBSCRIPTION-AND-ANTIFRAUD.md §0) — is also writable today.
--
--   2. The legacy no-transaction-id branch (repo copy :102-116) is a blind
--      tier+expiry UPDATE with no ownership check at all. §6 hole #1 records
--      that BOTH live mobile callers always supply a transaction id, so this
--      branch has no legitimate caller left.
--
--   3. The claimed and updated branches write p_expires_at verbatim
--      (:143, :163). A RevenueCat event carrying a shorter expiry than the row
--      already holds SHORTENS a paid term. Web checkout stacks correctly; the
--      store path does not.
--
--   4. The transfer branch (:184-193) downgrades the previous owner
--      unconditionally and NULLs their expiry — including when that account's
--      Pro came from a *different* payment channel entirely (revolut, oxapay,
--      an admin grant). One store restore on a second device can therefore
--      erase a web purchase nobody has been refunded for.
--
-- WHAT THIS FILE INSTALLS
--   (a) public.subscription_normalize_store(text) — internal, folds the leaked
--       store values back onto the two real store names
--   (b) public.subscription_apply_grant(...) — internal, the ONE place a grant
--       is written: row-locked, never shortens an active term, and records the
--       store belonging to whichever term reaches furthest
--   (c) public.claim_subscription(...) — same 6-arg signature, rewritten to
--       refuse ungrantable tiers, refuse the legacy branch, and route all three
--       remaining branches through (b)
--
-- ORDER
--   Apply 20260906T100000 (the audit trail) first. Every write below is then
--   attributable, which is the point of doing them in this order.
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
    -- claim_subscription must exist exactly once. A second overload means the
    -- CREATE OR REPLACE below would leave the unguarded original callable while
    -- looking, in the migration history, like the fix landed.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_subscription';

    IF v_n <> 1 THEN
        RAISE EXCEPTION
            'ABORT: public.claim_subscription has % overloads, expected exactly 1. See live/2026-09-06-subscription-rpcs.sql §1.',
            v_n;
    END IF;

    SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_subscription';

    IF v_args IS DISTINCT FROM
       'text, text, timestamp with time zone, text, text, text' THEN
        RAISE EXCEPTION
            'ABORT: claim_subscription identity args are (%), expected (text, text, timestamp with time zone, text, text, text).',
            v_args;
    END IF;

    -- PostgREST dispatches on argument NAMES. Print the live ones so the
    -- applier can compare them against the CREATE below before committing.
    RAISE NOTICE 'claim_subscription declared args live: %',
        (SELECT pg_get_function_arguments(p.oid)
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'claim_subscription');

    -- The two internal helpers must not already exist under a different
    -- signature, or these CREATEs add overloads instead of defining them.
    FOR v_args IN
        SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('subscription_apply_grant', 'subscription_normalize_store')
    LOOP
        RAISE EXCEPTION
            'ABORT: % already exists live. Reconcile before applying.', v_args;
    END LOOP;

    -- The audit trail must be in place, or the writes this file reroutes are
    -- as untraceable afterwards as they are today.
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.accounts'::regclass
          AND NOT tgisinternal
          AND tgname = 'trg_accounts_subscription_audit_upd'
    ) THEN
        RAISE EXCEPTION
            'ABORT: apply 20260906T100000_subscription_audit.sql first — nothing here would be attributable without it.';
    END IF;
END
$guard$;


-- =============================================================================
-- (a) subscription_normalize_store — fold the leaked values back
-- =============================================================================
-- Live accounts.subscription_store holds: app_store, play_store, revolut,
-- oxapay, admin, stripe, paddle, dev-grant — and the leaked ios, android,
-- macos, windows, which arrived because the RevenueCat webhook sends its own
-- platform string straight through (index.ts:141/:161/:184/:299). The webhook
-- is fixed in the same batch; this exists because eleven months of rows already
-- carry the leaked values and every guard that asks "is this a store
-- subscription?" has to answer correctly for them.
--
-- It normalises ONLY the aliases. Unknown values pass through unchanged and
-- lower-cased, so a value nobody anticipated is never silently promoted into
-- app_store.
CREATE OR REPLACE FUNCTION public.subscription_normalize_store(p_store text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT CASE lower(btrim(coalesce(p_store, '')))
        WHEN ''           THEN NULL
        WHEN 'ios'        THEN 'app_store'
        WHEN 'macos'      THEN 'app_store'
        WHEN 'mac_app_store' THEN 'app_store'
        WHEN 'app_store'  THEN 'app_store'
        WHEN 'android'    THEN 'play_store'
        WHEN 'play_store' THEN 'play_store'
        ELSE lower(btrim(p_store))
    END;
$fn$;

COMMENT ON FUNCTION public.subscription_normalize_store(text) IS
    'Internal. Folds the leaked store aliases (ios/macos/mac_app_store -> app_store, '
    'android -> play_store) onto the canonical names. Unknown values pass through '
    'lower-cased and are NEVER promoted to a store name. Not callable by any client role.';

REVOKE ALL ON FUNCTION public.subscription_normalize_store(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.subscription_normalize_store(text) FROM anon;
REVOKE ALL ON FUNCTION public.subscription_normalize_store(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.subscription_normalize_store(text) FROM service_role;


-- =============================================================================
-- (b) subscription_apply_grant — the only place a grant is written
-- =============================================================================
-- Contract, in one line: a grant may EXTEND an active term and may REPLACE a
-- lapsed one, but it may never SHORTEN an active one.
--
--   entitled := tier <> 'free' AND expires_at > now()      (the server Pro rule)
--   new expiry := GREATEST(current, requested) when entitled, else requested
--   store      := the store belonging to whichever term reaches furthest
--
-- The tier written is always 'pro'. There is no other grantable tier: the
-- clients map everything that is not 'pro' to FREE, and 'premium' appears only
-- inside immutable product ids (SUBSCRIPTION-AND-ANTIFRAUD.md §0).
--
-- SECURITY DEFINER with no grants to any client role: it is reachable only from
-- claim_subscription, which is itself SECURITY DEFINER and therefore runs as
-- the owner.
CREATE OR REPLACE FUNCTION public.subscription_apply_grant(
    p_account_id              text,
    p_expires_at              timestamptz,
    p_store                   text,
    p_original_transaction_id text    DEFAULT NULL,
    p_product_id              text    DEFAULT NULL,
    p_set_ownership           boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_cur_tier    text;
    v_cur_expires timestamptz;
    v_cur_store   text;
    v_entitled    boolean;
    v_store       text;
    v_new_expires timestamptz;
    v_new_store   text;
    v_shortened   boolean := false;
BEGIN
    -- FOR UPDATE, not a bare SELECT. Two RevenueCat deliveries for the same
    -- account can land concurrently (RC retries aggressively), and without the
    -- lock both read the same "current" expiry and the later write wins —
    -- which is the shortening bug reintroduced by a race instead of by logic.
    SELECT subscription_tier, subscription_expires_at, subscription_store
      INTO v_cur_tier, v_cur_expires, v_cur_store
    FROM public.accounts
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_not_found');
    END IF;

    v_store := public.subscription_normalize_store(p_store);

    -- The server Pro rule, verbatim. get_servers_v2 uses exactly these
    -- conjuncts and it is the only authority on entitlement.
    v_entitled := v_cur_tier IS NOT NULL
              AND v_cur_tier <> 'free'
              AND v_cur_expires IS NOT NULL
              AND v_cur_expires > now();

    -- A NULL requested expiry means the event carried none — a
    -- NON_RENEWING_PURCHASE with no expiration_at_ms, or any anon caller that
    -- simply omits p_expires_at.
    --
    -- If the account is NOT currently entitled there is nothing to extend and
    -- no term to write, so this writes NOTHING. Falling through would set
    -- tier='pro' with expires_at NULL, which is:
    --   * not entitled by the server rule (get_servers_v2 requires
    --     expires_at IS NOT NULL AND expires_at > now()), so the customer sees
    --     a Pro badge and gets no credentials — the Windows dead end, again;
    --   * PERMANENTLY INVISIBLE to the expiry sweeper, whose predicate is also
    --     `expires_at IS NOT NULL`. The row could never be cleaned up by
    --     anything except a human noticing it.
    -- Granting an unbounded term is strictly worse than granting nothing.
    IF p_expires_at IS NULL AND NOT v_entitled THEN
        RETURN jsonb_build_object(
            'success',      true,
            'action',       'ignored',
            'reason',       'no_expiry',
            'account_id',   p_account_id,
            'tier',         v_cur_tier,
            'expires_at',   v_cur_expires,
            'store',        v_cur_store,
            'ownership_set', false
        );
    END IF;

    IF p_expires_at IS NULL THEN
        -- Entitled, and the event named no expiry: leave the term exactly as
        -- it is. v_cur_expires is non-NULL here by the definition of
        -- v_entitled, so this cannot null the column.
        v_new_expires := v_cur_expires;
    ELSIF v_entitled THEN
        v_new_expires := GREATEST(v_cur_expires, p_expires_at);
        v_shortened   := p_expires_at < v_cur_expires;
    ELSE
        -- Lapsed or free: the incoming term is the term. This is a restore or
        -- a fresh purchase, and it is allowed to move the expiry backwards from
        -- some stale future value because nothing is currently entitled.
        v_new_expires := p_expires_at;
    END IF;

    -- The store column must describe whichever term is now on the row. If the
    -- incumbent term won, the incumbent store stays; otherwise the incoming
    -- store takes it. Ties go to the incumbent — a renewal that lands on the
    -- same instant does not rewrite a web purchase's provenance.
    IF v_new_expires IS NOT DISTINCT FROM v_cur_expires AND v_cur_store IS NOT NULL THEN
        v_new_store := v_cur_store;
    ELSE
        v_new_store := coalesce(v_store, v_cur_store);
    END IF;

    UPDATE public.accounts SET
        subscription_tier       = 'pro',
        subscription_expires_at = v_new_expires,
        subscription_store      = v_new_store,

        -- Ownership columns move only on a claim or a transfer. A plain
        -- renewal for an account that already owns the transaction must not
        -- re-stamp subscription_claimed_at, or "when did this account first
        -- get this subscription" becomes unanswerable.
        original_transaction_id = CASE WHEN p_set_ownership
                                       THEN p_original_transaction_id
                                       ELSE original_transaction_id END,
        subscription_product_id = CASE WHEN p_set_ownership
                                       THEN coalesce(p_product_id, subscription_product_id)
                                       ELSE subscription_product_id END,
        subscription_claimed_at = CASE WHEN p_set_ownership
                                       THEN now()
                                       ELSE subscription_claimed_at END,

        revenuecat_synced_at    = now(),
        updated_at              = now()
    WHERE account_id = p_account_id;

    RETURN jsonb_build_object(
        'success',             true,
        'account_id',          p_account_id,
        'tier',                'pro',
        'previous_tier',       v_cur_tier,
        'previous_expires_at', v_cur_expires,
        'expires_at',          v_new_expires,
        'requested_expires_at', p_expires_at,
        'store',               v_new_store,
        'requested_store',     v_store,
        'ownership_set',       p_set_ownership,
        -- true means the caller asked for a SHORTER term than the account
        -- already held and was refused. Non-zero counts of this in the logs
        -- mean a real client is sending stale expiries and wants investigating.
        'shortened_refused',   v_shortened
    );
END;
$fn$;

COMMENT ON FUNCTION public.subscription_apply_grant(text, timestamptz, text, text, text, boolean) IS
    'Internal. The single writer for granting/extending Pro. Row-locks the account, never '
    'shortens an active term (GREATEST), records the store of whichever term reaches furthest, '
    'and touches ownership columns only when p_set_ownership. Not callable by any client role.';

REVOKE ALL ON FUNCTION public.subscription_apply_grant(text, timestamptz, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.subscription_apply_grant(text, timestamptz, text, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.subscription_apply_grant(text, timestamptz, text, text, text, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.subscription_apply_grant(text, timestamptz, text, text, text, boolean) FROM service_role;


-- =============================================================================
-- (c) claim_subscription — same signature, guarded body
-- =============================================================================
-- RECONCILE — every line marked below was written from the repo copy at
-- migrations/20260102_subscription_ownership.sql:74-229, NOT from live. Diff
-- this body against live/2026-09-06-subscription-rpcs.sql §2.1 before applying
-- and carry across anything live does that the repo copy does not.
--
-- Response shapes (six, unchanged in count):
--   {success:true,  action:'claimed'|'updated'|'transferred', ...}
--   {success:true,  action:'ignored', reason:'tier_not_grantable'}   <- NEW
--   {success:false, error:'account_not_found'}
--   {success:false, error:'transaction_id_required'}                 <- NEW
--   {success:false, error:'database_error', details, sqlstate}
--
-- The clients branch on action == 'rejected', which this function still never
-- returns (§3, unchanged and deliberate — verify_restore is the lever with a
-- working client contract). 'ignored' carries success:true precisely so that
-- the old RN client's per-foreground p_tier='free' call is a no-op that both
-- clients record as a successful sync rather than as an error worth retrying.
CREATE OR REPLACE FUNCTION public.claim_subscription(
    p_account_id              TEXT,
    p_tier                    TEXT,
    p_expires_at              TIMESTAMPTZ DEFAULT NULL,
    p_original_transaction_id TEXT DEFAULT NULL,
    p_store                   TEXT DEFAULT 'app_store',
    p_product_id              TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_existing_owner TEXT;
    v_account_exists BOOLEAN;
    v_store          TEXT;
    v_grant          JSONB;
    v_prev_store     TEXT;
    v_prev_store_n   TEXT;
    v_prev_tier      TEXT;
    v_prev_txn       TEXT;
    v_prev_downgrade BOOLEAN := false;
BEGIN
    -- RECONCILE :92-98 — unchanged from the repo copy. Kept ahead of the tier
    -- guard so that account_not_found still reaches clients that use it to
    -- decide whether to recreate an account.
    SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = p_account_id)
      INTO v_account_exists;
    IF NOT v_account_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'account_not_found'
        );
    END IF;

    -- NEW — tier guard.
    -- The only grantable tier is pro. Everything else is ignored, and ignored
    -- means NOTHING IS WRITTEN — not the tier, not the expiry, not
    -- revenuecat_synced_at. The old React Native client calls this with
    -- p_tier='free' on every foreground; before this guard, that call reached
    -- the legacy branch and downgraded the account.
    IF p_tier IS NULL OR lower(btrim(p_tier)) NOT IN ('pro', 'premium') THEN
        RETURN jsonb_build_object(
            'success', true,
            'action',  'ignored',
            'reason',  'tier_not_grantable',
            'tier',    p_tier,
            'owner',   p_account_id
        );
    END IF;
    -- 'premium' is accepted as an INPUT because RevenueCat's legacy entitlement
    -- is named that, but 'pro' is the only value ever written — see
    -- subscription_apply_grant, which hardcodes it. Never introduce a premium tier.

    -- NEW — normalise the store before anything reads or writes it.
    v_store := public.subscription_normalize_store(coalesce(p_store, 'app_store'));

    -- NEW — stamp a reason for every write this call makes, including the ones
    -- made inside subscription_apply_grant and the transfer branch's downgrade
    -- of the previous owner. set_config(..., true) is transaction-local, so it
    -- covers the whole call and nothing after it.
    --
    -- Without this, a claim-path audit row has a writer_fn and no reason, and
    -- "which store was this claim for" needs the pg_context string parsed by
    -- hand. The raw p_store is recorded, not the normalised one: knowing the
    -- caller said 'ios' rather than 'app_store' is what identifies the caller.
    PERFORM set_config('doppler.reason',
                       'claim:' || coalesce(p_store, ''),
                       true);

    -- CHANGED :102-116 — the legacy no-transaction-id branch was a blind
    -- tier+expiry UPDATE with no ownership check. Both live mobile callers
    -- always supply a transaction id (§6 hole #1), so refusing here breaks
    -- nothing and closes the second of the two writers that could have produced
    -- the CKC4 downgrade.
    IF p_original_transaction_id IS NULL OR btrim(p_original_transaction_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'transaction_id_required',
            'owner',   p_account_id
        );
    END IF;

    -- RECONCILE :119-121 — plus FOR UPDATE, which the repo copy lacks.
    -- Locking the ownership row FIRST gives every concurrent claim for the same
    -- transaction a single serialisation point, so two devices restoring the
    -- same purchase at the same instant cannot interleave a transfer.
    SELECT current_owner_account_id INTO v_existing_owner
    FROM subscription_ownership
    WHERE original_transaction_id = p_original_transaction_id
    FOR UPDATE;

    -- ---------------------------------------------------------------------
    -- Branch 1: no owner yet — first claim of this transaction
    -- ---------------------------------------------------------------------
    IF v_existing_owner IS NULL THEN
        -- RECONCILE :126-138. NOTE the normalised store: the repo copy inserts
        -- COALESCE(p_store,'app_store') raw, which is how 'ios'/'android' got
        -- into a column whose committed CHECK forbids them (§6 hole #12).
        INSERT INTO subscription_ownership (
            original_transaction_id,
            store,
            product_id,
            current_owner_account_id,
            original_owner_account_id
        ) VALUES (
            p_original_transaction_id,
            coalesce(v_store, 'app_store'),
            p_product_id,
            p_account_id,
            p_account_id
        );

        -- CHANGED :141-150 — was a verbatim UPDATE that could shorten a term.
        v_grant := public.subscription_apply_grant(
            p_account_id              => p_account_id,
            p_expires_at              => p_expires_at,
            p_store                   => v_store,
            p_original_transaction_id => p_original_transaction_id,
            p_product_id              => p_product_id,
            p_set_ownership           => true
        );

        -- The INSERT above is what CLAIMS the transaction, so it has to come
        -- first — it is the serialisation point every concurrent claim for this
        -- transaction contends on. But subscription_apply_grant reports failure
        -- as a RETURN VALUE, not an exception, so an early RETURN here would
        -- leave that ownership row behind with no matching entitlement: a
        -- transaction owned by an account that was never granted anything, and
        -- the real owner permanently unable to claim it because the UNIQUE
        -- constraint is taken. Undo the claim before returning.
        IF NOT coalesce((v_grant ->> 'success')::boolean, false) THEN
            DELETE FROM subscription_ownership
            WHERE original_transaction_id = p_original_transaction_id
              AND current_owner_account_id = p_account_id
              AND transferred_at IS NULL;
            RETURN v_grant;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'action',  'claimed',
            'owner',   p_account_id,
            'grant',   v_grant
        );
    END IF;

    -- ---------------------------------------------------------------------
    -- Branch 2: this account already owns it — renewal / re-sync
    -- ---------------------------------------------------------------------
    IF v_existing_owner = p_account_id THEN
        -- CHANGED :161-166 — was a verbatim UPDATE. This is the branch every
        -- RENEWAL takes, and the one where a stale RevenueCat expiry used to
        -- shorten a live term.
        v_grant := public.subscription_apply_grant(
            p_account_id              => p_account_id,
            p_expires_at              => p_expires_at,
            p_store                   => v_store,
            p_original_transaction_id => p_original_transaction_id,
            p_product_id              => p_product_id,
            p_set_ownership           => false
        );
        IF NOT coalesce((v_grant ->> 'success')::boolean, false) THEN
            RETURN v_grant;
        END IF;

        -- RECONCILE :169-171 — unchanged.
        UPDATE subscription_ownership SET
            updated_at = NOW()
        WHERE original_transaction_id = p_original_transaction_id;

        RETURN jsonb_build_object(
            'success', true,
            'action',  'updated',
            'owner',   p_account_id,
            'grant',   v_grant
        );
    END IF;

    -- ---------------------------------------------------------------------
    -- Branch 3: transfer — a different account is restoring this purchase
    -- ---------------------------------------------------------------------
    -- Ownership ALWAYS moves: accounts.original_transaction_id carries a
    -- partial UNIQUE index, so the new owner cannot take the transaction until
    -- the old row releases it. What changes is whether the old owner also
    -- loses Pro.
    --
    -- CHANGED :184-193 — the repo copy downgrades unconditionally and NULLs the
    -- expiry. That erases a term the store transfer says nothing about: an
    -- account whose Pro came from revolut, oxapay or an admin grant has been
    -- paid for through a channel this event does not speak for. Only an
    -- app_store/play_store term is genuinely superseded by a store restore.
    SELECT subscription_tier, subscription_store, original_transaction_id
      INTO v_prev_tier, v_prev_store, v_prev_txn
    FROM accounts
    WHERE account_id = v_existing_owner
    FOR UPDATE;

    v_prev_store_n := public.subscription_normalize_store(v_prev_store);

    -- A NULL store with a transaction id set is a STORE row whose store column
    -- was never written — exactly what the old legacy no-transaction-id branch
    -- produced (it wrote tier and expiry and nothing else), and what
    -- sync_subscription produced for anyone who called it after a claim.
    -- Without this clause such a row falls to the ELSE arm, keeps Pro, and
    -- hands its transaction to the new owner — one paid subscription, two
    -- entitled accounts, which is the exact duplication the transfer branch
    -- exists to prevent.
    --
    -- NULL store AND no txn is genuinely unknown provenance and still falls to
    -- the ELSE arm: there is no evidence it is a store subscription, and
    -- downgrading on no evidence is what the old unconditional revoke did.
    IF v_prev_store_n IN ('app_store', 'play_store')
       OR (v_prev_store IS NULL AND v_prev_txn IS NOT NULL) THEN
        UPDATE accounts SET
            subscription_tier       = 'free',
            -- LEAST(x, now()) rather than NULL. A NULL expiry loses the fact
            -- that the account WAS entitled until some date, which is exactly
            -- what support needs when the user disputes the transfer. LEAST
            -- ignores NULLs, so a row with no expiry gets now(), never NULL.
            subscription_expires_at = LEAST(subscription_expires_at, now()),
            subscription_store      = NULL,
            original_transaction_id = NULL,
            subscription_product_id = NULL,
            subscription_claimed_at = NULL,
            revenuecat_synced_at    = NOW(),
            updated_at              = NOW()
        WHERE account_id = v_existing_owner;
        v_prev_downgrade := true;
    ELSE
        -- Release the transaction id (the UNIQUE index demands it) and nothing
        -- else. Their tier, expiry and store survive: they paid elsewhere.
        UPDATE accounts SET
            original_transaction_id = NULL,
            subscription_claimed_at = NULL,
            updated_at              = NOW()
        WHERE account_id = v_existing_owner;
        v_prev_downgrade := false;
    END IF;

    -- CHANGED :196-205 — was a verbatim UPDATE.
    v_grant := public.subscription_apply_grant(
        p_account_id              => p_account_id,
        p_expires_at              => p_expires_at,
        p_store                   => v_store,
        p_original_transaction_id => p_original_transaction_id,
        p_product_id              => p_product_id,
        p_set_ownership           => true
    );
    IF NOT coalesce((v_grant ->> 'success')::boolean, false) THEN
        RETURN v_grant;
    END IF;

    -- RECONCILE :208-213 — unchanged.
    UPDATE subscription_ownership SET
        current_owner_account_id    = p_account_id,
        transferred_from_account_id = v_existing_owner,
        transferred_at              = NOW(),
        updated_at                  = NOW()
    WHERE original_transaction_id = p_original_transaction_id;

    RETURN jsonb_build_object(
        'success',                 true,
        'action',                  'transferred',
        'previous_owner',          v_existing_owner,
        'previous_owner_store',    v_prev_store,
        'previous_owner_had_txn',  (v_prev_txn IS NOT NULL),
        'previous_owner_downgraded', v_prev_downgrade,
        'new_owner',               p_account_id,
        'grant',                   v_grant
    );

-- RECONCILE :222-227 — the wrapper is kept because removing it would turn every
-- constraint violation into an HTTP 500 that RevenueCat retries forever.
-- sqlstate is ADDED: 'database_error' with only SQLERRM has repeatedly been
-- unactionable, and a CHECK violation (23514) versus a unique violation (23505)
-- versus a deadlock (40P01) are three completely different bugs.
EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[claim_subscription] % (%) account=% txn=% store=%',
        SQLERRM, SQLSTATE, p_account_id, p_original_transaction_id, p_store;
    RETURN jsonb_build_object(
        'success',  false,
        'error',    'database_error',
        'details',  SQLERRM,
        'sqlstate', SQLSTATE
    );
END;
$fn$;

COMMENT ON FUNCTION public.claim_subscription(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) IS
    'Store-purchase claim/renew/transfer. Writes tier ''pro'' only; ignores every other '
    'requested tier. Requires a transaction id. Never shortens an active term (all three '
    'branches route through subscription_apply_grant). A transfer downgrades the previous '
    'owner only when their store was app_store/play_store; ownership always moves.';

-- -----------------------------------------------------------------------------
-- Grants — deliberately UNCHANGED from live
-- -----------------------------------------------------------------------------
-- claim_subscription stays anon-callable. Both mobile clients call it directly
-- with the anon key as a backstop when the RevenueCat webhook is late, and
-- removing that grant is a client-release-shaped change, not a migration.
-- What made anon access dangerous was the verbatim tier write and the legacy
-- branch; both are closed above.
--
-- CREATE OR REPLACE preserves the existing ACL, so nothing here re-grants
-- anything. This block is written out only so that a future reader does not
-- assume the grants were forgotten.
--   live grants, per live/2026-09-06-subscription-rpcs.sql §3: anon,
--   authenticated, service_role  (repo copy :232-234 agrees)

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- VERIFY  (read-only unless noted)
-- =============================================================================
--
-- 1. All three functions exist exactly once each, with the expected signatures:
--
--    SELECT p.proname, count(*) AS n,
--           string_agg(pg_get_function_identity_arguments(p.oid), ' | ') AS args
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public'
--      AND p.proname IN ('claim_subscription','subscription_apply_grant','subscription_normalize_store')
--    GROUP BY p.proname;
--    -- expect n = 1 for all three
--
-- 2. The two helpers are unreachable from any client role:
--
--    SELECT p.proname,
--           CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
--    WHERE n.nspname='public'
--      AND p.proname IN ('subscription_apply_grant','subscription_normalize_store');
--    -- expect: owner only. No anon, no authenticated, no service_role.
--
-- 3. Normalisation:
--
--    SELECT public.subscription_normalize_store(s) AS out, s AS in_
--    FROM unnest(ARRAY['ios','macos','android','app_store','play_store',
--                      'revolut','oxapay','admin','windows',NULL,'']) s;
--    -- expect ios/macos -> app_store, android -> play_store,
--    --        revolut/oxapay/admin/windows unchanged, NULL and '' -> NULL
--
-- 4. The tier guard writes nothing. On a genuinely Pro test account:
--
--    SELECT public.claim_subscription('<PRO-TEST-ACCOUNT>', 'free', NULL, 'whatever');
--    -- expect {"success":true,"action":"ignored","reason":"tier_not_grantable"}
--    -- and ZERO new rows in subscription_audit for that account:
--    SELECT count(*) FROM public.subscription_audit
--     WHERE account_id='<PRO-TEST-ACCOUNT>' AND changed_at > now() - interval '1 minute';
--    -- expect 0
--
-- 5. The legacy branch is closed:
--
--    SELECT public.claim_subscription('<ANY-TEST-ACCOUNT>', 'pro', now() + interval '30 days');
--    -- expect {"success":false,"error":"transaction_id_required"}
--
-- 6. THE ONE THAT MATTERS — a short expiry cannot shorten a live term.
--    On a test account holding pro until, say, now()+60d with txn 'T-TEST':
--
--    SELECT public.claim_subscription('<TEST>', 'pro', now() + interval '5 days',
--                                     'T-TEST', 'ios', 'vpn_premium_monthly');
--    -- expect action 'updated', grant.shortened_refused = true,
--    --        grant.expires_at still ~now()+60d, grant.store unchanged
--    SELECT subscription_expires_at, subscription_store FROM public.accounts
--     WHERE account_id='<TEST>';
--    -- expect the 60-day expiry intact
--
-- 7. A transfer does not erase a web purchase. Two test accounts: A holding
--    pro via store txn 'T-X', B holding pro via subscription_store='revolut'
--    with a future expiry and original_transaction_id = 'T-X' forced onto B so
--    that B is the ownership row's current owner. Claim 'T-X' onto A:
--    -- expect action 'transferred', previous_owner_downgraded = false,
--    --        and B still tier='pro' with its revolut expiry intact
--
-- 8. A claim with no expiry on a free account writes NOTHING:
--
--    SELECT public.claim_subscription('<FREE-TEST-ACCOUNT>', 'pro', NULL, 'T-NOEXP');
--    -- expect {"success":true,"action":"claimed", "grant":{... "action":"ignored",
--    --          "reason":"no_expiry" ...}} — and the account STILL free:
--    SELECT subscription_tier, subscription_expires_at FROM public.accounts
--     WHERE account_id='<FREE-TEST-ACCOUNT>';
--    -- expect free / NULL. A pro row with a NULL expiry is not entitled by the
--    -- server rule AND is invisible to the sweeper, so it can never be cleaned up.
--    -- (An ownership row IS created and kept: the transaction is genuinely
--    --  claimed by this account, there is simply no term to grant yet.)
--
-- 9. A transfer away from a legacy row (txn set, store NULL) DOES downgrade:
--
--    -- account B: subscription_tier='pro', original_transaction_id='T-Y',
--    --            subscription_store IS NULL  (what the old legacy branch left)
--    SELECT public.claim_subscription('<A>', 'pro', now() + interval '30 days', 'T-Y');
--    -- expect previous_owner_downgraded = true, previous_owner_had_txn = true.
--    -- Before this fix B kept Pro AND lost the txn: one subscription, two
--    -- entitled accounts.
--
-- 10. Every claim-path audit row carries a reason:
--
--    SELECT writer_fn, reason, count(*) FROM public.subscription_audit
--    WHERE changed_at > now() - interval '1 day' GROUP BY 1,2 ORDER BY 3 DESC;
--    -- expect reasons like 'claim:ios', 'claim:app_store', 'claim:android'
--
-- 11. Shortening attempts in the wild, once this is live for a day:
--
--    SELECT count(*) FROM public.subscription_audit
--     WHERE writer_fn = 'subscription_apply_grant'
--       AND changed_at > now() - interval '1 day';
--    -- non-zero is normal; compare against RevenueCat's event volume
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   BEGIN;
--     -- 1. Restore claim_subscription from the live dump, NOT from the repo:
--     --    paste live/2026-09-06-subscription-rpcs.sql §2.1 verbatim here.
--     -- 2. Then drop the helpers, which nothing else references:
--     DROP FUNCTION IF EXISTS public.subscription_apply_grant(text, timestamptz, text, text, text, boolean);
--     DROP FUNCTION IF EXISTS public.subscription_normalize_store(text);
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
--   NOTE: 20260906T100300 (revoke_subscription) and 20260906T100400 (the admin
--   RPCs) also call subscription_normalize_store. Postgres records NO
--   dependency for a name referenced inside a PL/pgSQL body, so the DROP above
--   SUCCEEDS and those functions then fail at runtime with
--   'function public.subscription_normalize_store(text) does not exist'.
--   Roll those migrations back FIRST, or leave the helper in place — it is
--   inert on its own and grants nothing to anybody.
--
-- =============================================================================
