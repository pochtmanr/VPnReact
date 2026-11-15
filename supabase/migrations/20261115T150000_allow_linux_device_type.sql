-- Allow Linux clients to register device_sessions and appear in fleet views.
-- Prior CHECK (from 20241226) only listed browser/mobile types; production later
-- accepted ios/android/macos/windows. Linux Phase 1 needs `linux` explicitly.

ALTER TABLE device_sessions
  DROP CONSTRAINT IF EXISTS device_sessions_device_type_check;

ALTER TABLE device_sessions
  ADD CONSTRAINT device_sessions_device_type_check
  CHECK (device_type IN (
    'ios', 'android', 'macos', 'windows', 'linux',
    'chrome', 'firefox', 'web'
  ));

-- client_flags.platform used by get_servers_v2 / BE-03 tunnel_mode routing
ALTER TABLE public.client_flags
  DROP CONSTRAINT IF EXISTS client_flags_platform_check;

-- Recreate the inline CHECK from 20260815210000 with linux added.
-- Postgres names table-level CHECKs; the original was on the column via CREATE TABLE.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'client_flags'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%platform%'
  LOOP
    EXECUTE format('ALTER TABLE public.client_flags DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.client_flags
  ADD CONSTRAINT client_flags_platform_check
  CHECK (platform IN ('ios', 'macos', 'android', 'windows', 'linux'));

INSERT INTO public.client_flags (platform, tunnel_mode, rollout_bucket_pct, updated_by)
VALUES ('linux', 'tun', 100, 'linux-phase-1')
ON CONFLICT (platform) DO NOTHING;
