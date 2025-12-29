-- =============================================================================
-- COMPLETE ACCOUNT + SUBSCRIPTION MIGRATION
-- =============================================================================
-- Run this SQL in your Supabase Dashboard > SQL Editor
-- URL: https://supabase.com/dashboard/project/fzlrhmjdjjzcgstaeblu/sql
--
-- This migration:
-- 1. Adds subscription tracking columns to accounts
-- 2. Creates corrected delete_account function (with subscription blocking)
-- 3. Creates sync_subscription function for RevenueCat webhook/app sync
-- =============================================================================

-- =============================================================================
-- STEP 1: Add subscription tracking columns
-- =============================================================================

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revenuecat_synced_at TIMESTAMPTZ;

-- Add index for efficient subscription checks
CREATE INDEX IF NOT EXISTS idx_accounts_subscription
ON accounts(subscription_tier, subscription_expires_at);

-- =============================================================================
-- STEP 2: Delete Account Function (CORRECTED)
-- =============================================================================
-- Blocks deletion if active subscription exists
-- Uses correct column references based on actual schema:
--   - accounts.id (UUID) = primary key
--   - accounts.account_id (TEXT) = user-facing ID like "VPN-XXXX-XXXX-XXXX"
--   - device_sessions.account_id (UUID) = foreign key to accounts.id

CREATE OR REPLACE FUNCTION public.delete_account(p_account_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_uuid UUID;
  v_subscription_tier TEXT;
  v_subscription_expires TIMESTAMPTZ;
BEGIN
  -- 1. Find account by text account_id, get UUID and subscription info
  SELECT id, subscription_tier, subscription_expires_at
  INTO v_account_uuid, v_subscription_tier, v_subscription_expires
  FROM accounts
  WHERE account_id = p_account_id;

  -- 2. Account not found
  IF v_account_uuid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'account_not_found'
    );
  END IF;

  -- 3. Check for active subscription (BLOCKING RULE)
  -- Block if tier is not 'free' AND (no expiration date OR expiration is in future)
  IF v_subscription_tier IS DISTINCT FROM 'free' AND v_subscription_tier IS NOT NULL THEN
    IF v_subscription_expires IS NULL OR v_subscription_expires > NOW() THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'active_subscription',
        'subscription_tier', v_subscription_tier,
        'expires_at', v_subscription_expires
      );
    END IF;
  END IF;

  -- 4. Safe to delete - remove related data first

  -- Delete device sessions (uses UUID foreign key to accounts.id)
  DELETE FROM device_sessions WHERE account_id = v_account_uuid;

  -- Delete bug reports (uses TEXT account_id)
  DELETE FROM bug_reports WHERE account_id = p_account_id;

  -- Delete connection logs if they reference this account (user_id is UUID)
  BEGIN
    DELETE FROM connection_logs WHERE user_id = v_account_uuid;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL; -- Table/column doesn't exist, skip
  END;

  -- Delete user favorites if they exist (user_id is UUID)
  BEGIN
    DELETE FROM user_favorites WHERE user_id = v_account_uuid;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  -- 5. Delete the account itself
  DELETE FROM accounts WHERE id = v_account_uuid;

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'database_error',
    'details', SQLERRM
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.delete_account(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_account(TEXT) TO authenticated;

-- =============================================================================
-- STEP 3: Sync Subscription Function
-- =============================================================================
-- Called by the app after purchase/restore to update subscription cache
-- Also can be called by RevenueCat webhook via Edge Function

CREATE OR REPLACE FUNCTION public.sync_subscription(
  p_account_id TEXT,
  p_tier TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE accounts
  SET
    subscription_tier = p_tier,
    subscription_expires_at = p_expires_at,
    revenuecat_synced_at = NOW(),
    updated_at = NOW()
  WHERE account_id = p_account_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tier', p_tier,
    'expires_at', p_expires_at
  );
END;
$$;

-- Grant to anon for app usage, service_role for webhooks
GRANT EXECUTE ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription(TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- =============================================================================
-- STEP 4: Notify PostgREST to reload schema
-- =============================================================================

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION QUERIES (Optional - run to verify)
-- =============================================================================

-- Check columns exist:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'accounts' AND column_name IN ('subscription_expires_at', 'revenuecat_synced_at');

-- Test delete_account (with non-existent account):
-- SELECT delete_account('VPN-TEST-1234-5678');

-- Test sync_subscription:
-- SELECT sync_subscription('VPN-ZUHA-FM5B-VXHD', 'pro', '2025-12-31T00:00:00Z');
