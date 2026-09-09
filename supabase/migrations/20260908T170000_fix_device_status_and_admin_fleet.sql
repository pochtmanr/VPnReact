-- =============================================================================
-- 20260908T170000 — fix update_device_status uuid compare + admin device fleet
-- =============================================================================
--
-- WHY
--   1. update_device_status compared device_sessions.account_id (uuid) to
--      v_account_uuid::text. Postgres has no uuid = text operator, so every
--      client write of vpn_connected failed and the column stayed false.
--   2. The admin Devices tab scanned device_sessions through PostgREST, which
--      silently caps a response at 1000 rows. Stats, "new in 30d", and the
--      12-week chart were computed from the oldest thousand rows only.
--
-- WHAT
--   Fix the uuid comparison. Add admin_device_fleet_stats and
--   admin_list_devices (service_role only) so the panel aggregates in SQL
--   and sorts VPN-on + Pro first.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_device_status(
  p_account_id text,
  p_device_id text,
  p_vpn_connected boolean DEFAULT NULL,
  p_filter_enabled boolean DEFAULT NULL,
  p_adblock_enabled boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_account_uuid uuid;
BEGIN
  SELECT id INTO v_account_uuid
  FROM accounts
  WHERE account_id = p_account_id;

  IF v_account_uuid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Account not found');
  END IF;

  UPDATE device_sessions
  SET
    vpn_connected = COALESCE(p_vpn_connected, vpn_connected),
    filter_enabled = COALESCE(p_filter_enabled, filter_enabled),
    adblock_enabled = COALESCE(p_adblock_enabled, adblock_enabled),
    last_active_at = NOW()
  WHERE account_id = v_account_uuid
    AND device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Device not found');
  END IF;

  RETURN jsonb_build_object('success', TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_device_status(text, text, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_device_status(text, text, boolean, boolean, boolean) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.update_device_status IS
  'Updates device status (VPN, Filter, AdBlock) for cross-device visibility. account_id is the VPN-XXXX code.';

CREATE OR REPLACE FUNCTION public.admin_device_fleet_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM device_sessions),
    'active', (SELECT COUNT(*) FROM device_sessions WHERE last_active_at >= NOW() - INTERVAL '30 days'),
    'new_last_30d', (SELECT COUNT(*) FROM device_sessions WHERE created_at >= NOW() - INTERVAL '30 days'),
    'connected', (SELECT COUNT(*) FROM device_sessions WHERE vpn_connected IS TRUE),
    'platforms', (
      SELECT COALESCE(jsonb_object_agg(device_type, n), '{}'::jsonb)
      FROM (
        SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*) AS n
        FROM device_sessions
        GROUP BY 1
      ) p
    ),
    'registrations', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'week_start', to_char(week_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'count', n
          )
          ORDER BY week_start
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT
          gs AS week_start,
          COUNT(ds.id) AS n
        FROM generate_series(
          date_trunc('week', timezone('utc', NOW()) - INTERVAL '11 weeks'),
          date_trunc('week', timezone('utc', NOW())),
          INTERVAL '1 week'
        ) AS gs
        LEFT JOIN device_sessions ds
          ON ds.created_at >= gs
         AND ds.created_at < gs + INTERVAL '1 week'
        GROUP BY gs
      ) w
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_device_fleet_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_device_fleet_stats() TO service_role;

COMMENT ON FUNCTION public.admin_device_fleet_stats IS
  'Admin-only fleet totals, platform breakdown, and last-12-week registrations. service_role only.';

CREATE OR REPLACE FUNCTION public.admin_list_devices(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_platform text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH filtered AS (
    SELECT
      ds.id,
      ds.device_id,
      ds.device_name,
      ds.device_type,
      COALESCE(ds.is_main, FALSE) AS is_main,
      COALESCE(ds.vpn_connected, FALSE) AS vpn_connected,
      ds.last_active_at,
      ds.created_at,
      ds.account_id,
      a.account_id AS account_code,
      a.subscription_tier AS account_tier
    FROM device_sessions ds
    LEFT JOIN accounts a ON a.id = ds.account_id
    WHERE (p_platform IS NULL OR p_platform = '' OR ds.device_type = p_platform)
      AND (
        p_status IS NULL OR p_status = ''
        OR (p_status = 'active' AND ds.last_active_at >= NOW() - INTERVAL '30 days')
        OR (p_status = 'stale' AND (ds.last_active_at IS NULL OR ds.last_active_at < NOW() - INTERVAL '30 days'))
      )
      AND (p_search IS NULL OR p_search = '' OR ds.device_name ILIKE '%' || p_search || '%')
  ),
  numbered AS (
    SELECT
      f.*,
      ROW_NUMBER() OVER (
        ORDER BY
          f.vpn_connected DESC NULLS LAST,
          CASE
            WHEN f.account_tier = 'pro' THEN 0
            WHEN f.account_tier = 'premium' THEN 1
            ELSE 2
          END,
          f.last_active_at DESC NULLS LAST
      ) AS rn
    FROM filtered f
  )
  SELECT jsonb_build_object(
    'devices', COALESCE(
      (
        SELECT jsonb_agg((to_jsonb(n) - 'rn') ORDER BY n.rn)
        FROM numbered n
        WHERE n.rn > GREATEST(p_offset, 0)
          AND n.rn <= GREATEST(p_offset, 0) + GREATEST(p_limit, 1)
      ),
      '[]'::jsonb
    ),
    'total', (SELECT COUNT(*) FROM filtered)
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_list_devices(int, int, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_devices(int, int, text, text, text) TO service_role;

COMMENT ON FUNCTION public.admin_list_devices IS
  'Admin-only device list. Default order: VPN on, then Pro, then last active. service_role only.';
