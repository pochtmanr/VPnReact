-- Reconcile the two original_transaction_id namespaces in subscription_ownership.
--
-- Background
-- ----------
-- Two writers claim App Store subscriptions, and until 2026-08-16 they used
-- different keys for the same subscription:
--
--   * the RevenueCat webhook (landing/supabase/functions/revenuecat-webhook)
--     writes event.original_transaction_id -- Apple's real numeric id;
--   * the iOS client wrote a synthetic "<product_id>_<originalPurchaseDate>",
--     because the RevenueCat SDK does not expose Apple's value (SK1StoreTransaction
--     captures only transactionIdentifier and discards `original`).
--
-- claim_subscription locks ownership with
--   WHERE original_transaction_id = p_original_transaction_id
-- so the two namespaces are invisible to each other. One subscription produced
-- two rows, and cross-account resale/restore detection could be defeated by
-- approaching from the other namespace.
--
-- At the time of writing: 36 synthetic + 26 Apple rows for store='app_store',
-- with 24 accounts holding both. Every one of those pairs was verified to agree
-- on current owner, original owner and product_id, and no synthetic row carried
-- transfer history -- so the synthetic rows hold no information the Apple rows
-- lack, and can be dropped rather than merged.
--
-- The client fix (AppStoreOriginalTransaction in SubscriptionSyncService.swift)
-- makes new claims use Apple's id, so this backfill is one-shot.
--
-- Scope: store='app_store' ONLY. The 24 play_store rows are all synthetic and
-- self-consistent -- there is no second writer for them -- so they are left alone.

BEGIN;

-- Pair each synthetic app_store row with the Apple row for the same account and
-- product. Recorded first so the DELETE and the accounts UPDATE below operate on
-- exactly the same set.
CREATE TEMP TABLE _dupe_pairs ON COMMIT DROP AS
SELECT s.id            AS synthetic_row_id,
       s.original_transaction_id AS synthetic_txn_id,
       a.original_transaction_id AS apple_txn_id,
       s.current_owner_account_id AS account_id
FROM public.subscription_ownership s
JOIN public.subscription_ownership a
  ON a.current_owner_account_id = s.current_owner_account_id
 AND a.product_id IS NOT DISTINCT FROM s.product_id
 AND a.store = 'app_store'
 AND a.original_transaction_id ~ '^[0-9]+$'
WHERE s.store = 'app_store'
  AND s.original_transaction_id !~ '^[0-9]+$'
  -- Never collapse a row that carries provenance the Apple row would lose.
  AND s.transferred_from_account_id IS NULL
  AND s.original_owner_account_id IS NOT DISTINCT FROM a.original_owner_account_id;

-- Repoint accounts at the surviving key. claim_subscription only sets
-- accounts.original_transaction_id on its INSERT branch, so whichever writer
-- claimed *second* left the account pointing at its own namespace -- in practice
-- 21 accounts point at a synthetic id and none at an Apple id.
UPDATE public.accounts acc
SET original_transaction_id = p.apple_txn_id,
    updated_at = NOW()
FROM _dupe_pairs p
WHERE acc.account_id = p.account_id
  AND acc.original_transaction_id = p.synthetic_txn_id;

-- subscription_events references the transaction id as a plain column (no FK), so
-- rewrite history too rather than leaving orphaned event rows behind.
UPDATE public.subscription_events e
SET original_transaction_id = p.apple_txn_id
FROM _dupe_pairs p
WHERE e.original_transaction_id = p.synthetic_txn_id;

DELETE FROM public.subscription_ownership o
USING _dupe_pairs p
WHERE o.id = p.synthetic_row_id;

-- Guard: after this runs, no app_store account may hold both namespaces.
DO $$
DECLARE
    v_remaining INT;
BEGIN
    SELECT count(*) INTO v_remaining
    FROM (
        SELECT current_owner_account_id
        FROM public.subscription_ownership
        WHERE store = 'app_store'
        GROUP BY current_owner_account_id
        HAVING bool_or(original_transaction_id ~ '^[0-9]+$')
           AND bool_or(original_transaction_id !~ '^[0-9]+$')
    ) g;

    IF v_remaining > 0 THEN
        RAISE EXCEPTION
            'Reconciliation incomplete: % account(s) still hold both id namespaces. Inspect before retrying.',
            v_remaining;
    END IF;
END $$;

COMMIT;
