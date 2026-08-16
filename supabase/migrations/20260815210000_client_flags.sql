-- BE-03 — Remote client-flags mechanism (there was none).
-- Project fzlrhmjdjjzcgstaeblu.  Written 2026-08-15.
--
-- WHY: iOS/macOS and Windows are being migrated from "proxy wearing VPN clothing" to a
-- real TUN tunnel. A bad TUN build does not degrade — it takes the user's internet away,
-- including the ability to reach our API to fetch a fix. Before that ships we need
--   (a) a percentage rollout, so the first TUN build reaches 1% of devices, not 100%, and
--   (b) a kill switch that lands within one server-list refresh, not one App Store review.
--
-- DESIGN (non-negotiable, see support-fixes/2026-08-15-platform-truth/BE-03-*.md):
--   1. The flags ride the SAME round-trip as the server list. A client must not be able to
--      reach a connectable state without having seen them, so `tunnel_mode` is returned on
--      every `get_servers_v2` row. No new call, no ordering to get wrong.
--   2. Fail closed to 'proxy'. Missing key, unknown value, unreachable server, decode error
--      → old proxy behaviour. Both new-client/old-server and old-client/new-server degrade
--      to proxy.
--   3. Additive on the wire: iOS decodes with `decodeIfPresent`, Android uses
--      kotlinx `ignoreUnknownKeys`, Windows uses System.Text.Json (ignores unknown members).
--      Adding keys needs no client release; READING them does.
--   4. Per-node override — not every node can carry a TUN client at once (BE-07).
--
-- IMPLEMENTATION NOTES / deviations from the BE-03 draft, all deliberate:
--   * `get_servers_v2` is DROPped and recreated with two new DEFAULTed parameters.
--     CREATE OR REPLACE cannot change a function's argument list; creating the 5-arg form
--     alongside the 3-arg form would make the existing 3-arg call from every shipped client
--     ambiguous ("function is not unique") and break the whole fleet. Drop + recreate in one
--     transaction is the only safe shape. Grants are re-issued below.
--   * The body below is the LIVE definition (pg_get_functiondef, 2026-08-15) — note it does
--     NOT contain `max_users`: migrations/20260723_server_capacity.sql was never applied to
--     this project. Do not copy that file's body over this one.
--   * `tunnel_mode` is read by JOINing `public.vpn_servers` rather than by adding the column
--     to `public.vpn_servers_safe`. CREATE OR REPLACE VIEW can only append columns, and the
--     pending 20260723 migration wants to append `max_users` in that same slot; appending
--     `tunnel_mode` first would make that migration fail with "cannot change name of view
--     column". The join exposes exactly one non-credential column inside an existing
--     SECURITY DEFINER function, so the safe-view invariant is unaffected.
--   * The audit trigger branches on TG_OP. The draft's `COALESCE(NEW.platform, OLD.platform)`
--     raises "record new is not assigned yet" on DELETE — NEW is unassigned, not NULL.
--   * `client_flags_audit` also gets RLS. Supabase's default privileges grant anon/authenticated
--     ALL on new public tables, so an unprotected audit table is world-readable through
--     PostgREST. Both tables are additionally REVOKEd from anon/authenticated.
--
-- Run as the object owner (postgres).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-node tunnel capability.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.vpn_servers
  ADD COLUMN IF NOT EXISTS tunnel_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vpn_servers_tunnel_mode_check'
  ) THEN
    ALTER TABLE public.vpn_servers
      ADD CONSTRAINT vpn_servers_tunnel_mode_check
      CHECK (tunnel_mode IS NULL OR tunnel_mode IN ('proxy','tun'));
  END IF;
END $$;

COMMENT ON COLUMN public.vpn_servers.tunnel_mode IS
  'Per-node tunnel capability. NULL = inherit the client_flags default. Set to ''proxy'' to '
  'keep a node off the TUN path (e.g. a node whose freedom outbound still lacks '
  'domainStrategy=UseIPv4 — see BE-07). Setting it to ''tun'' does NOT override a global '
  'kill switch: the fleet-wide ''proxy'' always wins.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Global, per-platform flags. One row per platform.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_flags (
  platform              text PRIMARY KEY
                        CHECK (platform IN ('ios','macos','android','windows')),
  tunnel_mode           text NOT NULL DEFAULT 'proxy'
                        CHECK (tunnel_mode IN ('proxy','tun')),
  rollout_bucket_pct    integer NOT NULL DEFAULT 0
                        CHECK (rollout_bucket_pct BETWEEN 0 AND 100),
  min_supported_version text,
  maintenance_message   text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            text
);

COMMENT ON TABLE public.client_flags IS
  'Remote client behaviour flags, one row per platform. This is a kill switch — every write '
  'is audited into client_flags_audit. Read only through the SECURITY DEFINER RPCs '
  '(get_servers_v2 / get_client_flags); RLS is on with no policies on purpose.';
COMMENT ON COLUMN public.client_flags.rollout_bucket_pct IS
  'Percentage of devices that get tunnel_mode when it is ''tun''. A device is in the rollout '
  'when device_bucket(device_id) < rollout_bucket_pct, so raising the number is strictly '
  'additive — devices already on TUN stay on TUN.';
COMMENT ON COLUMN public.client_flags.min_supported_version IS
  'Returned to clients for a future force-update flow. NOT enforced anywhere yet (BE-03 '
  'explicitly defers the blocking UI).';

ALTER TABLE public.client_flags ENABLE ROW LEVEL SECURITY;   -- no policies: SECURITY DEFINER only
REVOKE ALL ON public.client_flags FROM anon, authenticated;

INSERT INTO public.client_flags (platform, tunnel_mode, rollout_bucket_pct, updated_by)
VALUES ('ios',     'proxy',   0, 'BE-03 migration'),
       ('macos',   'proxy',   0, 'BE-03 migration'),
       ('android', 'tun',   100, 'BE-03 migration'),   -- already a real VpnService tunnel
       ('windows', 'proxy',   0, 'BE-03 migration')
ON CONFLICT (platform) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Audit every flag change.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_flags_audit (
  id         bigserial PRIMARY KEY,
  platform   text,
  old_row    jsonb,
  new_row    jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT current_user
);

ALTER TABLE public.client_flags_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_flags_audit FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.client_flags_audit_id_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.client_flags_audit_trg() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- NEW is unassigned (not NULL) on DELETE and OLD is unassigned on INSERT, so each
  -- branch may only touch the record that actually exists for that operation.
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.client_flags_audit (platform, old_row, new_row)
    VALUES (OLD.platform, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.client_flags_audit (platform, old_row, new_row)
    VALUES (NEW.platform, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO public.client_flags_audit (platform, old_row, new_row)
    VALUES (NEW.platform, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS client_flags_audit ON public.client_flags;
CREATE TRIGGER client_flags_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.client_flags
  FOR EACH ROW EXECUTE FUNCTION public.client_flags_audit_trg();

-- PostgREST exposes every EXECUTEable public function as /rest/v1/rpc/<name>, so without this
-- the audit trigger would be a SECURITY DEFINER endpoint reachable from the internet with the
-- anon key. A trigger fires as the table owner and needs no grant to the calling role.
REVOKE ALL ON FUNCTION public.client_flags_audit_trg() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Stable, client-independent rollout bucket.
-- ─────────────────────────────────────────────────────────────────────────────

-- Derived server-side from the device id so the same device always lands in the same
-- bucket and a client cannot re-roll to opt itself into 'tun'. bit(32)::bigint is
-- unsigned (0..4294967295), so the modulo is always in [0,100).
-- `extensions.digest` is schema-qualified so the result does not depend on the caller's
-- search_path (pgcrypto lives in `extensions` on this project).
-- search_path is pinned as well as schema-qualified: without it the function is
-- role-mutable, and the rollout bucket must be provably independent of the caller. Cost is
-- that it no longer inlines, which is irrelevant at one call per RPC.
CREATE OR REPLACE FUNCTION public.device_bucket(p_device_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public','extensions'
AS $$
  SELECT (
    ('x' || substr(encode(extensions.digest(coalesce($1,''), 'sha256'), 'hex'), 1, 8))
    ::bit(32)::bigint % 100
  )::int;
$$;

COMMENT ON FUNCTION public.device_bucket(text) IS
  'Stable 0-99 rollout bucket for a device id (sha256, first 32 bits, mod 100). Server-side '
  'so a client cannot re-roll itself into a rollout.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Supplementary RPC (admin tooling + pre-connect refresh). NEVER a client's sole source.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_flags(
  p_account_id   text,
  p_device_id    text,
  p_device_token text,
  p_platform     text DEFAULT NULL,
  p_app_version  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_ok         boolean := false;
  v_flags      public.client_flags%ROWTYPE;
  v_found      boolean := false;
  v_bucket     integer;
  v_mode       text := 'proxy';   -- fail closed
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

  RETURN jsonb_build_object(
    'tunnel_mode',           v_mode,
    'rollout_bucket_pct',    coalesce(v_flags.rollout_bucket_pct, 0),
    'min_supported_version', v_flags.min_supported_version,
    'maintenance_message',   v_flags.maintenance_message,
    'bucket',                v_bucket
  );
END $$;

-- Same ACL as get_servers / get_servers_v2 (PUBLIC keeps the default EXECUTE; the function
-- is fail-closed for unauthenticated callers, so that is not a leak).
GRANT EXECUTE ON FUNCTION public.get_client_flags(text,text,text,text,text)
  TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. get_servers_v2 — the real delivery path. Body is the live definition plus the flags.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_servers_v2(text, text, text);

CREATE OR REPLACE FUNCTION public.get_servers_v2(
  p_account_id   text,
  p_device_id    text,
  p_device_token text,
  p_platform     text DEFAULT NULL,
  p_app_version  text DEFAULT NULL
)
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

  v_flags_json := jsonb_build_object(
    'tunnel_mode',           v_global_mode,
    'rollout_bucket_pct',    coalesce(v_flags.rollout_bucket_pct, 0),
    'min_supported_version', v_flags.min_supported_version,
    'maintenance_message',   v_flags.maintenance_message,
    'bucket',                v_bucket
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
  JOIN public.vpn_servers b ON b.id = s.id   -- tunnel_mode only; see header note on the safe view
  WHERE s.is_active = true
  ORDER BY s.country ASC, s.name ASC;
END;
$function$;

-- DROP dropped the old grants; restore the exact pre-migration ACL
-- ({=X/postgres, postgres, anon, authenticated, service_role}).
GRANT EXECUTE ON FUNCTION public.get_servers_v2(text,text,text,text,text)
  TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
