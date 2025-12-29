-- =============================================================================
-- DELETE ACCOUNT FUNCTION
-- =============================================================================
-- Run this SQL in your Supabase Dashboard > SQL Editor
-- URL: https://supabase.com/dashboard/project/fzlrhmjdjjzcgstaeblu/sql

-- Function: delete_account
-- Permanently deletes an account and all associated data
CREATE OR REPLACE FUNCTION public.delete_account(p_account_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with owner privileges to bypass RLS
SET search_path = public
AS $$
DECLARE
  v_account_uuid UUID;
  v_account_exists BOOLEAN;
BEGIN
  -- Find account by account_id string (e.g., 'VPN-XXXX-XXXX-XXXX')
  SELECT id INTO v_account_uuid
  FROM accounts
  WHERE account_id = p_account_id;

  IF v_account_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account not found');
  END IF;

  -- Delete in order (respecting foreign key constraints)

  -- 1. Delete device sessions
  DELETE FROM device_sessions WHERE account_id = v_account_uuid;

  -- 2. Delete connection logs (if table exists)
  BEGIN
    DELETE FROM connection_logs WHERE account_id = v_account_uuid;
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip
    NULL;
  END;

  -- 3. Delete user favorites (if table exists)
  BEGIN
    DELETE FROM user_favorites WHERE user_id = v_account_uuid;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- 4. Delete the account itself
  DELETE FROM accounts WHERE id = v_account_uuid;

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.delete_account(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_account(TEXT) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Test the function (optional - uncomment to test)
-- SELECT delete_account('VPN-TEST-1234-5678');
