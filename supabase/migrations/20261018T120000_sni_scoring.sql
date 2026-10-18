-- SNI packs + connect-outcome scoring (doppler-apple/docs/plans/2026-10-next-session-sni-packs.md, Step 2).
--
-- Roman pastes this into the SQL editor. Idempotent: safe to re-run.
--
-- The model. A connect to server s with SNI k from country c on network n succeeds only if two
-- independent mechanisms both pass:
--     P(ok) = rho(c,n,s) * sigma(c,n,s,k)
--     rho   = P(IP:port reachable)              -- IP blocking, server-specific
--     sigma = P(REALITY + 64 KiB pass | rho)    -- SNI blocking / TSPU freeze
-- The client measures which one failed: a raw TCP SYN to ip:port runs beside every attempt, so
--     stage 'tcp'        -> evidence on rho only
--     stage 'tls'        -> TCP ok, the probe died before the 204: evidence on sigma
--     stage 'throughput' -> 204 ok, < 48 KiB: the TSPU 16 KB freeze, evidence on sigma
--     stage 'ok'         -> success on both
-- Counts decay with a 48 h half-life. sigma for (s,k) is shrunk toward the pooled sigma for k
-- across all servers (SNI blocks are country-wide), which is shrunk toward the catalog prior.
-- get_sni_scores returns Beta(alpha, beta) per arm; the client draws Thompson samples from them.
--
-- Privacy. sni_outcome_daily holds aggregate daily counters only: no account id, no device id,
-- no IP, no timestamp finer than a day. report_sni_outcomes checks the device token so random
-- callers cannot poison the counters, then discards it; nothing about the caller is written.

-- 1. The catalog mirror (source of truth: doppler-infra/xray/sni-packs/catalog.json) ----------
CREATE TABLE IF NOT EXISTS public.sni_catalog (
  id              text PRIMARY KEY,
  port            integer NOT NULL,
  dest            text NOT NULL,
  server_names    text[] NOT NULL,
  regions         text[] NOT NULL,
  exclude_regions text[] NOT NULL DEFAULT '{}',
  priority        integer NOT NULL,
  priors          jsonb NOT NULL DEFAULT '{"*":0.5}',
  verified        date,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sni_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sni_catalog FROM anon, authenticated;

-- 2. Aggregate outcome counters --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sni_outcome_daily (
  day        date    NOT NULL,
  country    text    NOT NULL CHECK (country ~ '^[a-z]{2}$'),
  network    text    NOT NULL CHECK (network IN ('wifi', 'cellular', 'other', 'dc')),
  server_id  uuid    NOT NULL,
  sni        text    NOT NULL,
  source     text    NOT NULL CHECK (source IN ('crowd', 'canary')),
  ok         integer NOT NULL DEFAULT 0,
  fail_tcp   integer NOT NULL DEFAULT 0,
  fail_tls   integer NOT NULL DEFAULT 0,
  fail_tput  integer NOT NULL DEFAULT 0,
  ms_sum     bigint  NOT NULL DEFAULT 0,   -- over ok rows only: mean connect time = ms_sum / ok
  PRIMARY KEY (day, country, network, server_id, sni, source)
);
CREATE INDEX IF NOT EXISTS sni_outcome_daily_country_day ON public.sni_outcome_daily (country, day);
ALTER TABLE public.sni_outcome_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sni_outcome_daily FROM anon, authenticated;

-- Canary credentials: sha256 of the secret the SPb canary holds. Roman inserts the row.
CREATE TABLE IF NOT EXISTS public.sni_canary_keys (
  key_hash text PRIMARY KEY,
  label    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sni_canary_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sni_canary_keys FROM anon, authenticated;

-- 3. Shared increment (internal) --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sni_record_outcomes(p_reports jsonb, p_source text, p_country_override text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r jsonb;
  v_country text;
  v_network text;
  v_server uuid;
  v_sni text;
  v_stage text;
  v_ms integer;
  v_n integer := 0;
BEGIN
  IF jsonb_typeof(p_reports) <> 'array' THEN RETURN 0; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_reports) LIMIT 12 LOOP
    v_country := lower(coalesce(p_country_override, r->>'country'));
    v_network := CASE WHEN p_source = 'canary' THEN 'dc'
                      WHEN r->>'network' IN ('wifi', 'cellular') THEN r->>'network'
                      ELSE 'other' END;
    v_sni     := r->>'sni';
    v_stage   := r->>'stage';
    v_ms      := least(greatest(coalesce((r->>'ms')::integer, 0), 0), 60000);
    BEGIN
      v_server := (r->>'server_id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    CONTINUE WHEN v_country IS NULL OR v_country !~ '^[a-z]{2}$';
    CONTINUE WHEN v_stage IS NULL OR v_stage NOT IN ('ok', 'tcp', 'tls', 'throughput');
    -- Only (server, sni) pairs that really exist: nobody can mint arbitrary counter keys.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.vpn_servers s, jsonb_array_elements(coalesce(s.sni_options, '[]')) x
      WHERE s.id = v_server AND x->>'sni' = v_sni);

    INSERT INTO public.sni_outcome_daily AS d (day, country, network, server_id, sni, source, ok, fail_tcp, fail_tls, fail_tput, ms_sum)
    VALUES (current_date, v_country, v_network, v_server, v_sni, p_source,
            (v_stage = 'ok')::int, (v_stage = 'tcp')::int, (v_stage = 'tls')::int, (v_stage = 'throughput')::int,
            CASE WHEN v_stage = 'ok' THEN v_ms ELSE 0 END)
    ON CONFLICT (day, country, network, server_id, sni, source) DO UPDATE SET
      ok        = d.ok        + EXCLUDED.ok,
      fail_tcp  = d.fail_tcp  + EXCLUDED.fail_tcp,
      fail_tls  = d.fail_tls  + EXCLUDED.fail_tls,
      fail_tput = d.fail_tput + EXCLUDED.fail_tput,
      ms_sum    = d.ms_sum    + EXCLUDED.ms_sum;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public._sni_record_outcomes(jsonb, text, text) FROM PUBLIC, anon, authenticated;

-- 4. Crowd reports from the apps --------------------------------------------------------------
-- p_reports: [{country, network, server_id, sni, stage, ms}], at most 12 per call.
CREATE OR REPLACE FUNCTION public.report_sni_outcomes(p_account_id text, p_device_id text, p_device_token text, p_reports jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok boolean := false;
BEGIN
  -- Same token check as get_client_flags. The token proves "a real install", nothing more,
  -- and is not written anywhere.
  IF p_device_token IS NOT NULL AND length(p_device_token) = 64 THEN
    SELECT true INTO v_ok
    FROM public.device_tokens
    WHERE token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
      AND revoked_at IS NULL
      AND account_id = p_account_id
      AND device_id  = p_device_id;
  END IF;
  IF NOT coalesce(v_ok, false) THEN
    RETURN 0;
  END IF;
  RETURN public._sni_record_outcomes(p_reports, 'crowd');
END;
$function$;
REVOKE ALL ON FUNCTION public.report_sni_outcomes(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_sni_outcomes(text, text, text, jsonb) TO anon, authenticated;

-- 5. The in-country canary (doppler-infra/canary, on SPb) ------------------------------------
CREATE OR REPLACE FUNCTION public.report_canary(p_secret text, p_country text, p_reports jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_secret IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.sni_canary_keys WHERE key_hash = encode(digest(p_secret, 'sha256'), 'hex')) THEN
    RETURN 0;
  END IF;
  -- The canary may post more than 12 rows: chunk them 12 at a time.
  RETURN (
    SELECT coalesce(sum(public._sni_record_outcomes(chunk, 'canary', p_country)), 0)::int
    FROM (
      SELECT jsonb_agg(e) AS chunk
      FROM (SELECT e, (row_number() OVER () - 1) / 12 AS g FROM jsonb_array_elements(p_reports) e) t
      GROUP BY g
    ) c
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.report_canary(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_canary(text, text, jsonb) TO anon;

-- 6. Scores for the client --------------------------------------------------------------------
-- Returns {"<server_id>": {"ip": [a, b], "sni": {"<sni>": [a, b], ...}}, ...} for active servers.
--
--   w(row)   = 0.5 ^ (age_days / 2)                 48 h half-life
--            * 1.0 if row.network = p_network, 0.25 for another app network
--            * 0.5 for canary rows (data-centre route, not a mobile one)
--   rho      : alpha = 1.6 + sum w*(ok+tls+tput),  beta = 0.4 + sum w*tcp       prior mean 0.8, 2 pseudo-obs
--   pool(k)  : a_k = 2*p0 + S_k,  b_k = 2*(1-p0) + F_k                         p0 = catalog prior for c
--   sigma    : alpha = 4*a_k/(a_k+b_k) + S_sk,  beta = 4*b_k/(a_k+b_k) + F_sk  S = w*ok, F = w*(tls+tput)
CREATE OR REPLACE FUNCTION public.get_sni_scores(p_account_id text, p_device_id text, p_device_token text, p_country text, p_network text DEFAULT 'other')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok boolean := false;
  v_country text := lower(coalesce(p_country, ''));
  v_result jsonb;
BEGIN
  IF p_device_token IS NOT NULL AND length(p_device_token) = 64 THEN
    SELECT true INTO v_ok
    FROM public.device_tokens
    WHERE token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
      AND revoked_at IS NULL
      AND account_id = p_account_id
      AND device_id  = p_device_id;
  END IF;
  IF NOT coalesce(v_ok, false) OR v_country !~ '^[a-z]{2}$' THEN
    RETURN '{}'::jsonb;
  END IF;

  WITH arms AS (          -- every (server, sni) a client can be offered, with its catalog prior
    SELECT s.id AS server_id, x->>'sni' AS sni,
           coalesce((SELECT coalesce((c.priors->>v_country)::float8, (c.priors->>'*')::float8)
                     FROM public.sni_catalog c
                     WHERE c.is_active AND (x->>'sni') = ANY (c.server_names) LIMIT 1), 0.5) AS p0
    FROM public.vpn_servers s, jsonb_array_elements(coalesce(s.sni_options, '[]')) x
    WHERE s.is_active
  ),
  w AS (
    SELECT d.*,
           power(0.5, (current_date - d.day) / 2.0)
           * CASE WHEN d.source = 'canary' THEN 0.5
                  WHEN d.network = p_network THEN 1.0
                  ELSE 0.25 END AS wt
    FROM public.sni_outcome_daily d
    WHERE d.country = v_country AND d.day >= current_date - 14
  ),
  arm_obs AS (
    SELECT server_id, sni,
           sum(wt * ok)                      AS s_sk,
           sum(wt * (fail_tls + fail_tput))  AS f_sk
    FROM w GROUP BY server_id, sni
  ),
  ip_obs AS (
    SELECT server_id,
           sum(wt * (ok + fail_tls + fail_tput)) AS s_ip,
           sum(wt * fail_tcp)                    AS f_ip
    FROM w GROUP BY server_id
  ),
  pool AS (
    SELECT a.sni, avg(a.p0) AS p0, coalesce(sum(o.s_sk), 0) AS s_k, coalesce(sum(o.f_sk), 0) AS f_k
    FROM arms a LEFT JOIN arm_obs o USING (server_id, sni)
    GROUP BY a.sni
  ),
  scored AS (
    SELECT a.server_id, a.sni,
           4 * (2 * p.p0 + p.s_k) / (2 + p.s_k + p.f_k) + coalesce(o.s_sk, 0)       AS alpha,
           4 * (2 * (1 - p.p0) + p.f_k) / (2 + p.s_k + p.f_k) + coalesce(o.f_sk, 0) AS beta
    FROM arms a
    JOIN pool p USING (sni)
    LEFT JOIN arm_obs o USING (server_id, sni)
  )
  SELECT coalesce(jsonb_object_agg(sv.server_id::text, jsonb_build_object(
           'ip',  jsonb_build_array(round((1.6 + coalesce(i.s_ip, 0))::numeric, 3), round((0.4 + coalesce(i.f_ip, 0))::numeric, 3)),
           'sni', sv.snis)), '{}'::jsonb)
  INTO v_result
  FROM (
    SELECT server_id, jsonb_object_agg(sni, jsonb_build_array(round(alpha::numeric, 3), round(beta::numeric, 3))) AS snis
    FROM scored GROUP BY server_id
  ) sv
  LEFT JOIN ip_obs i USING (server_id);

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_sni_scores(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sni_scores(text, text, text, text, text) TO anon, authenticated;

-- 7. Retention: counters older than 30 days carry < 0.1 % weight; drop them nightly.
DO $$
BEGIN
  PERFORM cron.unschedule('sni_outcome_daily_prune')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sni_outcome_daily_prune');
  PERFORM cron.schedule('sni_outcome_daily_prune', '17 3 * * *',
    $q$DELETE FROM public.sni_outcome_daily WHERE day < current_date - 30$q$);
END $$;
