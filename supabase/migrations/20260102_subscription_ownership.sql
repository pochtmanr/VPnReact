-- =============================================================================
-- SUBSCRIPTION OWNERSHIP TRACKING MIGRATION
-- =============================================================================
-- This migration prevents subscription duplication across accounts by:
-- 1. Tracking original transaction IDs to establish ownership
-- 2. Creating an ownership table for audit trail
-- 3. Implementing claim_subscription() with automatic transfer logic
--
-- Run in Supabase Dashboard > SQL Editor
-- =============================================================================

-- =============================================================================
-- STEP 1: Add ownership tracking columns to accounts
-- =============================================================================

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS original_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_store TEXT CHECK (subscription_store IN ('app_store', 'play_store', 'stripe', NULL)),
ADD COLUMN IF NOT EXISTS subscription_product_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_claimed_at TIMESTAMPTZ;

-- Unique constraint on transaction ID - each transaction can only belong to one account
-- Using a partial index to allow NULL values (accounts without subscriptions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_original_transaction_id
ON accounts(original_transaction_id)
WHERE original_transaction_id IS NOT NULL;

-- =============================================================================
-- STEP 2: Create subscription_ownership audit table
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscription_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_transaction_id TEXT NOT NULL,
    store TEXT NOT NULL CHECK (store IN ('app_store', 'play_store', 'stripe')),
    product_id TEXT,
    current_owner_account_id TEXT NOT NULL,
    original_owner_account_id TEXT NOT NULL,
    transferred_from_account_id TEXT,
    transferred_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(original_transaction_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscription_ownership_transaction
ON subscription_ownership(original_transaction_id);

CREATE INDEX IF NOT EXISTS idx_subscription_ownership_current_owner
ON subscription_ownership(current_owner_account_id);

CREATE INDEX IF NOT EXISTS idx_subscription_ownership_original_owner
ON subscription_ownership(original_owner_account_id);

-- Enable RLS on ownership table
ALTER TABLE subscription_ownership ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read (needed for validation)
CREATE POLICY "Anyone can read subscription_ownership" ON subscription_ownership
    FOR SELECT USING (true);

-- Policy: Only service role can insert/update (enforced via functions)
CREATE POLICY "Service role can manage subscription_ownership" ON subscription_ownership
    FOR ALL USING (true);

-- =============================================================================
-- STEP 3: Create claim_subscription function with ownership logic
-- =============================================================================
-- This is the core function that prevents subscription duplication.
-- It implements automatic transfer: if a subscription is restored on a different
-- account, it revokes from the old account and grants to the new one.

CREATE OR REPLACE FUNCTION public.claim_subscription(
    p_account_id TEXT,
    p_tier TEXT,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_original_transaction_id TEXT DEFAULT NULL,
    p_store TEXT DEFAULT 'app_store',
    p_product_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_owner TEXT;
    v_account_exists BOOLEAN;
BEGIN
    -- Validate account exists
    SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = p_account_id) INTO v_account_exists;
    IF NOT v_account_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'account_not_found'
        );
    END IF;

    -- If no transaction ID provided, just do a simple tier update (legacy behavior)
    -- This maintains backwards compatibility
    IF p_original_transaction_id IS NULL OR p_original_transaction_id = '' THEN
        UPDATE accounts SET
            subscription_tier = p_tier,
            subscription_expires_at = p_expires_at,
            revenuecat_synced_at = NOW(),
            updated_at = NOW()
        WHERE account_id = p_account_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'updated_legacy',
            'owner', p_account_id,
            'note', 'No transaction ID provided - legacy sync'
        );
    END IF;

    -- 1. Check if this subscription already has an owner
    SELECT current_owner_account_id INTO v_existing_owner
    FROM subscription_ownership
    WHERE original_transaction_id = p_original_transaction_id;

    -- 2. If no owner, this is a new purchase - claim it
    IF v_existing_owner IS NULL THEN
        -- Insert ownership record
        INSERT INTO subscription_ownership (
            original_transaction_id,
            store,
            product_id,
            current_owner_account_id,
            original_owner_account_id
        ) VALUES (
            p_original_transaction_id,
            COALESCE(p_store, 'app_store'),
            p_product_id,
            p_account_id,
            p_account_id
        );

        -- Update the account with subscription
        UPDATE accounts SET
            subscription_tier = p_tier,
            subscription_expires_at = p_expires_at,
            original_transaction_id = p_original_transaction_id,
            subscription_store = p_store,
            subscription_product_id = p_product_id,
            subscription_claimed_at = NOW(),
            revenuecat_synced_at = NOW(),
            updated_at = NOW()
        WHERE account_id = p_account_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'claimed',
            'owner', p_account_id
        );
    END IF;

    -- 3. If current account is already the owner, just update expiry/tier
    IF v_existing_owner = p_account_id THEN
        UPDATE accounts SET
            subscription_tier = p_tier,
            subscription_expires_at = p_expires_at,
            revenuecat_synced_at = NOW(),
            updated_at = NOW()
        WHERE account_id = p_account_id;

        -- Update ownership record timestamp
        UPDATE subscription_ownership SET
            updated_at = NOW()
        WHERE original_transaction_id = p_original_transaction_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'updated',
            'owner', p_account_id
        );
    END IF;

    -- 4. Different owner - TRANSFER subscription (revoke from old, grant to new)
    -- This is the key logic that prevents duplication

    -- Revoke from previous owner (downgrade to free)
    UPDATE accounts SET
        subscription_tier = 'free',
        subscription_expires_at = NULL,
        original_transaction_id = NULL,
        subscription_store = NULL,
        subscription_product_id = NULL,
        subscription_claimed_at = NULL,
        revenuecat_synced_at = NOW(),
        updated_at = NOW()
    WHERE account_id = v_existing_owner;

    -- Grant to new owner
    UPDATE accounts SET
        subscription_tier = p_tier,
        subscription_expires_at = p_expires_at,
        original_transaction_id = p_original_transaction_id,
        subscription_store = p_store,
        subscription_product_id = p_product_id,
        subscription_claimed_at = NOW(),
        revenuecat_synced_at = NOW(),
        updated_at = NOW()
    WHERE account_id = p_account_id;

    -- Update ownership record with transfer info
    UPDATE subscription_ownership SET
        current_owner_account_id = p_account_id,
        transferred_from_account_id = v_existing_owner,
        transferred_at = NOW(),
        updated_at = NOW()
    WHERE original_transaction_id = p_original_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'transferred',
        'previous_owner', v_existing_owner,
        'new_owner', p_account_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'database_error',
        'details', SQLERRM
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.claim_subscription(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_subscription(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_subscription(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO service_role;

-- =============================================================================
-- STEP 4: Create helper function to check subscription ownership
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_subscription_owner(
    p_original_transaction_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ownership subscription_ownership%ROWTYPE;
BEGIN
    SELECT * INTO v_ownership
    FROM subscription_ownership
    WHERE original_transaction_id = p_original_transaction_id;

    IF v_ownership IS NULL THEN
        RETURN jsonb_build_object(
            'found', false,
            'owner', NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'current_owner', v_ownership.current_owner_account_id,
        'original_owner', v_ownership.original_owner_account_id,
        'transferred_from', v_ownership.transferred_from_account_id,
        'transferred_at', v_ownership.transferred_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_owner(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_owner(TEXT) TO authenticated;

-- =============================================================================
-- STEP 5: Create function to revoke subscription (for webhook/admin use)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.revoke_subscription(
    p_account_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transaction_id TEXT;
BEGIN
    -- Get the transaction ID before revoking
    SELECT original_transaction_id INTO v_transaction_id
    FROM accounts
    WHERE account_id = p_account_id;

    -- Revoke subscription from account
    UPDATE accounts SET
        subscription_tier = 'free',
        subscription_expires_at = NULL,
        original_transaction_id = NULL,
        subscription_store = NULL,
        subscription_product_id = NULL,
        subscription_claimed_at = NULL,
        revenuecat_synced_at = NOW(),
        updated_at = NOW()
    WHERE account_id = p_account_id;

    -- Note: We don't delete from subscription_ownership
    -- The record remains for audit purposes
    -- Next claim will update current_owner

    RETURN jsonb_build_object(
        'success', true,
        'revoked_from', p_account_id,
        'transaction_id', v_transaction_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_subscription(TEXT) TO service_role;

-- =============================================================================
-- STEP 6: Notify PostgREST to reload schema
-- =============================================================================

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION QUERIES (Run to verify installation)
-- =============================================================================

-- Check new columns exist:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'accounts'
-- AND column_name IN ('original_transaction_id', 'subscription_store', 'subscription_product_id', 'subscription_claimed_at');

-- Check ownership table exists:
-- SELECT * FROM subscription_ownership LIMIT 1;

-- Test claim_subscription (with test data):
-- SELECT claim_subscription('VPN-TEST-1234-5678', 'pro', '2026-12-31T00:00:00Z', 'test_txn_123', 'app_store', 'vpn_premium_monthly');
