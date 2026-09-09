-- =============================================================================
-- 20260908T182400 — admin_device_fleet_overview (stats without weekly chart)
-- =============================================================================
--
-- WHY
--   The Devices tab no longer shows the 12-week registrations chart, but
--   admin_device_fleet_stats still builds it. That join is wasted work on
--   every Devices load. Dashboard still needs the chart.
--
-- WHAT
--   Add a lighter overview RPC (totals + platform mix only) for the Devices
--   tab. service_role only, same pattern as admin_device_fleet_stats.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_device_fleet_overview()
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
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_device_fleet_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_device_fleet_overview() TO service_role;

COMMENT ON FUNCTION public.admin_device_fleet_overview IS
  'Admin-only fleet totals and platform mix, without weekly registrations. service_role only.';
