-- PROPOSAL — not yet applied; apply only after VPnReact/supabase/live/2026-09-06-subscription-rpcs.sql exists and the body below has been reconciled against the live dump
-- =============================================================================
-- 20260906T100000 — subscription_audit: who changed a subscription, and how
-- =============================================================================
--
-- WHY
--   Six writers can move accounts.subscription_tier / _expires_at / _store /
--   original_transaction_id today: the admin panel's raw PATCH, sync_subscription
--   (anon-callable, blind UPDATE), claim_subscription (four branches, three of
--   which overwrite expiry verbatim), revoke_subscription (nulls everything),
--   the two web-checkout webhooks, and the pg_cron sweeper. None of them leaves
--   a trace beyond updated_at.
--
--   That is why the CKC4 case could only be reconstructed by inference: a paid
--   OxaPay customer went free at 11:44:41 and the best available answer to
--   "which writer did it" is "a tier-only writer, most likely the VPS panel's
--   RevenueCat sync". After this migration the same question is one SELECT.
--
-- WHAT IT DOES
--   * creates public.subscription_audit — append-only, RLS on, no policies,
--     no grants to anyone
--   * creates public.subscription_audit_row() — the trigger function, which
--     reads the PL/pgSQL call stack (GET DIAGNOSTICS … PG_CONTEXT) to record
--     WHICH FUNCTION did the write, plus the PostgREST request context
--   * attaches two AFTER triggers to public.accounts
--
-- WHAT IT DOES NOT DO
--   No DML on accounts. No change to any existing function. This file is safe
--   to apply before the live dump exists — it is listed first deliberately, so
--   that every later migration in this batch is itself audited. The header rule
--   still applies to the rest of the batch.
--
-- COST
--   One INSERT per subscription-shaped UPDATE on accounts. Those are rare
--   (claims, renewals, sweeps) — this is not a hot path. The trigger is
--   deliberately WHEN-guarded so that unrelated column updates (max_devices,
--   brand, a bare updated_at touch) write nothing.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Precondition: nothing already audits this table
-- -----------------------------------------------------------------------------
-- If some out-of-band trigger already writes an audit trail for accounts,
-- stacking a second one produces two records of every write and an argument
-- about which is authoritative. dump-queries §5 lists the live triggers.
DO $guard$
DECLARE
    v_existing text;
BEGIN
    SELECT string_agg(t.tgname, ', ')
      INTO v_existing
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'accounts'
      AND NOT t.tgisinternal
      AND t.tgname LIKE '%audit%'
      AND t.tgname NOT IN ('trg_accounts_subscription_audit_upd',
                           'trg_accounts_subscription_audit_del');

    IF v_existing IS NOT NULL THEN
        RAISE EXCEPTION
            'ABORT: public.accounts already carries audit trigger(s): %. Reconcile before applying.',
            v_existing;
    END IF;
END
$guard$;


-- -----------------------------------------------------------------------------
-- The table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_audit (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Both identities are kept. account_id (VPN-XXXX-XXXX-XXXX) is what every
    -- RPC takes; account_uuid is what the admin panel's PATCH filters on
    -- (.eq('id', id)). Recording only one of them would make half the writers
    -- unjoinable after the fact.
    account_id        text,
    account_uuid      uuid,

    op                text NOT NULL CHECK (op IN ('UPDATE', 'DELETE')),

    -- The five columns that decide entitlement, before and after.
    old_tier          text,
    new_tier          text,
    old_expires_at    timestamptz,
    new_expires_at    timestamptz,
    old_store         text,
    new_store         text,
    old_txn           text,
    new_txn           text,
    old_synced_at     timestamptz,
    new_synced_at     timestamptz,

    -- WHO. writer_fn is the innermost PL/pgSQL frame *above* the trigger
    -- function itself — i.e. claim_subscription, revoke_subscription,
    -- downgrade_expired_subscriptions … or NULL when the UPDATE arrived as
    -- plain SQL from PostgREST (the admin panel PATCH and both web webhooks
    -- look like this, and a NULL here is itself the finding).
    writer_fn         text,
    pg_context        text,

    -- The PostgREST request context, when there is one. jwt_role separates an
    -- anon-key call from a service-role call; a NULL means the write did not
    -- come through PostgREST at all (pg_cron, Dashboard SQL editor, psql).
    jwt_role          text,
    session_role      text,
    user_agent        text,
    client_ip         text,

    -- Set by the caller with set_config('doppler.reason' / 'doppler.actor', …, true).
    -- The new admin RPCs and revoke_subscription always set reason; the
    -- sweeper sets 'expiry sweep'; the backfill sets its own string.
    reason            text,
    actor             text,

    changed_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_audit IS
    'Append-only trail of every change to the five entitlement columns on accounts. '
    'RLS is enabled with NO policies and no role holds any grant: read it as the table '
    'owner from the Dashboard SQL editor. Written only by public.subscription_audit_row().';

COMMENT ON COLUMN public.subscription_audit.writer_fn IS
    'Innermost PL/pgSQL frame above the trigger, parsed from GET DIAGNOSTICS PG_CONTEXT. '
    'NULL means the UPDATE was plain SQL with no function in the stack — e.g. the admin '
    'panel PATCH or a web-checkout webhook writing accounts directly through PostgREST.';

-- Indexes. Two access patterns, both narrow:
--   "everything that happened to this account"  -> (account_id, changed_at desc)
--   "everything that happened in this window"   -> (changed_at desc)
CREATE INDEX IF NOT EXISTS idx_subscription_audit_account_changed
    ON public.subscription_audit (account_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_audit_changed
    ON public.subscription_audit (changed_at DESC);

-- A partial index on the interesting event: somebody took Pro away.
-- This is the "who downgraded a paying customer" query, and it is the one that
-- has to be fast at 3am with a customer waiting.
CREATE INDEX IF NOT EXISTS idx_subscription_audit_downgrades
    ON public.subscription_audit (changed_at DESC)
    WHERE new_tier = 'free' AND old_tier IS DISTINCT FROM 'free';


-- -----------------------------------------------------------------------------
-- Lock it down
-- -----------------------------------------------------------------------------
-- RLS enabled with zero policies: no non-owner role can read or write a row,
-- even if a grant were somehow added later. The trigger function is
-- SECURITY DEFINER and owned by the table owner, so it is unaffected (RLS is
-- not enforced against the owner unless FORCE ROW LEVEL SECURITY is set, and it
-- is not set here — deliberately, because the trigger is the only writer).
ALTER TABLE public.subscription_audit ENABLE ROW LEVEL SECURITY;

-- PostgREST exposes every table the anon/authenticated roles can touch, so the
-- revoke is not belt-and-braces: without it this table is a public log of who
-- pays for what. service_role is left out too — it has BYPASSRLS and would be
-- able to read every row over the network from any edge function.
REVOKE ALL ON TABLE public.subscription_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.subscription_audit FROM anon;
REVOKE ALL ON TABLE public.subscription_audit FROM authenticated;
REVOKE ALL ON TABLE public.subscription_audit FROM service_role;


-- -----------------------------------------------------------------------------
-- The trigger function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_row        public.accounts%ROWTYPE;
    v_op         text;
    v_new_tier       text;
    v_new_expires_at timestamptz;
    v_new_store      text;
    v_new_txn        text;
    v_new_synced_at  timestamptz;
    v_ctx        text;
    v_writer     text;
    v_headers    jsonb;
    v_jwt_role   text;
    v_session    text;
    v_user_agent text;
    v_client_ip  text;
BEGIN
    -- NEW is unassigned in a DELETE trigger and referencing any of its fields
    -- raises, even from inside a CASE arm that is not taken — PL/pgSQL has to
    -- supply the row as a query parameter before the expression runs. So the
    -- new-side values are read here, in the branch where NEW exists, and the
    -- INSERT below never mentions NEW at all.
    IF TG_OP = 'DELETE' THEN
        v_row := OLD;
        v_op  := 'DELETE';
        v_new_tier       := NULL;
        v_new_expires_at := NULL;
        v_new_store      := NULL;
        v_new_txn        := NULL;
        v_new_synced_at  := NULL;
    ELSE
        v_row := NEW;
        v_op  := 'UPDATE';
        v_new_tier       := NEW.subscription_tier;
        v_new_expires_at := NEW.subscription_expires_at;
        v_new_store      := NEW.subscription_store;
        v_new_txn        := NEW.original_transaction_id;
        v_new_synced_at  := NEW.revenuecat_synced_at;
    END IF;

    -- WHO WROTE THIS. PG_CONTEXT is the PL/pgSQL call stack, innermost first.
    -- Frame 1 is always subscription_audit_row itself; the first frame after it
    -- is the writer. When the UPDATE came from plain SQL (PostgREST issuing an
    -- UPDATE against the accounts table, which is what the admin panel PATCH
    -- and both web-checkout webhooks do) there is no second frame and
    -- writer_fn is NULL — which is precisely the signature worth spotting.
    BEGIN
        GET DIAGNOSTICS v_ctx = PG_CONTEXT;

        SELECT (regexp_match(f, 'function ([A-Za-z0-9_."]+)\('))[1]
          INTO v_writer
        FROM unnest(string_to_array(v_ctx, E'\n')) WITH ORDINALITY AS t(f, ord)
        WHERE ord > 1
          AND f ~ 'function [A-Za-z0-9_."]+\('
        ORDER BY ord
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_ctx    := NULL;
        v_writer := NULL;
    END;

    -- PostgREST request context. All three of these are absent for pg_cron, for
    -- the Dashboard SQL editor and for psql, so a NULL row here means "not a
    -- web request" rather than "unknown".
    BEGIN
        v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    BEGIN
        v_jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    EXCEPTION WHEN OTHERS THEN
        v_jwt_role := NULL;
    END;

    -- current_setting('role') reflects the SET LOCAL role PostgREST issues
    -- (anon / authenticated / service_role) and, unlike current_user, is NOT
    -- rewritten to the owner inside a SECURITY DEFINER function. It reads
    -- 'none' when nothing set it.
    v_session := nullif(nullif(current_setting('role', true), ''), 'none');
    IF v_session IS NULL THEN
        v_session := session_user::text;
    END IF;

    v_user_agent := v_headers ->> 'user-agent';
    v_client_ip  := coalesce(
        v_headers ->> 'cf-connecting-ip',
        v_headers ->> 'x-real-ip',
        split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)
    );
    v_client_ip := nullif(btrim(v_client_ip), '');

    INSERT INTO public.subscription_audit (
        account_id, account_uuid, op,
        old_tier, new_tier,
        old_expires_at, new_expires_at,
        old_store, new_store,
        old_txn, new_txn,
        old_synced_at, new_synced_at,
        writer_fn, pg_context,
        jwt_role, session_role, user_agent, client_ip,
        reason, actor
    ) VALUES (
        v_row.account_id,
        v_row.id,
        v_op,
        OLD.subscription_tier,        v_new_tier,
        OLD.subscription_expires_at,  v_new_expires_at,
        OLD.subscription_store,       v_new_store,
        OLD.original_transaction_id,  v_new_txn,
        OLD.revenuecat_synced_at,     v_new_synced_at,
        v_writer,
        v_ctx,
        v_jwt_role,
        v_session,
        v_user_agent,
        v_client_ip,
        nullif(current_setting('doppler.reason', true), ''),
        nullif(current_setting('doppler.actor',  true), '')
    );

    RETURN NULL;   -- AFTER trigger: return value is ignored
END;
$fn$;

COMMENT ON FUNCTION public.subscription_audit_row() IS
    'AFTER trigger on public.accounts. Writes one subscription_audit row per change to the '
    'five entitlement columns. Context reads (PG_CONTEXT, request.headers, request.jwt.claims) '
    'are individually guarded and degrade to NULL, but the INSERT itself is deliberately NOT '
    'guarded: if the trail cannot be written the subscription write rolls back with it, so an '
    'untracked change is impossible.';

-- Nothing may call this directly. It is a trigger function; PostgREST would
-- otherwise happily expose it because it lives in `public`.
REVOKE ALL ON FUNCTION public.subscription_audit_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.subscription_audit_row() FROM anon;
REVOKE ALL ON FUNCTION public.subscription_audit_row() FROM authenticated;
REVOKE ALL ON FUNCTION public.subscription_audit_row() FROM service_role;


-- -----------------------------------------------------------------------------
-- The triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_accounts_subscription_audit_upd ON public.accounts;

-- The WHEN clause is what keeps this off the hot path: an UPDATE that touches
-- only max_devices, or a bare updated_at bump, writes nothing.
--
-- revenuecat_synced_at is in the list on purpose. It is stamped by every claim,
-- so including it means a claim that changed nothing else is still recorded —
-- which is exactly what distinguishes "the client synced and agreed" from
-- "nobody called".
CREATE TRIGGER trg_accounts_subscription_audit_upd
AFTER UPDATE ON public.accounts
FOR EACH ROW
WHEN (
       OLD.subscription_tier         IS DISTINCT FROM NEW.subscription_tier
    OR OLD.subscription_expires_at   IS DISTINCT FROM NEW.subscription_expires_at
    OR OLD.subscription_store        IS DISTINCT FROM NEW.subscription_store
    OR OLD.original_transaction_id   IS DISTINCT FROM NEW.original_transaction_id
    OR OLD.revenuecat_synced_at      IS DISTINCT FROM NEW.revenuecat_synced_at
)
EXECUTE FUNCTION public.subscription_audit_row();

DROP TRIGGER IF EXISTS trg_accounts_subscription_audit_del ON public.accounts;

-- Deleting a free account is routine (delete_account exists and clients call
-- it). Deleting an account that still holds a paid entitlement is not, and the
-- ownership row it leaves behind outlives it.
CREATE TRIGGER trg_accounts_subscription_audit_del
AFTER DELETE ON public.accounts
FOR EACH ROW
WHEN (OLD.subscription_tier IS NOT NULL AND OLD.subscription_tier <> 'free')
EXECUTE FUNCTION public.subscription_audit_row();

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =============================================================================
-- VERIFY  (run after applying; all of these are read-only)
-- =============================================================================
--
-- 1. The table exists, RLS is on, and nobody holds a grant.
--
--    SELECT c.relrowsecurity AS rls_enabled,
--           (SELECT count(*) FROM pg_policies
--             WHERE schemaname='public' AND tablename='subscription_audit') AS n_policies,
--           c.relacl::text AS acl
--    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relname='subscription_audit';
--    -- expect: rls_enabled = t, n_policies = 0, acl = only the owner
--
-- 2. Both triggers are attached and enabled.
--
--    SELECT tgname, tgenabled, pg_get_triggerdef(oid)
--    FROM pg_trigger
--    WHERE tgrelid='public.accounts'::regclass AND NOT tgisinternal
--      AND tgname LIKE 'trg_accounts_subscription_audit%';
--    -- expect: 2 rows, tgenabled='O'
--
-- 3. End-to-end, on a row that does not matter. Pick a genuinely free account
--    with no txn and no expiry, and put it back afterwards. This is the ONLY
--    DML in this verification block and it is optional.
--
--    BEGIN;
--      SELECT set_config('doppler.reason','audit smoke test',true),
--             set_config('doppler.actor','<your name>',true);
--      UPDATE public.accounts
--         SET subscription_tier = 'pro',
--             subscription_expires_at = now() + interval '1 day'
--       WHERE account_id = '<SOME-FREE-TEST-ACCOUNT>';
--      SELECT account_id, op, old_tier, new_tier, writer_fn, jwt_role,
--             session_role, reason, actor, changed_at
--        FROM public.subscription_audit ORDER BY id DESC LIMIT 1;
--      -- expect one row, writer_fn NULL (plain SQL, no function in the stack),
--      -- reason 'audit smoke test'
--    ROLLBACK;   -- <- rolls back BOTH the account change and the audit row
--
-- 4. Once the batch is applied, this is the question the whole file exists for:
--
--    SELECT changed_at, account_id, old_tier, new_tier,
--           old_expires_at, new_expires_at, old_store, new_store,
--           writer_fn, jwt_role, reason, actor, client_ip
--    FROM public.subscription_audit
--    WHERE new_tier = 'free' AND old_tier IS DISTINCT FROM 'free'
--    ORDER BY changed_at DESC
--    LIMIT 50;
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   BEGIN;
--     DROP TRIGGER IF EXISTS trg_accounts_subscription_audit_upd ON public.accounts;
--     DROP TRIGGER IF EXISTS trg_accounts_subscription_audit_del ON public.accounts;
--     DROP FUNCTION IF EXISTS public.subscription_audit_row();
--     -- The table is kept on purpose: dropping it destroys the only evidence
--     -- of everything that happened while it was live. Drop it only if you
--     -- have decided that evidence is worthless.
--     -- DROP TABLE IF EXISTS public.subscription_audit;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- =============================================================================
