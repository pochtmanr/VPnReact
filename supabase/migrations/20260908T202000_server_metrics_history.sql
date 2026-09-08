-- =============================================================================
-- 20260908T202000 — WS5: fleet metrics history
-- =============================================================================
--
-- WHY
--   Nothing about fleet health is stored anywhere. Every number the admin panel
--   and the n8n Doppler Service Monitor show is a live probe of
--   `stats-agent.py` on each node, rendered once and then gone. So:
--     * "was Hong Kong slow last Tuesday?" is unanswerable;
--     * an alert cannot be tuned, because there is no history to tune against;
--     * "uptime" is not a number anybody can produce.
--
--   This adds the store. It does not add the writer: a service-role collector
--   (n8n, or a small scheduled job) polls each node's `GET /stats` once a
--   minute and INSERTs one row per node per poll.
--
-- SHAPE OF THE SOURCE
--   `landing/infrastructure/monitoring/stats-agent.py` (agent_version 2) emits:
--     agent_version, hostname, ts, uptime_s, agent_compute_ms,
--     xray {active, connections {8443..8448, total, distinct_peers},
--           traffic {uplink, downlink, users}},
--     cpu {load1, cores}, mem {total_mb, available_mb, used_pct},
--     reachability {status, chatgpt_status, flagged, error, checked_at,
--                   attempted_at, age_s, interval_s}
--   The Azure fleet still runs a build that predates `reachability`,
--   `distinct_peers` and `agent_version` and emits none of them.
--
-- EVERY METRIC COLUMN IS NULLABLE. That is the single most important decision
-- in this file. An older agent, a failed probe, an unmonitored node and a
-- genuinely-zero reading are four different facts, and only NULL can carry the
-- first three. A defaulted 0 would make a dead agent look like an idle node —
-- which is precisely the bug agent v2 fixed on its own side, where v1's
-- `len(peers) if peers else None` made an idle node indistinguishable from an
-- unmeasurable one. Do not add DEFAULT 0 to any of these columns later.
--
-- =============================================================================
-- PRE-FLIGHT
-- =============================================================================
--
--   R1. `public.vpn_servers(id uuid)` is the FK target. Confirm the type:
--         SELECT column_name, data_type FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='vpn_servers'
--           AND column_name='id';
--       (schema.sql says `uuid PRIMARY KEY DEFAULT uuid_generate_v4()`.)
--
--   R2. Is pg_cron actually installed and usable? SUBSCRIPTION-AND-ANTIFRAUD.md
--       §6c infers a server-side 6-hourly scheduler from evidence and says
--       outright that `SELECT * FROM cron.job` is what would settle it — it has
--       never been run. THIS MIGRATION THEREFORE SCHEDULES NOTHING. It ships
--       the prune function and leaves scheduling to the applier. See §7.
--
--         SELECT extname FROM pg_extension WHERE extname = 'pg_cron';
--         SELECT jobid, schedule, command, jobname FROM cron.job;
--
--   R3. Nothing here touches vpn_servers_safe, get_servers or get_servers_v2.
--       Verified: this file contains no CREATE OR REPLACE VIEW and no
--       CREATE OR REPLACE FUNCTION for any of those three names.
--
--   R4. Supabase grants anon/authenticated ALL on new public tables by default
--       (see 20260815210000_client_flags.sql's header). The REVOKEs in §1 are
--       load-bearing, not decoration. After applying, confirm with the ANON key
--       that `GET /rest/v1/server_metrics` returns a permission error.
--
-- HOW TO APPLY: this file carries its own BEGIN/COMMIT, so run it as the object
-- owner (postgres) through psql or the Dashboard SQL editor. If you instead go
-- through the Supabase CLI / `apply_migration`, which wraps the file in its own
-- transaction, STRIP the BEGIN and COMMIT first — 20260815202750_sni_health_view.sql
-- records that convention. Do not leave both.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The table.
--
--    Volume: ~10 nodes x 1 sample/minute = 14,400 rows/day, ~5.3M/year, and
--    with the 30-day retention in §4 a steady state of ~430k rows. That is a
--    small table. It is NOT a partitioning candidate — partitioning earns its
--    keep past ~100M rows, and a `DELETE ... WHERE sampled_at < cutoff` on
--    430k rows is cheap. If the fleet or the sample rate grows by two orders of
--    magnitude, revisit: partition by month on sampled_at and drop partitions
--    instead of deleting rows.
--
--    `id bigint generated always as identity` rather than a uuid PK: this is a
--    single-database, append-only, time-ordered table, so a sequential key
--    keeps index inserts on the right-hand edge instead of scattering them.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.server_metrics (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  server_id                uuid        NOT NULL
                             REFERENCES public.vpn_servers(id) ON DELETE CASCADE,

  -- The agent's own `ts`, NOT the collector's clock. Second precision, so a
  -- retried poll collides with the row it already wrote and the unique
  -- constraint in §2 makes ingestion idempotent.
  sampled_at               timestamptz NOT NULL,

  -- When we stored it. sampled_at - collected_at is collector lag, which is
  -- itself worth being able to see.
  collected_at             timestamptz NOT NULL DEFAULT now(),

  -- NULL = an agent old enough not to emit the key. Absent means ancient;
  -- nothing may be inferred from the absence of the other keys in that case.
  agent_version            smallint,

  -- xray.connections.total. SOCKETS, not people: a TUN client opens one socket
  -- per destination flow, so one device routinely holds hundreds. Never divide
  -- this by max_users and call it occupancy. Measured 2026-09-08: Hong Kong
  -- alone held 2,197 established sockets while 58 accounts fleet-wide
  -- satisfied the Pro predicate — one node out-counting the entire paying base
  -- by ~38x. Store the number, do not interpret it as users.
  connections              integer     CHECK (connections IS NULL OR connections >= 0),

  -- xray.connections.distinct_peers. Unique remote IPs — the closest thing a
  -- node can measure to a device count, and still not an account count while
  -- every client presents the same shared VLESS UUID (which is what WS4 fixes).
  -- 0 means "ss ran and saw nobody"; NULL means the /proc fallback ran and
  -- could not measure peers at all.
  distinct_peers           integer     CHECK (distinct_peers IS NULL OR distinct_peers >= 0),

  cpu_load1                numeric(8,2) CHECK (cpu_load1 IS NULL OR cpu_load1 >= 0),
  cpu_cores                smallint     CHECK (cpu_cores IS NULL OR cpu_cores > 0),

  -- mem.used_pct, already a percentage on the agent side.
  memory_used_pct          numeric(5,2)
                             CHECK (memory_used_pct IS NULL
                                    OR (memory_used_pct >= 0 AND memory_used_pct <= 100)),

  -- xray.traffic.uplink / .downlink. NULL on every node without an xray `api`
  -- block, which as of agent v2 is all of them — the agent no longer calls
  -- statsquery blind. Cumulative counters that reset when xray restarts, so a
  -- consumer must diff consecutive samples and discard negative deltas.
  traffic_up_bytes         bigint      CHECK (traffic_up_bytes IS NULL OR traffic_up_bytes >= 0),
  traffic_down_bytes       bigint      CHECK (traffic_down_bytes IS NULL OR traffic_down_bytes >= 0),

  -- reachability.status. Explicitly tri-state. 'unknown' is NOT 'ok': it means
  -- the probe broke or has never completed. A NULL here means the payload had
  -- no reachability object at all (pre-v2 agent).
  reachability_status      text        CHECK (reachability_status IS NULL
                                              OR reachability_status IN ('ok','blocked','unknown')),
  -- reachability.chatgpt_status — the raw HTTP status of the last probe.
  reachability_status_code integer,

  xray_active              boolean,

  uptime_s                 bigint      CHECK (uptime_s IS NULL OR uptime_s >= 0),

  -- Agent-side assembly time only. Subtract it from the collector's measured
  -- round trip to get real network time; conflating the two is what made every
  -- bare-xray node read 2100-2500 ms in the admin panel.
  agent_compute_ms         numeric(9,1) CHECK (agent_compute_ms IS NULL OR agent_compute_ms >= 0),

  -- TCP handshake time to the node's REALITY port, measured by the collector.
  -- Deliberately not the /stats round trip: this still returns a number when
  -- the stats agent is dead but xray is alive. The agent's own processing time
  -- is `agent_compute_ms`.
  net_rtt_ms               integer     CHECK (net_rtt_ms IS NULL OR net_rtt_ms >= 0)
);

COMMENT ON TABLE public.server_metrics IS
  'WS5. One row per node per poll of stats-agent.py GET /stats. EVERY metric column is '
  'nullable on purpose: an old agent, a failed probe and an unmonitored node have no value, '
  'and a defaulted 0 would make a dead agent look like an idle node. Written by service_role '
  'only; read by service_role and by the admin rollups below. ~14.4k rows/day at 10 nodes.';

COMMENT ON COLUMN public.server_metrics.sampled_at IS
  'The agent''s own ts, not the collector''s clock. Second precision so a retried poll hits '
  'the (server_id, sampled_at) unique constraint and ON CONFLICT DO NOTHING makes ingestion '
  'idempotent.';

COMMENT ON COLUMN public.server_metrics.connections IS
  'Established TCP sockets across ports 8443-8448 — sockets, not people. One TUN client holds '
  'hundreds. Not an occupancy figure.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes.
--
--    The one query that matters is "the last N hours for ONE node", and the
--    unique constraint's index serves it: (server_id, sampled_at) is an
--    equality column followed by a range column, which is the correct composite
--    order, and Postgres scans a btree backwards for ORDER BY sampled_at DESC
--    at no extra cost. So the unique constraint IS the read index — a separate
--    (server_id, sampled_at DESC) index would be pure duplicate write cost.
--
--    The second index exists for retention (§4) and for fleet-wide time
--    windows, neither of which can use the leftmost prefix of the first.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'server_metrics_server_sample_key'
  ) THEN
    ALTER TABLE public.server_metrics
      ADD CONSTRAINT server_metrics_server_sample_key UNIQUE (server_id, sampled_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS server_metrics_sampled_at_idx
  ON public.server_metrics (sampled_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Access control.
--
--    service_role writes and reads. anon/authenticated get nothing: RLS is
--    enabled with NO permissive policy, so even if a future default grant
--    reappears, the policy layer still denies. service_role holds BYPASSRLS in
--    Supabase, so the policy layer is not what lets IT through — the grants
--    are. Both layers are set deliberately.
--
--    "Admins read" is served the way every other admin surface in this repo is:
--    through SECURITY DEFINER functions granted to service_role (see
--    20260908T182400_admin_device_fleet_overview.sql). There is no `admin` DB
--    role to grant to.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.server_metrics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.server_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.server_metrics FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.server_metrics TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Retention.
--
--    30 days. Long enough for "what did last month look like", short enough
--    that the table stays a few hundred thousand rows and every query stays an
--    index scan. Anything longer belongs in a rollup table, not in raw samples.
--
--    HONEST LIMITATION: the batching below bounds each DELETE statement, not
--    each transaction — a function body is one transaction, so no batch commits
--    until the whole call returns. That is why p_max_rows exists: each call is
--    bounded, and a caller that wants incremental commits calls it repeatedly
--    rather than asking for a bigger p_max_rows.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prune_server_metrics(
  p_keep_days integer DEFAULT 30,
  p_batch     integer DEFAULT 10000,
  p_max_rows  integer DEFAULT 500000
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
  v_cutoff timestamptz;
  v_n      bigint;
  v_total  bigint := 0;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 1 THEN
    RAISE EXCEPTION 'prune_server_metrics: p_keep_days must be >= 1 (got %)', p_keep_days;
  END IF;

  v_cutoff := now() - make_interval(days => p_keep_days);

  LOOP
    DELETE FROM public.server_metrics
    WHERE id IN (
      SELECT id FROM public.server_metrics
      WHERE sampled_at < v_cutoff
      ORDER BY sampled_at
      LIMIT p_batch
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0 OR v_total >= p_max_rows;
  END LOOP;

  RETURN v_total;
END;
$function$;

COMMENT ON FUNCTION public.prune_server_metrics(integer, integer, integer) IS
  'WS5 retention. Deletes server_metrics older than p_keep_days (default 30) in bounded '
  'batches, returning the row count. NOT SCHEDULED by its migration — see that file''s section '
  '7 for why, and schedule it deliberately. Batches bound each statement, not each '
  'transaction; call repeatedly for incremental commits.';

REVOKE ALL ON FUNCTION public.prune_server_metrics(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_server_metrics(integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_server_metrics(integer, integer, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Latest sample per node.
--
--    What the Servers tab needs on load: one row per node, newest first. A
--    DISTINCT ON over the (server_id, sampled_at) index, so it is a handful of
--    index-only jumps rather than a scan.
--
--    security_invoker so the view carries no privileges of its own — same
--    pattern as vpn_servers_sni_health (20260815202750).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.server_metrics_latest
WITH (security_invoker = on) AS
SELECT DISTINCT ON (m.server_id)
       m.server_id,
       m.sampled_at,
       m.collected_at,
       now() - m.sampled_at AS sample_age,
       m.agent_version,
       m.connections,
       m.distinct_peers,
       m.cpu_load1,
       m.cpu_cores,
       m.memory_used_pct,
       m.traffic_up_bytes,
       m.traffic_down_bytes,
       m.reachability_status,
       m.reachability_status_code,
       m.xray_active,
       m.uptime_s,
       m.agent_compute_ms,
       m.net_rtt_ms
FROM public.server_metrics m
ORDER BY m.server_id, m.sampled_at DESC;

COMMENT ON VIEW public.server_metrics_latest IS
  'WS5. Newest sample per node. `sample_age` is the staleness of that sample — a node whose '
  'agent died stops producing rows entirely, so age is the only thing that reveals it. A node '
  'with no rows at all is absent from this view; join from vpn_servers, not from here.';

REVOKE ALL ON public.server_metrics_latest FROM PUBLIC;
REVOKE ALL ON public.server_metrics_latest FROM anon, authenticated;
GRANT SELECT ON public.server_metrics_latest TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The per-node rollup the admin panel calls.
--
--    One call per node returns the uptime figure AND the sparkline, already
--    downsampled server-side. At 1 sample/minute a 24-hour panel would
--    otherwise pull 1,440 rows per node, 14,400 for the fleet, on every
--    refresh; this returns p_buckets points (48 by default).
--
--    HOW UPTIME IS DEFINED, because the obvious definition is wrong:
--
--      A node whose agent is dead writes NO ROWS. "Percentage of stored samples
--      where xray_active" would therefore score a completely dead node at 100%
--      — the outage is invisible because the evidence of it is the absence of
--      evidence. So uptime is measured against EXPECTED samples:
--
--        expected  = floor(window_seconds / p_sample_interval_seconds)
--        uptime_pct = 100 * (samples where xray_active IS TRUE) / expected
--
--      A missing sample counts as down. That is the honest reading and it is
--      also the conservative one.
--
--      `coverage_pct` is reported alongside so the two failure modes stay
--      distinguishable: low uptime with high coverage means xray was down; low
--      uptime with low coverage means we could not see the node at all. Both
--      are outages; they need different responses.
--
--      `reachable_pct` is computed over MEASURED samples only, not expected —
--      it answers "when we could see this node, was its exit IP being refused",
--      which is a different question and would be meaningless if diluted by
--      absent samples.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.server_metrics_rollup(
  p_server_id       uuid,
  p_window          interval DEFAULT '24 hours'::interval,
  p_buckets         integer  DEFAULT 48,
  p_sample_interval interval DEFAULT '1 minute'::interval
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
  v_t1        timestamptz := now();
  v_t0        timestamptz;
  v_buckets   integer;
  v_stride    interval;
  v_window_s  double precision;
  v_sample_s  double precision;
  v_expected  bigint;
  v_result    jsonb;
BEGIN
  IF p_server_id IS NULL THEN
    RAISE EXCEPTION 'server_metrics_rollup: p_server_id is required';
  END IF;

  v_window_s := extract(epoch FROM p_window);
  v_sample_s := extract(epoch FROM p_sample_interval);

  IF v_window_s IS NULL OR v_window_s <= 0 THEN
    RAISE EXCEPTION 'server_metrics_rollup: p_window must be positive (got %)', p_window;
  END IF;
  IF v_sample_s IS NULL OR v_sample_s <= 0 THEN
    RAISE EXCEPTION 'server_metrics_rollup: p_sample_interval must be positive (got %)',
                    p_sample_interval;
  END IF;

  -- Bounded so a caller cannot ask for a 100k-point sparkline.
  v_buckets := greatest(1, least(coalesce(p_buckets, 48), 500));
  v_t0      := v_t1 - p_window;
  -- make_interval(secs => ...) rather than `p_window / v_buckets`: date_bin
  -- refuses a stride containing months or years, so a caller passing
  -- p_window => '1 month' would otherwise get a runtime error instead of a
  -- month-wide sparkline. A pure-seconds stride is always legal.
  v_stride  := make_interval(secs => v_window_s / v_buckets);
  v_expected := greatest(1, floor(v_window_s / v_sample_s)::bigint);

  WITH src AS (
    SELECT m.*
    FROM public.server_metrics m
    WHERE m.server_id = p_server_id
      AND m.sampled_at >= v_t0
      AND m.sampled_at <= v_t1
  ),
  agg AS (
    SELECT
      count(*)                                                    AS samples,
      count(*) FILTER (WHERE xray_active IS TRUE)                 AS up_samples,
      count(*) FILTER (WHERE xray_active IS NOT NULL)             AS xray_measured,
      count(*) FILTER (WHERE reachability_status IS NOT NULL
                         AND reachability_status <> 'unknown')    AS reach_measured,
      count(*) FILTER (WHERE reachability_status = 'ok')          AS reach_ok,
      count(*) FILTER (WHERE reachability_status = 'blocked')     AS reach_blocked,
      max(connections)                                            AS peak_connections,
      avg(connections)::numeric(12,1)                             AS avg_connections,
      max(distinct_peers)                                         AS peak_distinct_peers,
      avg(cpu_load1)::numeric(8,2)                                AS avg_cpu_load1,
      max(cpu_load1)                                              AS peak_cpu_load1,
      avg(memory_used_pct)::numeric(5,2)                          AS avg_memory_used_pct,
      max(memory_used_pct)                                        AS peak_memory_used_pct,
      avg(net_rtt_ms)::numeric(10,1)                              AS avg_net_rtt_ms
    FROM src
  ),
  buckets AS (
    SELECT
      date_bin(v_stride, s.sampled_at, v_t0)                      AS bucket_at,
      count(*)                                                    AS n,
      count(*) FILTER (WHERE s.xray_active IS TRUE)               AS n_up,
      avg(s.connections)::numeric(12,1)                           AS connections,
      avg(s.distinct_peers)::numeric(12,1)                        AS distinct_peers,
      avg(s.cpu_load1)::numeric(8,2)                              AS cpu_load1,
      avg(s.memory_used_pct)::numeric(5,2)                        AS memory_used_pct,
      avg(s.net_rtt_ms)::numeric(10,1)                            AS net_rtt_ms,
      -- Worst verdict in the bucket wins: one 'blocked' sample in an hour is
      -- the fact worth surfacing, not the 59 that were fine.
      CASE
        WHEN count(*) FILTER (WHERE s.reachability_status = 'blocked') > 0 THEN 'blocked'
        WHEN count(*) FILTER (WHERE s.reachability_status = 'ok')      > 0 THEN 'ok'
        WHEN count(*) FILTER (WHERE s.reachability_status IS NOT NULL) > 0 THEN 'unknown'
        ELSE NULL
      END                                                         AS reachability_status
    FROM src s
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'server_id',           p_server_id,
    'window_start',        v_t0,
    'window_end',          v_t1,
    'bucket_seconds',      round(extract(epoch FROM v_stride)::numeric, 3),
    'buckets',             v_buckets,
    'sample_interval_s',   round(v_sample_s::numeric, 3),

    'samples',             a.samples,
    'expected_samples',    v_expected,
    -- Capped at 100: a node sampled slightly faster than p_sample_interval
    -- should read "fully covered", not 103%.
    'coverage_pct',        least(100.0, round(100.0 * a.samples / v_expected, 2)),

    -- See the header: measured against EXPECTED samples, so an agent that
    -- stopped answering counts as downtime rather than vanishing.
    'uptime_pct',          least(100.0, round(100.0 * a.up_samples / v_expected, 2)),
    'uptime_basis',        'expected_samples',
    'xray_measured',       a.xray_measured,

    -- Over measured samples only — a different question, deliberately.
    'reachable_pct',       CASE WHEN a.reach_measured > 0
                                THEN round(100.0 * a.reach_ok / a.reach_measured, 2)
                                ELSE NULL END,
    'blocked_samples',     a.reach_blocked,

    'peak_connections',    a.peak_connections,
    'avg_connections',     a.avg_connections,
    'peak_distinct_peers', a.peak_distinct_peers,
    'avg_cpu_load1',       a.avg_cpu_load1,
    'peak_cpu_load1',      a.peak_cpu_load1,
    'avg_memory_used_pct', a.avg_memory_used_pct,
    'peak_memory_used_pct',a.peak_memory_used_pct,
    'avg_net_rtt_ms',      a.avg_net_rtt_ms,

    'series', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
                't',                   b.bucket_at,
                'samples',             b.n,
                'up_pct',              round(100.0 * b.n_up / b.n, 1),
                'connections',         b.connections,
                'distinct_peers',      b.distinct_peers,
                'cpu_load1',           b.cpu_load1,
                'memory_used_pct',     b.memory_used_pct,
                'net_rtt_ms',          b.net_rtt_ms,
                'reachability_status', b.reachability_status
              ) ORDER BY b.bucket_at)
       FROM buckets b),
      '[]'::jsonb)
  )
  INTO v_result
  FROM agg a;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.server_metrics_rollup(uuid, interval, integer, interval) IS
  'WS5. One round trip per node for the admin panel: uptime over the window plus a '
  'downsampled sparkline (p_buckets points, default 48, hard-capped at 500), instead of '
  'thousands of raw rows. uptime_pct is measured against EXPECTED samples, so a node whose '
  'agent stopped answering scores as DOWN rather than as 100% — a dead agent writes no rows, '
  'and a percentage over stored rows alone would score it perfect. coverage_pct separates '
  '"xray was down" from "we could not see the node". service_role only.';

REVOKE ALL ON FUNCTION public.server_metrics_rollup(uuid, interval, integer, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.server_metrics_rollup(uuid, interval, integer, interval)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_metrics_rollup(uuid, interval, integer, interval)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- 7. SCHEDULING THE PRUNE — a deliberate, separate step
-- =============================================================================
--
-- THIS MIGRATION SCHEDULES NOTHING. Whether pg_cron is installed on
-- fzlrhmjdjjzcgstaeblu has never been directly confirmed: the 6-hourly expiry
-- sweeper's existence is INFERRED from updated_at landing on exact UTC
-- boundaries (SUBSCRIPTION-AND-ANTIFRAUD.md §6c), and that document says
-- plainly that `SELECT * FROM cron.job` is the query that would settle it and
-- that it has not been run. Shipping a `cron.schedule()` call on that basis
-- would either fail the whole migration on a missing schema or silently create
-- a second scheduler nobody knows about.
--
-- So: run R2, then pick one.
--
--   IF pg_cron IS present — daily at 03:20 UTC, off the 6-hourly sweeper's
--   boundaries so the two never contend:
--
--     SELECT cron.schedule(
--       'prune-server-metrics', '20 3 * * *',
--       $$SELECT public.prune_server_metrics(30);$$);
--
--     -- verify, then watch it:
--     SELECT jobid, jobname, schedule, active FROM cron.job
--      WHERE jobname = 'prune-server-metrics';
--     SELECT status, return_message, start_time
--       FROM cron.job_run_details
--      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='prune-server-metrics')
--      ORDER BY start_time DESC LIMIT 5;
--
--   IF pg_cron IS ABSENT — the caller must schedule it. The metrics collector
--   is already going to be a scheduled service-role job (n8n on POLAND, or a
--   Vercel cron); give it one extra daily step:
--
--     POST {SUPABASE_URL}/rest/v1/rpc/prune_server_metrics
--       apikey: <service role>            body: {"p_keep_days": 30}
--
--   EITHER WAY, ALERT ON IT. Unpruned, this table grows ~5.3M rows/year, which
--   is survivable — the failure is silent and slow, not sudden. Check monthly:
--
--     SELECT count(*), min(sampled_at), max(sampled_at),
--            pg_size_pretty(pg_total_relation_size('public.server_metrics'))
--     FROM public.server_metrics;
--
-- =============================================================================
-- 8. THE WRITER (not created here) — the contract a collector must honour
-- =============================================================================
--
--   INSERT INTO public.server_metrics (
--     server_id, sampled_at, agent_version, connections, distinct_peers,
--     cpu_load1, cpu_cores, memory_used_pct,
--     traffic_up_bytes, traffic_down_bytes,
--     reachability_status, reachability_status_code,
--     xray_active, uptime_s, agent_compute_ms, net_rtt_ms)
--   VALUES (...)
--   ON CONFLICT (server_id, sampled_at) DO NOTHING;
--
--   Rules the collector must follow, all of which exist because a wrong value
--   here is worse than no value:
--
--     * Pass NULL, never 0, for any key the payload did not contain. An agent
--       without `agent_version` is a pre-v2 build: `reachability`,
--       `distinct_peers` and `agent_version` are simply absent and NOTHING may
--       be inferred from their absence.
--     * `reachability.status == 'unknown'` with a null `checked_at` means no
--       probe has completed yet. Store 'unknown'. Never map it to 'ok'.
--     * A node that does not answer at all DOES write a row, with every metric
--       null. An earlier draft of this section said the opposite; it was wrong
--       and contradicted this file's own rollup. `uptime_pct` divides by
--       EXPECTED samples, not by rows present (see section 6), so a null row
--       cannot inflate it — a dead node contributes no `xray_active IS TRUE`
--       either way. What the null row buys is the distinction the absence
--       cannot express: "one node is down" leaves that node at full
--       coverage_pct with zero uptime_pct, while "the collector itself died"
--       collapses coverage_pct across every node at once. Without the row both
--       read as zero coverage, coverage_pct merely restates uptime_pct, and
--       collector liveness becomes unanswerable from the data.
--     * `sampled_at` is the agent's `ts` when it has one. A node that did not
--       answer has none, and a node whose clock is badly skewed would collide
--       with itself forever under the unique constraint, so both fall back to
--       the sweep's own second-truncated clock and log that they did.
--     * `net_rtt_ms` is a TCP handshake to the node's REALITY port, NOT the
--       /stats round trip: it still yields a number when the agent is dead but
--       xray is alive, which is exactly the case worth telling apart. The
--       agent's own share of a /stats call is already `agent_compute_ms`.
--
-- =============================================================================
-- 9. POST-APPLY VERIFICATION
-- =============================================================================
--
--   -- 9.1 anon is locked out. Run with the ANON key, not psql:
--   --   curl -s "$SUPABASE_URL/rest/v1/server_metrics?limit=1" -H "apikey: $ANON_KEY"
--   -- Expect a permission error, not [].
--
--   -- 9.2 Round trip on real ids (rolls back, writes nothing):
--   BEGIN;
--     INSERT INTO public.server_metrics (server_id, sampled_at, xray_active, connections)
--     SELECT id, date_trunc('second', now()), true, 42 FROM public.vpn_servers LIMIT 1;
--     SELECT * FROM public.server_metrics_latest;
--     SELECT public.server_metrics_rollup(
--              (SELECT server_id FROM public.server_metrics_latest LIMIT 1),
--              '1 hour', 12);
--     -- expect uptime_pct ~ 1.67 (1 up sample out of 60 expected) and
--     -- coverage_pct ~ 1.67 — i.e. the definition in section 6 behaving.
--   ROLLBACK;
--
--   -- 9.3 The read path is an index scan, not a seq scan:
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM public.server_metrics
--   WHERE server_id = '<uuid>' AND sampled_at > now() - interval '6 hours'
--   ORDER BY sampled_at DESC;
--   -- expect: Index Scan Backward using server_metrics_server_sample_key
-- =============================================================================
