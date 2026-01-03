-- Migration: Add device status fields for cross-device visibility
-- This enables showing VPN/Filter/AdBlock status across all devices in the account

-- Add status columns to device_sessions table
ALTER TABLE device_sessions
ADD COLUMN IF NOT EXISTS vpn_connected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS filter_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS adblock_enabled BOOLEAN DEFAULT FALSE;

-- Create index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_device_sessions_account_status
ON device_sessions(account_id, vpn_connected, filter_enabled, adblock_enabled);

-- Create RPC function to update device status
-- This allows clients to update their status without direct table access
CREATE OR REPLACE FUNCTION update_device_status(
  p_account_id TEXT,
  p_device_id TEXT,
  p_vpn_connected BOOLEAN DEFAULT NULL,
  p_filter_enabled BOOLEAN DEFAULT NULL,
  p_adblock_enabled BOOLEAN DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_account_uuid UUID;
BEGIN
  -- Get the account UUID from account_id
  SELECT id INTO v_account_uuid
  FROM accounts
  WHERE account_id = p_account_id;

  IF v_account_uuid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Account not found');
  END IF;

  -- Update the device status
  UPDATE device_sessions
  SET
    vpn_connected = COALESCE(p_vpn_connected, vpn_connected),
    filter_enabled = COALESCE(p_filter_enabled, filter_enabled),
    adblock_enabled = COALESCE(p_adblock_enabled, adblock_enabled),
    last_active_at = NOW()
  WHERE account_id = v_account_uuid::TEXT AND device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Device not found');
  END IF;

  RETURN jsonb_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION update_device_status TO anon, authenticated;

-- Comment for documentation
COMMENT ON FUNCTION update_device_status IS 'Updates device status (VPN, Filter, AdBlock) for cross-device visibility';
