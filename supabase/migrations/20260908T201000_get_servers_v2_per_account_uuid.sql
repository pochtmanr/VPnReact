-- =============================================================================
-- 20260908T201000 — WS4 part 2: get_servers_v2 hands each account its OWN
--                   VLESS UUID, and stops leaking sni_options to free accounts
-- =============================================================================
--
-- ############################################################################
-- #                                                                          #
-- #  DEFINE ONLY. DO NOT RUN THIS FILE AS WRITTEN.                           #
-- #                                                                          #
-- #  The body below is derived from the newest copy of get_servers_v2 IN     #
-- #  THIS REPO (20260815221927_ios05_killswitch_flag.sql). That copy is      #
-- #  KNOWN TO BE STALE. The live function was last changed on 2026-08-16 by  #
-- #  a bare CREATE OR REPLACE with no migration file, adding a               #
-- #  min_tun_version / app_version_at_least version gate that exists in NO   #
-- #  repo file. dopplerWindows/PROMPT.md:230-253 describes operating that    #
-- #  gate; SUBSCRIPTION-AND-ANTIFRAUD.md §6b records 57 live functions, many #
-- #  documented nowhere.                                                     #
-- #                                                                          #
-- #  Applying this body verbatim would SILENTLY REVERT that version gate.    #
-- #                                                                          #
-- #  The procedure is in §1. Dump the live body, apply the four-line patch   #
-- #  in §2 to THAT text, and run the result. The full body in §3 is a        #
-- #  reference for what the patched function should look like — it is NOT    #
-- #  the thing to run.                                                       #
-- #                                                                          #
-- ############################################################################
--
-- WHY THIS CHANGE
--
--   (a) Per-account identity. 20260908T200000 gave every account its own VLESS
--       UUID and gave the nodes an RPC to learn the authorised set. This is the
--       other half: the API must hand each caller ITS uuid instead of the
--       fleet-shared 9c215195-aef6-49b5-b653-6226e0d280ed. No client release is
--       needed and none should become needed — every client already uses
--       whatever this RPC returns, and the wire shape does not change. Keep it
--       that way: this patch adds no keys and removes none.
--
--   (b) sni_options is currently returned UNGATED. It is the one credential-ish
--       field beside ip_address (gated), port (gated), config_data (gated) and
--       the parse_vless_uri merge (gated) that a free, expired, credential-less
--       account still receives in full — the REALITY publicKey, shortId and
--       per-inbound port list 8443-8448 for every active node. Confirmed
--       empirically 2026-08-24, not inferred (SUBSCRIPTION-AND-ANTIFRAUD.md
--       §6a). Logged as deferred item S25 in
--       landing/docs/releases/2026-09-07-customer-issue-sweep.md:67.
--
-- =============================================================================
-- BLOCKING PRE-CONDITION FOR (b) — TIMING, NOT JUST CORRECTNESS
-- =============================================================================
--
--   The fixed Android build MUST have shipped and reached users before the
--   sni_options gate lands. SUBSCRIPTION-AND-ANTIFRAUD.md, open hole #4:
--   "Apply it earlier and free Android users on the current build get a
--   Connection Mode menu backed by an empty list." The client prerequisite is
--   met in SOURCE on both platforms; what matters is the build in users' hands.
--
--   If that build has not shipped, apply (a) alone: keep the config_data and
--   parse_vless_uri lines from §2, and leave the sni_options line as it is
--   live. The two halves are independent and can land in either order.
--
-- =============================================================================
-- OTHER PRE-FLIGHT
-- =============================================================================
--
--   Q1. 20260908T200000 must be applied and verified first (its §6 checks).
--       `public.account_vless_uuid` and `public.vless_uri_with_uuid` must exist
--       and `accounts.vless_uuid` must be fully backfilled.
--
--   Q2. Confirm the live signature is still the 5-argument form. If it is,
--       CREATE OR REPLACE is safe and the DROP/recreate dance BE-03 needed does
--       NOT apply — and must not be performed, because it would drop the grants
--       every shipped client depends on.
--
--         SELECT p.oid::regprocedure
--         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname = 'public' AND p.proname = 'get_servers_v2';
--
--       Expect exactly one row:
--         get_servers_v2(text,text,text,text,text)
--       If TWO rows come back (a 3-arg form still exists), stop and resolve that
--       first — patching one and not the other is a bypass by construction.
--
--   Q3. Dump the live body. THIS is the text you edit.
--
--         SELECT pg_get_functiondef(
--           'public.get_servers_v2(text,text,text,text,text)'::regprocedure);
--
--       Save it. Diff it against §3 of this file. Expect at minimum the
--       min_tun_version / app_version_at_least gate to be present live and
--       absent here; expect `max_users` to be ABSENT live (20260723 was never
--       applied). Anything else you find is new information — record it before
--       you overwrite it.
--
--   Q4. Confirm `sni_options` is a real column on `public.vpn_servers` and is
--       exposed by `public.vpn_servers_safe`. No repo file contains its DDL —
--       it is referenced by 20260815202750_sni_health_view.sql and by both
--       get_servers bodies, and its shape is known only from a node payload
--       (task-5-report.md:210: an array of {sni, fingerprint, regions, priority,
--       port, publicKey, shortId}).
--
--         SELECT column_name, data_type FROM information_schema.columns
--         WHERE table_schema='public' AND table_name IN ('vpn_servers','vpn_servers_safe')
--           AND column_name IN ('sni_options','config_data','tunnel_mode')
--         ORDER BY table_name, column_name;
--
--   Q5. `parse_vless_uri`'s body exists in NO repo file. This patch is written
--       so it does not need to: the substitution happens on the URI STRING
--       before parse_vless_uri sees it, so whatever keys that function emits,
--       they are derived from the same rewritten URI as the `config_data` value
--       returned beside them. Still, read it once before applying — if it does
--       anything other than parse its argument (a table lookup, a cache), this
--       assumption needs re-checking:
--
--         SELECT pg_get_functiondef('public.parse_vless_uri(text)'::regprocedure);
--
--   Q6. NEVER take a get_servers_v2 or get_servers body from
--       20260723_server_capacity.sql. That file is a July 2026 snapshot, was
--       never applied past its section 1, and replaying its sections 2-4 would
--       revert the version gate, the BE-03 tunnel_mode/client_flags keys and
--       everything in this file. Its own header says so.
--
-- =============================================================================
-- 1. PROCEDURE
-- =============================================================================
--
--   1. Run Q1-Q6.
--   2. Take the Q3 dump into an editor.
--   3. Apply the four edits in §2 to it, and nothing else.
--   4. Diff your edited text against the Q3 dump. The diff must be exactly:
--        1 added DECLARE line, 1 added statement block, 3 changed lines.
--        If it is bigger, you edited something you did not mean to.
--   5. Run the edited text as the object owner (postgres), then
--      NOTIFY pgrst, 'reload schema';
--   6. Run §4.
--
-- =============================================================================
-- 2. THE PATCH — exactly what changes, and why
-- =============================================================================
--
-- EDIT 1 of 4 — one new variable, in the DECLARE block.
--
--     +  v_vless_uuid uuid;
--
--   Put it after `v_is_pro boolean := false;`. Position is cosmetic.
--
--
-- EDIT 2 of 4 — resolve the caller's UUID. INSERT this block immediately after
-- the existing `IF v_is_pro IS NULL THEN v_is_pro := false; END IF;`.
--
--     +  -- WS4: this caller's own VLESS identity. Read rather than derived, so
--     +  -- a future deliberate rotation is honoured; derived as a fallback so a
--     +  -- row the backfill missed still gets a working config instead of NULL.
--     +  SELECT a.vless_uuid INTO v_vless_uuid
--     +  FROM public.accounts a
--     +  WHERE a.account_id = p_account_id;
--     +
--     +  IF v_vless_uuid IS NULL THEN
--     +    v_vless_uuid := public.account_vless_uuid(p_account_id);
--     +  END IF;
--
--   Deliberately a SEPARATE statement rather than an extra column folded into
--   the existing v_is_pro SELECT. Folding it in would rewrite a line of a live
--   body nobody in this repo can see; a second statement keeps the diff purely
--   additive and costs one indexed lookup on a table already in cache.
--
--   Note it is resolved for EVERY authenticated caller, not only Pro ones. It
--   is never returned to a non-Pro caller (all three uses sit inside
--   `CASE WHEN v_is_pro`), and branching here would only add a way to get the
--   two out of step.
--
--
-- EDIT 3 of 4 — two lines in the projection. This is the substitution itself.
--
--   BEFORE:
--       'config_data', CASE WHEN v_is_pro THEN s.config_data ELSE NULL END,
--   AFTER:
--       'config_data', CASE WHEN v_is_pro
--                           THEN public.vless_uri_with_uuid(s.config_data, v_vless_uuid)
--                           ELSE NULL END,
--
--   BEFORE:
--       ) || CASE WHEN v_is_pro THEN public.parse_vless_uri(s.config_data) ELSE '{}'::jsonb END
--   AFTER:
--       ) || CASE WHEN v_is_pro
--                 THEN public.parse_vless_uri(
--                        public.vless_uri_with_uuid(s.config_data, v_vless_uuid))
--                 ELSE '{}'::jsonb END
--
--   BOTH must change together. `config_data` is consumed two ways: iOS/Windows
--   read the parsed fields the `||` merge spreads over the row, and other paths
--   re-parse the raw string. Substituting in one place and not the other hands
--   a client two different UUIDs for the same server and the failure is silent
--   — the tunnel just never authenticates.
--
--   vless_uri_with_uuid returns its input UNCHANGED for NULL/non-vless/@-less
--   input, so a malformed config_data row degrades to exactly today's
--   behaviour rather than to a broken URI.
--
--
-- EDIT 4 of 4 — the sni_options gate (item S25). Skip this edit if the blocking
-- pre-condition above is not met.
--
--   BEFORE:
--       'sni_options', s.sni_options,
--   AFTER:
--       'sni_options', CASE WHEN v_is_pro THEN s.sni_options ELSE NULL END,
--
--   NULL, not '[]'. It matches how ip_address, port and config_data are already
--   withheld on the same row, and every client decodes the field as optional
--   (iOS `sniOptions: [SNIProfile]?`, Android kotlinx with ignoreUnknownKeys,
--   Windows System.Text.Json). An empty array would be a fourth shape for the
--   clients to disambiguate for no gain.
--
--   NOT CHANGED, on purpose: `vpn_servers_sni_health` (20260815202750). It is a
--   security_invoker view granted to service_role only and reads vpn_servers
--   directly, so the n8n SNI-coverage alert is unaffected by this gate.
--
-- =============================================================================
-- 3. REFERENCE BODY — what the patched function should look like.
--
--    Based on 20260815221927_ios05_killswitch_flag.sql, which is the newest
--    copy in this repo and is STALE (see the banner). It does not contain the
--    live min_tun_version / app_version_at_least gate. It is here so you can
--    see the four edits in context and diff your work; it is NOT the artifact
--    to run. Everything else — the rate limit, the device-token checks, the
--    device_auth_log writes, the Pro predicate, the BE-03 / IOS-05 flag
--    resolution, the vpn_servers JOIN, SECURITY DEFINER, the search_path — is
--    reproduced unchanged and must survive your edit.
-- =============================================================================

/*  ---- REFERENCE ONLY — DO NOT EXECUTE THIS BLOCK AS-IS (see §1) ----

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
  v_vless_uuid uuid;                 -- EDIT 1
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

  -- EDIT 2 ---------------------------------------------------------------
  -- WS4: this caller's own VLESS identity. Read rather than derived, so a
  -- future deliberate rotation is honoured; derived as a fallback so a row the
  -- backfill missed still gets a working config instead of NULL.
  SELECT a.vless_uuid INTO v_vless_uuid
  FROM public.accounts a
  WHERE a.account_id = p_account_id;

  IF v_vless_uuid IS NULL THEN
    v_vless_uuid := public.account_vless_uuid(p_account_id);
  END IF;
  ------------------------------------------------------------------------

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
    -- EDIT 3a: the caller's own UUID, substituted into the stored URI.
    'config_data', CASE WHEN v_is_pro
                        THEN public.vless_uri_with_uuid(s.config_data, v_vless_uuid)
                        ELSE NULL END,
    'load_percentage', s.load_percentage,
    'is_premium', s.is_premium,
    'latency_ms', s.latency_ms,
    'is_active', s.is_active,
    'speed_mbps', s.speed_mbps,
    'score', s.score,
    -- EDIT 4: S25. REALITY publicKey/shortId/ports are credentials; gate them
    -- exactly like ip_address, port and config_data on the same row.
    'sni_options', CASE WHEN v_is_pro THEN s.sni_options ELSE NULL END,
    -- Effective per-node mode. A node pinned to 'proxy' opts out of the rollout; a node
    -- pinned to 'tun' does NOT override the fleet-wide kill switch.
    'tunnel_mode', CASE WHEN b.tunnel_mode = 'proxy' THEN 'proxy' ELSE v_global_mode END,
    'client_flags', v_flags_json
  -- EDIT 3b: parse the SAME rewritten URI, so the parsed fields and the raw
  -- config_data can never disagree about the UUID.
  ) || CASE WHEN v_is_pro
            THEN public.parse_vless_uri(
                   public.vless_uri_with_uuid(s.config_data, v_vless_uuid))
            ELSE '{}'::jsonb END
  FROM public.vpn_servers_safe s
  JOIN public.vpn_servers b ON b.id = s.id   -- tunnel_mode only; keeps vpn_servers_safe untouched
  WHERE s.is_active = true
  ORDER BY s.country ASC, s.name ASC;
END;
$function$;

    ---- END REFERENCE ---- */

-- =============================================================================
-- 4. POST-APPLY VERIFICATION
-- =============================================================================
--
--   -- 4.1 The version gate survived. If this returns 0 rows after you applied
--   --     your edit, and the Q3 dump contained it, YOU REVERTED IT. Restore the
--   --     Q3 dump immediately.
--   SELECT prosrc LIKE '%app_version_at_least%' AS has_version_gate,
--          prosrc LIKE '%vless_uri_with_uuid%'   AS has_ws4_patch,
--          prosrc LIKE '%tunnel_mode%'           AS has_be03,
--          prosrc LIKE '%kill_switch_mode%'      AS has_ios05
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.proname='get_servers_v2';
--
--   -- 4.2 Grants intact. Every shipped client calls this with the anon key.
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_schema='public' AND routine_name='get_servers_v2';
--
--   -- 4.3 A Pro account gets ITS uuid, not the shared one. Use a real
--   --     account_id + device_id + device_token triple from a test device.
--   SELECT r->>'name',
--          split_part(split_part(r->>'config_data', '://', 2), '@', 1) AS uuid_in_uri,
--          r->>'sni_options' IS NOT NULL AS got_sni
--   FROM public.get_servers_v2('<pro account>','<device>','<token>','ios','3.2.0') r;
--   -- uuid_in_uri must equal:
--   --   SELECT vless_uuid FROM accounts WHERE account_id = '<pro account>';
--   -- and must NOT be 9c215195-aef6-49b5-b653-6226e0d280ed.
--
--   -- 4.4 Whatever key parse_vless_uri spreads for the id must agree with the
--   --     URI. Compare every key of the returned row against uuid_in_uri:
--   SELECT key, value FROM public.get_servers_v2('<pro>','<dev>','<tok>','ios','3.2.0') r,
--        LATERAL jsonb_each_text(r) WHERE value = '<expected uuid>';
--   -- expect BOTH the config_data hit and whatever parsed key carries the id.
--
--   -- 4.5 A FREE account gets nothing: ip_address, port, config_data AND
--   --     sni_options all null. This is the S25 check.
--   SELECT r->>'ip_address', r->>'port', r->>'config_data', r->>'sni_options'
--   FROM public.get_servers_v2('<free account>','<device>','<token>','ios','3.2.0') r;
--
--   -- 4.6 The nodes still accept it. Until the WS4 step-2 syncer is live on a
--   --     node AND that node has the caller's UUID, a real connect test will
--   --     FAIL — correctly. Do 4.6 on a node that has been synced, or expect
--   --     failure and do not misread it as a bug in this patch.
--
-- =============================================================================
-- 5. ROLLBACK
-- =============================================================================
--
--   Re-run the unedited Q3 dump. That is the whole rollback, and it is why Q3
--   says to SAVE the dump rather than just read it. Clients need no release in
--   either direction: they use whatever this RPC returns.
--
--   Rolling back does NOT require touching the nodes. A node that has both the
--   shared UUID and the per-account UUIDs in its client list serves both, which
--   is exactly the overlap the transition plan in 20260908T200000 §7 relies on.
-- =============================================================================
