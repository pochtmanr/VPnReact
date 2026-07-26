-- Server capacity: real per-node ceiling + surface load/capacity to clients.
-- Project fzlrhmjdjjzcgstaeblu.  Written 2026-07-23.
--
-- WHY: everyone in a country was landing on one box (Taiwan buffering). The bot
-- side now picks the least-loaded active server (doppler-bot getServerMarzbanConfig).
-- This migration adds the capacity column and surfaces `max_users` (alongside the
-- already-returned `load_percentage`) through both get_servers RPCs so clients can
-- default-pick a non-saturated node. Adding a key is additive; existing apps decode
-- nullable fields, so NO app release is required.
--
-- The get_servers / get_servers_v2 bodies below were dumped verbatim from the LIVE
-- database (pg_get_functiondef) — the ONLY change vs live is the added
-- `'max_users', s.max_users` key in each jsonb_build_object, plus the view exposing
-- max_users. Every security clause (API-key validation, rate limit, device-token
-- checks, tier gating, parse_vless_uri, is_active filter, SECURITY DEFINER,
-- search_path) is preserved unchanged. Both RPCs read from the vpn_servers_safe VIEW
-- (which excludes credential columns), so the view must expose max_users too.
--
-- Run as the object owner (postgres). REVIEW then apply manually — not auto-applied.

BEGIN;

-- 1. Capacity column. NULL = unbounded (unset). Positive when set.
ALTER TABLE public.vpn_servers ADD COLUMN IF NOT EXISTS max_users integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vpn_servers_max_users_check'
  ) THEN
    ALTER TABLE public.vpn_servers
      ADD CONSTRAINT vpn_servers_max_users_check
      CHECK (max_users IS NULL OR max_users > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.vpn_servers.max_users IS
  'Real capacity ceiling for this node (NULL = unbounded). Drives the n8n capacity alert and the client default-pick. Hand-set per box from its CPU/RAM/bandwidth.';

-- 2. Safe view must expose max_users so the SECURITY DEFINER RPCs can return it.
--    Credential columns stay excluded on purpose. max_users appended at the end
--    (CREATE OR REPLACE VIEW only allows adding columns after the existing ones).
CREATE OR REPLACE VIEW public.vpn_servers_safe AS
  SELECT id,
    name,
    country,
    country_code,
    city,
    ip_address,
    port,
    protocol,
    config_data,
    load_percentage,
    is_premium,
    latency_ms,
    is_active,
    speed_mbps,
    score,
    sni_options,
    max_users
   FROM public.vpn_servers;

-- 3. get_servers — verbatim from live, + 'max_users' key.
CREATE OR REPLACE FUNCTION public.get_servers(p_api_key text, p_account_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_key_id uuid;
  v_is_pro boolean := false;
  v_legacy_client boolean := (p_account_id IS NULL);
  v_client_ip text;
  v_device_exists boolean;
BEGIN
  -- Get client IP for rate limiting
  v_client_ip := coalesce(
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    current_setting('request.headers', true)::json->>'x-real-ip',
    'unknown'
  );

  -- Validate API key
  SELECT id INTO v_key_id
  FROM public.app_api_keys
  WHERE api_key = p_api_key AND is_active = true;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive API key';
  END IF;

  -- Rate limit check
  IF NOT check_rate_limit(v_key_id, v_client_ip, p_account_id) THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please try again later.';
  END IF;

  UPDATE public.app_api_keys SET last_used_at = now() WHERE id = v_key_id;

  -- If device_id is provided, validate it belongs to the account (new secure path)
  IF p_device_id IS NOT NULL AND p_account_id IS NOT NULL AND p_account_id != '' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.device_sessions ds
      JOIN public.accounts a ON a.id = ds.account_id
      WHERE a.account_id = p_account_id
        AND ds.device_id = p_device_id
    ) INTO v_device_exists;

    IF NOT v_device_exists THEN
      RAISE EXCEPTION 'Device not registered to this account';
    END IF;
  END IF;

  IF v_legacy_client THEN
    v_is_pro := true;
  ELSIF p_account_id != '' THEN
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
  ELSE
    v_is_pro := false;
  END IF;

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
    'max_users', s.max_users,
    'is_premium', s.is_premium,
    'latency_ms', s.latency_ms,
    'is_active', s.is_active,
    'speed_mbps', s.speed_mbps,
    'score', s.score,
    'sni_options', s.sni_options
  ) || CASE WHEN v_is_pro THEN parse_vless_uri(s.config_data) ELSE '{}'::jsonb END
  FROM public.vpn_servers_safe s
  WHERE s.is_active = true
  ORDER BY s.country ASC, s.name ASC;
END;
$function$;

-- 4. get_servers_v2 — verbatim from live, + 'max_users' key.
CREATE OR REPLACE FUNCTION public.get_servers_v2(p_account_id text, p_device_id text, p_device_token text)
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

  INSERT INTO public.device_auth_log (event_type, account_id, device_id, client_ip)
  VALUES ('v2_success', p_account_id, p_device_id, v_client_ip);

  -- Shape must be byte-identical to get_servers output
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
    'max_users', s.max_users,
    'is_premium', s.is_premium,
    'latency_ms', s.latency_ms,
    'is_active', s.is_active,
    'speed_mbps', s.speed_mbps,
    'score', s.score,
    'sni_options', s.sni_options
  ) || CASE WHEN v_is_pro THEN public.parse_vless_uri(s.config_data) ELSE '{}'::jsonb END
  FROM public.vpn_servers_safe s
  WHERE s.is_active = true
  ORDER BY s.country ASC, s.name ASC;
END;
$function$;

COMMIT;
