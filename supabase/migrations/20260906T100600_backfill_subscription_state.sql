-- PROPOSAL — not yet applied; apply only after VPnReact/supabase/live/2026-09-06-subscription-rpcs.sql exists and the body below has been reconciled against the live dump
-- =============================================================================
-- 20260906T100600 — backfill: restore truncated web terms, then sweep once
-- =============================================================================
--
-- *** THIS IS THE ONLY FILE IN THE BATCH THAT RUNS DML ON accounts. ***
-- *** RUN IT INTERACTIVELY, STEP BY STEP. DO NOT PASTE IT WHOLE.    ***
--
-- Steps 1 and 2 are read-only. Steps 3, 4 and 5 are live and are each marked
--     <<< OPERATOR: ... >>>
-- Step 3 is the repair and is expected to change NOTHING. Step 4 runs the
-- widened sweeper once by hand. Step 5 asserts that nothing is left stuck.
--
-- There is a HARD STOP between step 3 and step 4: migration T100500 must be
-- applied in between. See THE APPLY ORDER below.
--
-- =============================================================================
-- THE APPLY ORDER — this file is SPLIT ACROSS the T100500 migration
-- =============================================================================
-- This is the single true order. T100500's header states the same sequence;
-- if the two ever disagree, THIS block and T100500's are both wrong and must be
-- fixed together.
--
--   1.  apply 20260906T100000_subscription_audit.sql       (required: nothing
--                                                           below is reversible
--                                                           without the trail)
--   2.  apply 20260906T100100_lock_sync_subscription.sql
--   3.  apply 20260906T100200_claim_subscription_guards.sql
--   4.  apply 20260906T100300_revoke_subscription_guards.sql
--   5.  apply 20260906T100400_admin_subscription_rpcs.sql
--
--   6.  >>> THIS FILE, STEPS 1-3 <<<   temp table -> REVIEW -> REPAIR
--       Restores any web-checkout term that was truncated. Must happen BEFORE
--       the sweeper is widened, or a truncated row gets swept to free and the
--       evidence that it was ever paid stops being actionable.
--
--   7.  apply 20260906T100500_downgrade_expired_subscriptions.sql
--       DEFINE ONLY — it changes a function pg_cron already calls every six
--       hours, so from this moment the widened sweep WILL happen on its own
--       within six hours whether or not step 8 is run.
--
--   8.  >>> THIS FILE, STEPS 4-5 <<<   one manual sweep -> ASSERT
--       Runs the widened sweeper immediately, with somebody watching, instead
--       of waiting for the cron tick.
--
-- Why the split: step 6 must precede step 7 (repair before sweep), and step 8
-- cannot run before step 7 (the widened body has to exist). There is no
-- ordering of whole files that satisfies both, so this file is deliberately
-- run in two sittings.
--
-- It must be run in ONE SQL Editor SESSION across both sittings, because step 1
-- creates a TEMP table that steps 2 and 3 read. A temp table lives for the
-- session, so opening a new editor tab between steps loses it. If that happens,
-- re-run step 1 — it is idempotent and read-only.
--
-- =============================================================================
-- PART 7B — reconstruct what web-checkout customers actually paid for
-- =============================================================================
--
-- WHY A RECONSTRUCTION IS POSSIBLE AT ALL
--   Web checkout never goes through claim_subscription. Both webhooks
--   (landing/src/app/api/oxapay/webhook/route.ts:144-168,
--   revolut/webhook/route.ts:191-216) do a raw UPDATE on accounts and insert a
--   vpn_invoices row. The invoice row is the receipt, and it survives every
--   writer that has ever mangled the account row. Its `plan` column is
--   `${planId}:${accountId}` and its `created_at` is when the money arrived.
--
--   Plan lengths, from the webhooks' shared PLAN_DAYS map. Web plans bake in
--   trial compensation because web checkout cannot replicate the 3-day store
--   trial: monthly 30+7 = 37, 6month 180+14 = 194, yearly 365+30 = 395.
--
-- WHAT "FLOOR" MEANS, AND WHY IT IS A FLOOR
--   entitled_until_floor = max over that account's paid invoices of
--   (created_at + plan days). It deliberately does NOT model stacking: a
--   customer who bought two monthlies a week apart is entitled past the max of
--   the two individual terms, not to it. So the floor UNDER-states the term.
--   That asymmetry is the point — this backfill may only ever RESTORE time, and
--   an under-stated floor cannot take any away.
--
-- EXPECTED RESULT: ZERO REPAIRS.
--   All 14 paid-but-lapsed rows are legitimately expired monthlies. The one
--   live paid web account, VPN-CKC4-…, is pro to 2026-12-05 and already
--   agrees with its invoice. If step 2 returns rows, something has been
--   truncated and it is worth understanding WHICH writer did it — the audit
--   trail from 20260906T100000 will say, for anything that happens from now on.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 — build the reconstruction (read-only; creates a TEMP table)
-- -----------------------------------------------------------------------------
-- Schema-qualified to pg_temp on purpose: an unqualified DROP would resolve
-- through search_path and could hit a PERMANENT public.web_invoice_terms if one
-- ever existed. This must only ever drop this session's own scratch table.
DROP TABLE IF EXISTS pg_temp.web_invoice_terms;

CREATE TEMP TABLE web_invoice_terms AS
WITH paid AS (
    SELECT
        split_part(plan, ':', 1) AS plan_id,
        split_part(plan, ':', 2) AS account_id,
        provider,
        created_at
    FROM public.vpn_invoices
    WHERE status = 'paid'
      -- Anchored on both ends. A plan string that does not match this exactly
      -- is not something this backfill understands, and guessing at it is how
      -- a backfill grants a year to the wrong person. dump-queries §7 lists
      -- every paid invoice that fails this regex; if that list is non-empty,
      -- widen the regex deliberately before trusting anything below.
      AND plan ~ '^(monthly|6month|yearly):VPN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
),
termed AS (
    SELECT
        account_id,
        provider,
        created_at,
        plan_id,
        CASE plan_id
            WHEN 'monthly' THEN 37     -- 30 + 7 trial compensation
            WHEN '6month'  THEN 194    -- 180 + 14
            WHEN 'yearly'  THEN 395    -- 365 + 30
        END AS days
    FROM paid
)
SELECT
    account_id,
    max(created_at + make_interval(days => days))              AS entitled_until_floor,
    count(*)                                                   AS paid_invoices,
    max(created_at)                                            AS last_paid_at,
    (array_agg(provider ORDER BY created_at DESC))[1]          AS last_provider,
    (array_agg(plan_id  ORDER BY created_at DESC))[1]          AS last_plan
FROM termed
GROUP BY account_id;

-- Sanity: how many accounts were reconstructed, and how many still have a live
-- floor. Compare against dump-queries §7's pre-change count.
SELECT count(*)                                                    AS accounts_with_paid_invoices,
       count(*) FILTER (WHERE entitled_until_floor > now())         AS floor_still_in_future,
       min(entitled_until_floor)                                    AS earliest_floor,
       max(entitled_until_floor)                                    AS latest_floor
FROM web_invoice_terms;


-- -----------------------------------------------------------------------------
-- STEP 2 — REVIEW. Read this output before running step 3.
-- -----------------------------------------------------------------------------
-- Every row here is an account that PAID for a term still running, whose
-- accounts row disagrees. `disagreement` says how.
--
-- EXPECTED: zero rows.
SELECT
    a.account_id,
    a.subscription_tier,
    a.subscription_store,
    a.subscription_expires_at,
    t.entitled_until_floor,
    t.entitled_until_floor - coalesce(a.subscription_expires_at, '-infinity'::timestamptz)
                                              AS shortfall,
    t.paid_invoices,
    t.last_paid_at,
    t.last_provider,
    t.last_plan,
    a.updated_at,
    CASE
        WHEN a.subscription_tier IS NULL OR a.subscription_tier = 'free'
             THEN 'tier is free but a paid term is still running'
        WHEN a.subscription_expires_at IS NULL
             THEN 'tier is pro but expiry was nulled'
        ELSE 'expiry is earlier than the paid term'
    END                                       AS disagreement
FROM web_invoice_terms t
JOIN public.accounts a ON a.account_id = t.account_id
WHERE t.entitled_until_floor > now()
  AND (
        a.subscription_tier IS NULL
     OR a.subscription_tier = 'free'
     OR a.subscription_expires_at IS NULL
     OR a.subscription_expires_at < t.entitled_until_floor
  )
ORDER BY shortfall DESC;

-- The other half of the picture: paid web accounts that are legitimately
-- expired. These must NOT be repaired; they are listed so that "14 paid rows,
-- 0 repairs" can be shown to add up rather than asserted.
SELECT
    a.account_id, a.subscription_tier, a.subscription_store,
    a.subscription_expires_at, t.entitled_until_floor,
    now() - t.entitled_until_floor AS expired_for
FROM web_invoice_terms t
JOIN public.accounts a ON a.account_id = t.account_id
WHERE t.entitled_until_floor <= now()
ORDER BY t.entitled_until_floor DESC;


-- -----------------------------------------------------------------------------
-- STEP 3 — REPAIR.  <<< OPERATOR: run after reviewing the SELECT above >>>
-- -----------------------------------------------------------------------------
-- If STEP 2 returned NO rows, this transaction updates nothing and the COMMIT
-- is a no-op. That is the expected outcome. Run it anyway — a no-op COMMIT is
-- cheaper than a skipped step somebody has to reason about later.
--
-- If STEP 2 DID return rows, read them first. This is a live UPDATE on
-- accounts, and it is the only DML on accounts in the entire 2026-09-06 batch.
--
-- GREATEST(current, floor) — this can only ever move an expiry FORWARD. It
-- never shortens, never downgrades, and never touches an account whose row
-- already agrees.
--
-- Set the actor to your own name before running.

BEGIN;

SELECT set_config('doppler.reason',
                  'backfill 2026-09-06: paid web invoice term restored', true),
       set_config('doppler.actor', '(set me)', true);

UPDATE public.accounts a SET
    subscription_tier       = 'pro',
    subscription_expires_at = GREATEST(
                                  coalesce(a.subscription_expires_at, t.entitled_until_floor),
                                  t.entitled_until_floor),
    -- Only fills a NULL store. An account that already says app_store or
    -- oxapay keeps saying it; this backfill is evidence about the TERM, not
    -- about the channel.
    subscription_store      = coalesce(a.subscription_store, t.last_provider),
    updated_at              = now()
FROM web_invoice_terms t
WHERE a.account_id = t.account_id
  AND t.entitled_until_floor > now()
  AND (
        a.subscription_tier IS NULL
     OR a.subscription_tier = 'free'
     OR a.subscription_expires_at IS NULL
     OR a.subscription_expires_at < t.entitled_until_floor
  );

-- Read what the repair actually did, from the audit trail it just wrote.
-- Expect: one row per repair, writer_fn NULL (plain SQL, no function in the
-- stack), and every new_expires_at >= its old_expires_at. Zero rows is the
-- expected result overall.
SELECT account_id, old_tier, new_tier, old_expires_at, new_expires_at,
       old_store, new_store, writer_fn, reason, actor
FROM public.subscription_audit
WHERE reason = 'backfill 2026-09-06: paid web invoice term restored'
ORDER BY id DESC;

COMMIT;
-- ^ If the audit rows above are NOT what you expect, run ROLLBACK instead of
--   COMMIT. The temp table survives either way: step 1 was not inside this
--   transaction.


-- =============================================================================
-- ===  STOP.  Apply 20260906T100500_downgrade_expired_subscriptions.sql now. ===
-- ===  Then come back and run steps 4 and 5 in THIS SAME SESSION.           ===
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 7A — STEP 4.  <<< OPERATOR: run only after applying T100500 >>>
-- -----------------------------------------------------------------------------
-- Run the widened sweeper ONCE, by hand. It would run on its own within six
-- hours anyway; running it here means it happens while somebody is watching,
-- immediately after the repair, with the before/after in the same session.
--
-- If T100500 has NOT been applied, this calls the OLD store-filtered body and
-- silently does nothing useful — which is why the guard below refuses to run.

DO $precheck$
DECLARE
    v_def   text;
    v_code  text;
    v_upd   text;
    v_where text;
BEGIN
    v_def := pg_get_functiondef('public.downgrade_expired_subscriptions()'::regprocedure);

    -- Strip -- line comments before asserting anything. The installed body is
    -- full of prose that legitimately mentions the very identifiers this
    -- precheck looks for ("PRESERVED: … original_transaction_id …"), and
    -- matching on prose is how a precheck starts lying.
    v_code := regexp_replace(v_def, '--[^' || E'\n' || ']*', '', 'g');

    -- ASSERTION 1 — the functional change is present.
    --
    -- Anchor on the sweep's OWN statement, not on the body as a whole. An
    -- earlier version took "everything after the last WHERE", which is sound
    -- only while the UPDATE happens to hold the last WHERE in the function: any
    -- trailing SELECT … WHERE or INSERT … WHERE in the live body would shift
    -- the window past the store predicate and wave an un-widened sweeper
    -- through.
    --
    -- So: first take the UPDATE … accounts statement, from its keyword to its
    -- terminating semicolon (non-greedy, so it stops at the first `;`), then
    -- take that statement's own predicate — everything after the FIRST `WHERE`
    -- inside it. The SET list is excluded by construction, which matters
    -- because the SET list legitimately contains `subscription_store = NULL`.
    v_upd := substring(v_code from '(?is)UPDATE\s+(?:public\.)?accounts\y.*?;');

    IF v_upd IS NULL THEN
        RAISE EXCEPTION
            'ABORT: could not locate an `UPDATE … accounts …;` statement in downgrade_expired_subscriptions. The live body does not have the shape this precheck understands — read it yourself and confirm the store predicate is gone before running the sweep by hand.';
    END IF;

    v_where := regexp_replace(v_upd, '(?is)^.*?WHERE', '');

    IF v_where ILIKE '%subscription_store%'
       OR v_where ILIKE '%original_transaction_id%'
       OR v_where ILIKE '%subscription_claimed_at%'
       OR v_where ILIKE '%revenuecat_synced_at%' THEN
        RAISE EXCEPTION
            'ABORT: downgrade_expired_subscriptions still filters on a store/ownership column. 20260906T100500 has not been applied, or its EDIT 1 (delete the store predicate) was not made. Predicate found: %',
            btrim(v_where);
    END IF;

    -- ASSERTION 2 — the audit marker is present.
    -- 20260906T100500 EDIT 2 makes this literal MANDATORY. It is asserted
    -- separately from assertion 1 so the failure message says which edit is
    -- missing rather than leaving you to guess.
    IF v_code NOT LIKE '%expiry sweep%' THEN
        RAISE EXCEPTION
            'ABORT: downgrade_expired_subscriptions does not set doppler.reason = ''expiry sweep''. That line is MANDATORY (20260906T100500 EDIT 2) — without it every row this sweep touches lands in subscription_audit with no reason.';
    END IF;

    -- Both assertions are TEXT assertions on a body nobody has dumped yet.
    --
    -- What they DO cover: the predicate of the first `UPDATE … accounts …;`
    -- statement in the body, with the SET list and every other statement
    -- excluded by the anchoring above.
    --
    -- What they DO NOT cover: a body that filters the sweep somewhere other
    -- than that predicate — a second UPDATE, a cursor loop, a CTE, or a
    -- subquery carrying its own WHERE inside the SET list. If the dump shows
    -- any of those shapes, this precheck is not evidence and you must read the
    -- predicate yourself.
    --
    -- A false abort is also possible, and is the safe direction: it stops and
    -- prints the predicate it found, so you can read it and decide.
    RAISE NOTICE 'precheck OK: the sweeper is widened and stamps doppler.reason.';
END
$precheck$;

SELECT set_config('doppler.actor', '(set me)', true);

SELECT public.downgrade_expired_subscriptions();
-- expect {"success":true,"downgraded":N,...} where N is close to the count the
-- T100500 guard block printed as a NOTICE.

-- What it just swept, in full. Every row should be a revolut/oxapay account
-- 4-111 days past expiry. A store row here is expected too: those were inside
-- the 3-day grace before and are not now.
SELECT changed_at, account_id, old_tier, old_store, old_expires_at,
       now() - old_expires_at AS was_overdue_by, reason
FROM public.subscription_audit
WHERE writer_fn = 'downgrade_expired_subscriptions'
  AND changed_at > now() - interval '10 minutes'
ORDER BY changed_at;


-- -----------------------------------------------------------------------------
-- STEP 5 — ASSERT.  <<< OPERATOR: run immediately after step 4 >>>
-- -----------------------------------------------------------------------------
-- Raises if the sweep did not finish the job. Nothing may be left pro more than
-- three days past its expiry.

DO $assert$
DECLARE
    v_n    integer;
    v_list text;
BEGIN
    SELECT count(*),
           string_agg(account_id || ' (' || coalesce(subscription_store, 'null')
                      || ', ' || (now() - subscription_expires_at)::text || ' overdue)', E'\n')
      INTO v_n, v_list
    FROM public.accounts
    WHERE subscription_tier IS NOT NULL
      AND subscription_tier <> 'free'
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at < now() - interval '3 days';

    IF v_n <> 0 THEN
        -- Exactly one % per argument, and no %% anywhere. RAISE counts
        -- placeholders against arguments and errors on a mismatch — which
        -- would replace this assertion's message with a complaint about the
        -- assertion itself, at precisely the moment it has something to say.
        RAISE EXCEPTION
            'ASSERT FAILED: % account(s) still pro more than 3 days past expiry: %',
            v_n, v_list;
    END IF;

    RAISE NOTICE 'ASSERT OK: no account is pro more than 3 days past its expiry.';
END
$assert$;

-- Also worth reading, and deliberately NOT an assertion — a small number here
-- is normal, because rows inside the 3-day grace have not been swept yet:
SELECT account_id, subscription_store, subscription_expires_at,
       now() - subscription_expires_at AS overdue_by
FROM public.accounts
WHERE subscription_tier IS NOT NULL
  AND subscription_tier <> 'free'
  AND subscription_expires_at IS NOT NULL
  AND subscription_expires_at < now()
ORDER BY subscription_expires_at;


-- -----------------------------------------------------------------------------
-- CLEANUP
-- -----------------------------------------------------------------------------
--   DROP TABLE IF EXISTS pg_temp.web_invoice_terms;
--   (or just close the session — a TEMP table does not outlive it)


-- =============================================================================
-- ROLLBACK — from subscription_audit, which is why 20260906T100000 goes first
-- =============================================================================
--
-- Undo the STEP 3 repair. Restores each repaired account to exactly the values
-- it held immediately before, reading them out of the trail the repair wrote:
--
--   BEGIN;
--     SELECT set_config('doppler.reason',
--                       'rollback of backfill 2026-09-06', true),
--            set_config('doppler.actor', '<your name>', true);
--
--     UPDATE public.accounts a SET
--         subscription_tier       = s.old_tier,
--         subscription_expires_at = s.old_expires_at,
--         subscription_store      = s.old_store,
--         updated_at              = now()
--     FROM public.subscription_audit s
--     WHERE s.reason = 'backfill 2026-09-06: paid web invoice term restored'
--       AND s.account_id = a.account_id
--       AND s.id = (
--             SELECT max(x.id) FROM public.subscription_audit x
--             WHERE x.account_id = a.account_id
--               AND x.reason = 'backfill 2026-09-06: paid web invoice term restored'
--           );
--
--     SELECT account_id, subscription_tier, subscription_expires_at, subscription_store
--     FROM public.accounts
--     WHERE account_id IN (
--         SELECT account_id FROM public.subscription_audit
--         WHERE reason = 'backfill 2026-09-06: paid web invoice term restored'
--     );
--   ROLLBACK;   -- <- change to COMMIT when the above is right
--
-- Undo the STEP 4 sweep: see the ROLLBACK section of
-- 20260906T100500_downgrade_expired_subscriptions.sql. Note that reversing the
-- sweep restores rows to pro-with-a-past-expiry, which the server treats as NOT
-- entitled anyway (the four-conjunct rule in §1). Reversing it changes what the
-- row SAYS, not what the customer can do.
--
-- =============================================================================
