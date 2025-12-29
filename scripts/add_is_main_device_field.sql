-- =============================================================================
-- ADD is_main FIELD TO DEVICE SESSIONS
-- =============================================================================
-- Run this SQL in your Supabase Dashboard > SQL Editor
-- URL: https://supabase.com/dashboard/project/fzlrhmjdjjzcgstaeblu/sql
--
-- This migration:
-- 1. Adds is_main boolean column to device_sessions table
-- 2. Sets the first registered device for each account as the main device
-- 3. Updates register_device function to set is_main on first device
-- =============================================================================

-- =============================================================================
-- STEP 1: Add is_main column to device_sessions
-- =============================================================================

ALTER TABLE device_sessions
ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT false;

-- Add index for efficient main device lookups
CREATE INDEX IF NOT EXISTS idx_device_sessions_is_main
ON device_sessions(account_id, is_main) WHERE is_main = true;

-- =============================================================================
-- STEP 2: Set existing first devices as main devices
-- =============================================================================
-- For each account, mark the oldest device (first registered) as main

WITH first_devices AS (
  SELECT DISTINCT ON (account_id) id
  FROM device_sessions
  ORDER BY account_id, created_at ASC
)
UPDATE device_sessions
SET is_main = true
WHERE id IN (SELECT id FROM first_devices);

-- =============================================================================
-- STEP 3: Update register_device function to handle is_main
-- =============================================================================
-- The first device registered to an account becomes the main device

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS public.register_device(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_device(
  p_account_id TEXT,
  p_device_id TEXT,
  p_device_name TEXT,
  p_device_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_session device_sessions%ROWTYPE;
  v_device_count INT;
  v_is_first_device BOOLEAN;
BEGIN
  -- 1. Find account by text account_id
  SELECT * INTO v_account
  FROM accounts
  WHERE account_id = p_account_id;

  -- Account not found
  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Account not found'
    );
  END IF;

  -- 2. Check if this device already exists for this account
  SELECT * INTO v_session
  FROM device_sessions
  WHERE account_id = v_account.id AND device_id = p_device_id;

  IF v_session.id IS NOT NULL THEN
    -- Device exists, update last_active_at
    UPDATE device_sessions
    SET
      last_active_at = NOW(),
      device_name = p_device_name
    WHERE id = v_session.id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object(
      'success', true,
      'session', row_to_json(v_session),
      'account', row_to_json(v_account)
    );
  END IF;

  -- 3. New device - check device limit
  SELECT COUNT(*) INTO v_device_count
  FROM device_sessions
  WHERE account_id = v_account.id;

  IF v_device_count >= v_account.max_devices THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Maximum device limit reached',
      'current_devices', v_device_count,
      'max_devices', v_account.max_devices
    );
  END IF;

  -- 4. Check if this will be the first device (should be main)
  v_is_first_device := (v_device_count = 0);

  -- 5. Create new device session
  INSERT INTO device_sessions (
    account_id,
    device_id,
    device_name,
    device_type,
    is_main,
    last_active_at
  )
  VALUES (
    v_account.id,
    p_device_id,
    p_device_name,
    p_device_type,
    v_is_first_device,
    NOW()
  )
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'success', true,
    'session', row_to_json(v_session),
    'account', row_to_json(v_account)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.register_device(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.register_device(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- STEP 4: Update get_account_devices to include is_main
-- =============================================================================
-- Returns devices with is_main field for proper sorting/display

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS public.get_account_devices(TEXT);

CREATE OR REPLACE FUNCTION public.get_account_devices(p_account_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_devices JSONB;
BEGIN
  -- Find account
  SELECT * INTO v_account
  FROM accounts
  WHERE account_id = p_account_id;

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Account not found'
    );
  END IF;

  -- Get all devices for this account, main device first
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ds.id,
      'account_id', ds.account_id,
      'device_id', ds.device_id,
      'device_name', ds.device_name,
      'device_type', ds.device_type,
      'is_main', ds.is_main,
      'last_active_at', ds.last_active_at,
      'created_at', ds.created_at
    ) ORDER BY ds.is_main DESC, ds.created_at ASC
  ), '[]'::jsonb) INTO v_devices
  FROM device_sessions ds
  WHERE ds.account_id = v_account.id;

  RETURN jsonb_build_object(
    'success', true,
    'devices', v_devices,
    'account', row_to_json(v_account)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_account_devices(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_account_devices(TEXT) TO authenticated;

-- =============================================================================
-- STEP 5: Notify PostgREST to reload schema
-- =============================================================================

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION QUERIES (Optional - run to verify)
-- =============================================================================

-- Check is_main column exists:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'device_sessions' AND column_name = 'is_main';

-- Check main devices are set:
-- SELECT account_id, COUNT(*) as total_devices,
--        SUM(CASE WHEN is_main THEN 1 ELSE 0 END) as main_devices
-- FROM device_sessions
-- GROUP BY account_id;

-- View all devices with is_main status:
-- SELECT ds.device_name, ds.device_type, ds.is_main, ds.created_at, a.account_id
-- FROM device_sessions ds
-- JOIN accounts a ON ds.account_id = a.id
-- ORDER BY a.account_id, ds.is_main DESC, ds.created_at ASC;
