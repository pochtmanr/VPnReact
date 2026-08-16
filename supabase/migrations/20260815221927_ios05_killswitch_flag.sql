-- IOS-05 — an independent remote flag for the real (includeAllNetworks) kill switch.
--
-- APPLIED TO LIVE (fzlrhmjdjjzcgstaeblu) as 20260815221927_ios05_killswitch_flag.
-- This file is the reviewable copy of exactly what ran. Unlike some of its neighbours in this
-- directory (see 20260723_server_capacity.sql, which was never applied), it is a record, not a
-- proposal.
--
-- Both function bodies below were taken from `pg_get_functiondef` against live, then edited —
-- never from a repo file. The only additions are the kill-switch resolution and its two keys.
--
-- Deliberately separate from BE-03's tunnel_mode: a kill-switch regression must be revertible
-- without reverting the packet tunnel, and vice versa. Both columns default to the inert value,
-- so applying this changed no device's behaviour until a row is flipped.

ALTER TABLE public.client_flags
  ADD COLUMN IF NOT EXISTS kill_switch_mode text NOT NULL DEFAULT 'off'
    CHECK (kill_switch_mode IN ('off','block')),
  ADD COLUMN IF NOT EXISTS kill_switch_rollout_pct integer NOT NULL DEFAULT 0
    CHECK (kill_switch_rollout_pct BETWEEN 0 AND 100);

COMMENT ON COLUMN public.client_flags.kill_switch_mode IS
  'IOS-05. ''block'' arms NETunnelProviderProtocol.includeAllNetworks on clients whose user has '
  'the Kill Switch toggle on. ''off'' is the inert default. Independent of tunnel_mode.';
COMMENT ON COLUMN public.client_flags.kill_switch_rollout_pct IS
  'IOS-05. Ramp for kill_switch_mode, gated on device_bucket(device_id || '':killswitch''). '
  'Salted so this rollout does not select the same devices, in the same order, as the '
  'tunnel_mode rollout, which shares the same unsalted hash.';

-- Neither argument list changes, so CREATE OR REPLACE is safe here — the DROP/recreate dance
-- BE-03 needed applies only to signature changes, and doing it unnecessarily would drop the
-- grants that every shipped client depends on.

CREATE OR REPLACE FUNCTION public.get_client_flags(p_account_id text, p_device_id text, p_device_token text, p_platform text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok         boolean := false;
  v_flags      public.client_flags%ROWTYPE;
  v_found      boolean := false;
  v_bucket     integer;
  v_mode       text := 'proxy';   -- fail closed
  v_ks_bucket  integer;
  v_ks_mode    text := 'off';     -- fail safe: never block by omission
BEGIN
  -- Same token check as get_servers_v2.
  IF p_device_token IS NOT NULL AND length(p_device_token) = 64 THEN
    SELECT true INTO v_ok
    FROM public.device_tokens
    WHERE token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
      AND revoked_at IS NULL
      AND account_id = p_account_id
      AND device_id  = p_device_id;
  END IF;

  IF NOT coalesce(v_ok, false) THEN
    -- Unauthenticated callers get the safe default and learn nothing about the rollout.
    RETURN jsonb_build_object(
      'tunnel_mode',           'proxy',
      'rollout_bucket_pct',    0,
      'kill_switch_mode',      'off',
      'min_supported_version', NULL,
      'maintenance_message',   NULL
    );
  END IF;

  SELECT * INTO v_flags FROM public.client_flags WHERE platform = lower(p_platform);
  v_found := FOUND;

  v_bucket := public.device_bucket(p_device_id);

  IF v_found AND v_flags.tunnel_mode = 'tun' AND v_bucket < v_flags.rollout_bucket_pct THEN
    v_mode := 'tun';
  END IF;

  -- IOS-05. Salted bucket: device_bucket is an unsalted hash of the device id, so reusing it
  -- would put the kill switch on exactly the devices the tun rollout already picked, in the
  -- same order — the two ramps would not be independent in practice even though the columns
  -- are. Resolution is deliberately NOT conditioned on v_mode: the client applies its own
  -- tun interlock, and folding it in here would make one flag silently mask the other.
  v_ks_bucket := public.device_bucket(p_device_id || ':killswitch');

  IF v_found AND v_flags.kill_switch_mode = 'block' AND v_ks_bucket < v_flags.kill_switch_rollout_pct THEN
    v_ks_mode := 'block';
  END IF;

  RETURN jsonb_build_object(
    'tunnel_mode',             v_mode,
    'rollout_bucket_pct',      coalesce(v_flags.rollout_bucket_pct, 0),
    'kill_switch_mode',        v_ks_mode,
    'kill_switch_rollout_pct', coalesce(v_flags.kill_switch_rollout_pct, 0),
    'min_supported_version',   v_flags.min_supported_version,
    'maintenance_message',     v_flags.maintenance_message,
    'bucket',                  v_bucket,
    'kill_switch_bucket',      v_ks_bucket
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_servers_v2(p_account_id text, p_device_id text, p_device_token text, p_platform text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key_id uuid;
  v_client_ip text;
  v_token_hash text;
  v_token_row public.device_tokens%ROWTYPE;
  v_is_pro boolean := false;
  v_flags public.client_flags%ROWTYPE;
  v_flags_found boolean := false;
  v_bucket integer;
  v_global_mode text := 'proxy';   -- fail closed
  v_ks_bucket integer;
  v_ks_mode text := 'off';         -- fail safe: never block by omission
  v_flags_json jsonb;
BEGIN
  v_client_ip := coalesce(
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    current_setting('request.headers', true)::json->>'x-real-ip',
    'unknown'
  );

  -- Rate limit via synthetic v2 key row (shares check_rate_limit plumbing)
  SELECT id INTO v_key_id
  FROM public.app_api_keys
  WHERE app_name = 'v2-device-auth' AND is_active = true
  LIMIT 1;

  IF v_key_id IS NULL OR NOT public.check_rate_limit(v_key_id, v_client_ip, p_account_id) THEN
    INSERT INTO public.device_auth_log (event_type, account_id, device_id, reason, client_ip)
    VALUES ('rate_limited', p_account_id, p_device_id, 'v2 rate limit', v_client_ip);
    RETURN;
  END IF;

  IF p_device_token IS NULL OR length(p_device_token) <> 64 THEN
    INSERT INTO public.device_auth_log (event_type, account_id, device_id, reason, client_ip)
    VALUES ('v2_fail_no_token', p_account_id, p_device_id, 'missing or malformed token', v_client_ip);
    RETURN;
  END IF;

  v_token_hash := encode(digest(p_device_token, 'sha256'), 'hex');

  SELECT * INTO v_token_row
  FROM public.device_tokens
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF v_token_row.id IS NULL THEN
    INSERT INTO public.device_auth_log (event_type, account_id, device_id, reason, client_ip)
    VALUES ('v2_fail_no_token', p_account_id, p_device_id, 'hash not in device_tokens', v_client_ip);
    RETURN;
  END IF;

  IF v_token_row.revoked_at IS NOT NULL THEN
    INSERT INTO public.device_auth_log (event_type, account_id, device_id, reason, client_ip)
    VALUES ('v2_fail_revoked', p_account_id, p_device_id, 'token revoked', v_client_ip);
    RETURN;
  END IF;

  IF v_token_row.account_id <> p_account_id OR v_token_row.device_id <> p_device_id THEN
    INSERT INTO public.device_auth_log (event_type, account_id, device_id, reason, client_ip)
    VALUES ('v2_fail_mismatch', p_account_id, p_device_id, 'identity mismatch', v_client_ip);
    RETURN;
  END IF;

  UPDATE public.device_tokens
  SET last_used_at = now()
  WHERE id = v_token_row.id;

  -- Mirror legacy get_servers is_pro derivation
  SELECT (
    subscription_tier IS NOT NULL
    AND subscription_tier != 'free'
    AND subscription_expires_at IS NOT NULL
    AND subscription_expires_at > now()
  ) INTO v_is_pro
  FROM public.accounts
  WHERE account_id = p_account_id;

  IF v_is_pro IS NULL THEN
    v_is_pro := false;
  END IF;

  -- BE-03: resolve the fleet-wide mode for this device. Anything other than an explicit
  -- 'tun' flag AND a device inside the rollout leaves v_global_mode at 'proxy'. An unknown
  -- or absent p_platform therefore also yields 'proxy'.
  SELECT * INTO v_flags FROM public.client_flags WHERE platform = lower(p_platform);
  v_flags_found := FOUND;
  v_bucket := public.device_bucket(p_device_id);

  IF v_flags_found AND v_flags.tunnel_mode = 'tun' AND v_bucket < v_flags.rollout_bucket_pct THEN
    v_global_mode := 'tun';
  END IF;

  -- IOS-05: the kill-switch flag, resolved on its own salted bucket so its ramp is genuinely
  -- independent of the tun ramp above. See get_client_flags for the full note.
  v_ks_bucket := public.device_bucket(p_device_id || ':killswitch');

  IF v_flags_found AND v_flags.kill_switch_mode = 'block' AND v_ks_bucket < v_flags.kill_switch_rollout_pct THEN
    v_ks_mode := 'block';
  END IF;

  v_flags_json := jsonb_build_object(
    'tunnel_mode',             v_global_mode,
    'rollout_bucket_pct',      coalesce(v_flags.rollout_bucket_pct, 0),
    'kill_switch_mode',        v_ks_mode,
    'kill_switch_rollout_pct', coalesce(v_flags.kill_switch_rollout_pct, 0),
    'min_supported_version',   v_flags.min_supported_version,
    'maintenance_message',     v_flags.maintenance_message,
    'bucket',                  v_bucket,
    'kill_switch_bucket',      v_ks_bucket
  );

  INSERT INTO public.device_auth_log (event_type, account_id, device_id, client_ip)
  VALUES ('v2_success', p_account_id, p_device_id, v_client_ip);

  -- Shape must stay a superset of get_servers output: the pre-BE-03 keys are unchanged and
  -- in the same order; `tunnel_mode` / `client_flags` are appended. Old clients ignore them.
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'country', s.country,
    'country_code', s.country_code,
    'city', s.city,
    'ip_address', CASE WHEN v_is_pro THEN s.ip_address ELSE NULL END,
    'port', CASE WHEN v_is_pro THEN s.port ELSE NULL END,
    'protocol', s.protocol,
    'config_data', CASE WHEN v_is_pro THEN s.config_data ELSE NULL END,
    'load_percentage', s.load_percentage,
    'is_premium', s.is_premium,
    'latency_ms', s.latency_ms,
    'is_active', s.is_active,
    'speed_mbps', s.speed_mbps,
    'score', s.score,
    'sni_options', s.sni_options,
    -- Effective per-node mode. A node pinned to 'proxy' opts out of the rollout; a node
    -- pinned to 'tun' does NOT override the fleet-wide kill switch.
    'tunnel_mode', CASE WHEN b.tunnel_mode = 'proxy' THEN 'proxy' ELSE v_global_mode END,
    'client_flags', v_flags_json
  ) || CASE WHEN v_is_pro THEN public.parse_vless_uri(s.config_data) ELSE '{}'::jsonb END
  FROM public.vpn_servers_safe s
  JOIN public.vpn_servers b ON b.id = s.id   -- tunnel_mode only; keeps vpn_servers_safe untouched
  WHERE s.is_active = true
  ORDER BY s.country ASC, s.name ASC;
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- Operating it
--
--   -- Start the iOS kill-switch rollout at 1%. Independent of the tun ramp: this does not
--   -- touch tunnel_mode, and the client refuses to arm blocking outside tun mode anyway.
--   UPDATE public.client_flags SET kill_switch_mode='block', kill_switch_rollout_pct=1,
--          updated_at=now(), updated_by='<name>' WHERE platform='ios';
--
--   -- KILL. Every client disarms includeAllNetworks on its next fetch or next connect.
--   UPDATE public.client_flags SET kill_switch_mode='off', kill_switch_rollout_pct=0,
--          updated_at=now(), updated_by='<name>' WHERE platform='ios';
--
--   -- Who changed what.
--   SELECT changed_at, changed_by, platform,
--          old_row->>'kill_switch_mode', new_row->>'kill_switch_mode',
--          old_row->>'kill_switch_rollout_pct', new_row->>'kill_switch_rollout_pct'
--   FROM public.client_flags_audit ORDER BY changed_at DESC LIMIT 20;
