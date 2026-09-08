-- =============================================================================
-- 20260908T203000 — WS6: exit proxies for flagged domains
-- =============================================================================
--
-- WHY
--   OpenAI and the Cloudflare-gated sites behind it refuse datacenter IPs. The
--   whole Doppler fleet is datacenter IPs, so a Pro customer connects
--   successfully and then cannot open ChatGPT. The node-side answer already
--   exists as a hand-merged config fragment —
--   `landing/infrastructure/xray/routing-flagged-domains.json` — which routes a
--   fixed list of domains to a `flagged-upstream` SOCKS/HTTP outbound while
--   everything else keeps the fast direct path. What does not exist is anywhere
--   to record WHICH upstream is attached to WHICH node, so the fragment carries
--   `REPLACE_UPSTREAM_USER` placeholders and a 203.0.113.10 example address and
--   every node is edited by hand.
--
--   This is that record: proxies, attachments, domain sets, and one RPC a
--   node-side syncer calls to render its own fragment.
--
-- INERT BY CONSTRUCTION
--   No proxies are being purchased yet. This migration is designed to be
--   correct and harmless with zero rows:
--     * `exit_proxies.enabled` DEFAULTS TO FALSE, so even an accidental insert
--       routes nothing.
--     * The only seeded data is a domain SET — ten domain names, no credentials,
--       no host, no attachment. A set with nothing attached to it does nothing.
--     * The RPC returns `{"assignments": []}` for every server today. Nothing
--       else in the database reads these tables, and no existing function is
--       modified.
--   Verified: this file creates three tables, three triggers, one RPC and one
--   seed row. It contains no CREATE OR REPLACE for vpn_servers_safe,
--   get_servers or get_servers_v2, and does not read or write vpn_servers
--   except as an FK target and in the RPC's optional IP lookup.
--
-- =============================================================================
-- CREDENTIALS — HOW THE PASSWORD IS PROTECTED. READ THIS.
-- =============================================================================
--
--   `exit_proxies.password` is stored as PLAINTEXT `text`. Its protection is
--   access control, and nothing else:
--
--     1. RLS is ENABLED on `exit_proxies` with NO permissive policy.
--     2. ALL privileges are REVOKED from PUBLIC, anon and authenticated. That
--        matters: Supabase grants anon/authenticated ALL on new public tables
--        by default, so without the REVOKE the table would be world-readable
--        through PostgREST the moment it is created.
--     3. Only service_role holds SELECT/INSERT/UPDATE/DELETE.
--     4. The single read path for a node — `node_exit_proxy_assignment` — is
--        SECURITY DEFINER and granted to service_role ONLY.
--
--   NO ENCRYPTION EXTENSION IS ASSUMED OR USED. pgsodium and Supabase Vault are
--   NOT relied on anywhere in this file, because neither has been confirmed
--   present on fzlrhmjdjjzcgstaeblu and a migration that assumes an absent
--   extension either fails to apply or, worse, appears to encrypt and does not.
--
--   THE HONEST CEILING: anyone holding the service-role key, or direct database
--   access, or a database backup, reads these passwords in the clear. That is
--   exactly the same posture as `vpn_servers.stats_agent_token` and the
--   `marzban_*` credential columns that already live one table over, so this
--   adds no new class of exposure — but it does not remove one either. Treat a
--   service-role key leak as a proxy-credential leak.
--
--   IF YOU WANT REAL ENCRYPTION, it is a separate, later change and it must
--   start by establishing what is installed:
--
--     SELECT extname FROM pg_extension WHERE extname IN ('pgsodium','supabase_vault');
--     SELECT * FROM pg_available_extensions WHERE name IN ('pgsodium','supabase_vault');
--
--   With Vault present the shape would be: store `vault.create_secret(password)`
--   and keep only the returned uuid in a `password_secret_id` column, then read
--   it back inside the SECURITY DEFINER RPC via `vault.decrypted_secrets`. That
--   column is deliberately NOT added here — an unused nullable column invites
--   somebody to half-migrate to it and end up with the password in two places.
--
-- =============================================================================
-- PRE-FLIGHT
-- =============================================================================
--
--   S1. FK target type: `public.vpn_servers(id)` must be uuid.
--         SELECT column_name, data_type FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='vpn_servers' AND column_name='id';
--
--   S2. The RPC's optional lookup reads `vpn_servers.ip_address`. Confirm it
--       exists and confirm whether it is unique in practice — if two rows share
--       an IP the lookup raises rather than guessing:
--         SELECT ip_address, count(*) FROM public.vpn_servers
--         GROUP BY 1 HAVING count(*) > 1;
--
--   S3. An updated_at trigger function must exist. This repo has TWO —
--       `public.update_updated_at_column()` (supabase/schema.sql) and
--       `public.update_updated_at()` (20241226_accounts_and_devices.sql). §5
--       detects which is present rather than guessing. Confirm at least one is:
--         SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--         WHERE n.nspname='public'
--           AND proname IN ('update_updated_at_column','update_updated_at');
--
--   S4. After applying, confirm with the ANON key that
--       `GET /rest/v1/exit_proxies` returns a permission error, not `[]`.
--       This is the check that matters most in this file.
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
-- 1. Domain sets — named lists of what to route through an upstream.
--
--    Stored as a text[] rather than a child table because the consumer is xray,
--    whose routing rule takes exactly this: a JSON array of match strings. One
--    row is one rule's `domain` array, one round trip, no ORDER BY to get
--    wrong, and no chance of a half-written set being read mid-insert.
--
--    THE ENTRIES KEEP THEIR `domain:` PREFIX. That prefix is xray syntax
--    meaning "this domain and all subdomains" (as opposed to `full:`, `regexp:`
--    or a bare substring match). Storing bare hostnames here would mean the
--    syncer had to re-add a prefix it cannot infer — `intercom.io` and
--    `full:intercom.io` are different rules. What is stored is what xray gets.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.proxy_domain_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,

  -- xray match expressions, verbatim. Non-empty, no NULL elements, no blanks.
  domains     text[] NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- array_length is IMMUTABLE, so it is legal in a CHECK. The per-element rules
  -- (no NULLs, no blanks) are NOT expressible in one: a CHECK may not contain a
  -- subquery, which rules out `unnest`, and array_position is not IMMUTABLE,
  -- which rules out the usual `array_position(domains, NULL) IS NULL` idiom.
  -- They are enforced by the trigger below instead — same guarantee, legal SQL.
  CONSTRAINT proxy_domain_sets_domains_nonempty
    CHECK (array_length(domains, 1) >= 1)
);

-- Per-element validation. A NULL or blank entry here becomes a malformed xray
-- routing rule on ten nodes at once, so it is rejected at write time rather
-- than discovered at reload time.
CREATE OR REPLACE FUNCTION public.proxy_domain_sets_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  d text;
BEGIN
  IF NEW.domains IS NULL OR array_length(NEW.domains, 1) IS NULL THEN
    RAISE EXCEPTION 'proxy_domain_sets.domains must contain at least one entry';
  END IF;

  FOREACH d IN ARRAY NEW.domains LOOP
    IF d IS NULL THEN
      RAISE EXCEPTION 'proxy_domain_sets.domains contains a NULL entry (set %)', NEW.name;
    END IF;
    IF btrim(d) = '' THEN
      RAISE EXCEPTION 'proxy_domain_sets.domains contains a blank entry (set %)', NEW.name;
    END IF;
    IF d <> btrim(d) THEN
      RAISE EXCEPTION
        'proxy_domain_sets.domains entry %L has leading/trailing whitespace (set %); '
        'xray matches the literal string', d, NEW.name;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.proxy_domain_sets_validate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proxy_domain_sets_validate() FROM anon, authenticated;

DROP TRIGGER IF EXISTS proxy_domain_sets_validate ON public.proxy_domain_sets;
CREATE TRIGGER proxy_domain_sets_validate
  BEFORE INSERT OR UPDATE OF domains ON public.proxy_domain_sets
  FOR EACH ROW EXECUTE FUNCTION public.proxy_domain_sets_validate();

COMMENT ON TABLE public.proxy_domain_sets IS
  'WS6. Named lists of xray routing match expressions. Entries keep their xray prefix '
  '(``domain:`` = this host and all subdomains) because the syncer drops them straight into a '
  'routing rule and cannot infer a prefix it was not given.';

COMMENT ON COLUMN public.proxy_domain_sets.domains IS
  'xray match expressions, verbatim — e.g. ''domain:openai.com''. Never bare hostnames.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The proxies themselves.
--
--    `enabled` defaults to FALSE. Buying a proxy, recording it, and putting it
--    in the traffic path are three separate decisions and this column keeps
--    them separate. A row inserted with defaults routes nothing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exit_proxies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Operator-facing name. Unique so a human can refer to one unambiguously.
  label                  text NOT NULL UNIQUE,

  -- Matches the xray outbound `protocol` field exactly. routing-flagged-domains.json:
  -- "Use protocol 'http' instead of 'socks' if the provider only exposes an HTTP
  -- proxy (same settings shape)."
  protocol               text NOT NULL CHECK (protocol IN ('socks','http')),

  -- text, not inet: providers routinely hand out a hostname, and a residential
  -- endpoint's address can change under a stable name. Storing inet would force
  -- resolution at write time and lose that.
  host                   text NOT NULL CHECK (btrim(host) <> ''),
  port                   integer NOT NULL CHECK (port BETWEEN 1 AND 65535),

  -- NULL = an unauthenticated proxy (IP-allowlisted). Both must be NULL or both
  -- set; a username with no password is a misconfiguration, not a state.
  username               text,
  password               text,

  country_code           text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  provider               text,

  enabled                boolean NOT NULL DEFAULT false,

  last_check_at          timestamptz,
  last_check_status      text CHECK (last_check_status IS NULL
                                     OR last_check_status IN ('ok','fail','unknown')),
  last_check_status_code integer,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exit_proxies_credentials_paired
    CHECK ((username IS NULL) = (password IS NULL))
);

COMMENT ON TABLE public.exit_proxies IS
  'WS6. Clean upstream proxies that flagged domains exit through. CREDENTIALS ARE PLAINTEXT: '
  'protected by RLS-with-no-policy plus service_role-only grants, NOT by encryption. No '
  'pgsodium/Vault dependency is assumed — see this migration''s header for the ceiling and for '
  'what a real encryption migration would look like. enabled defaults FALSE so a recorded '
  'proxy is inert until deliberately switched on.';

COMMENT ON COLUMN public.exit_proxies.password IS
  'PLAINTEXT. Readable by anyone holding the service-role key, direct DB access, or a backup. '
  'Same posture as vpn_servers.stats_agent_token and the marzban_* columns. Treat a '
  'service-role key leak as a proxy-credential leak.';

COMMENT ON COLUMN public.exit_proxies.last_check_status IS
  'Tri-state, mirroring stats-agent.py''s reachability convention: ''unknown'' is NOT ''ok''. '
  'A probe that threw must never be recorded as healthy.';

-- Same endpoint + same credentials recorded twice is a data-entry mistake, not
-- two proxies. coalesce() rather than UNIQUE NULLS NOT DISTINCT so the
-- constraint behaves identically on any server version.
CREATE UNIQUE INDEX IF NOT EXISTS exit_proxies_endpoint_key
  ON public.exit_proxies (host, port, coalesce(username, ''));

CREATE INDEX IF NOT EXISTS exit_proxies_enabled_idx
  ON public.exit_proxies (id) WHERE enabled;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Attachments: which proxy carries which domain set, on which node.
--
--    UNIQUENESS, and why it is shaped this way:
--
--      * UNIQUE (server_id, proxy_id, domain_set_id) — the same proxy may carry
--        TWO different sets on one node (say an OpenAI set and a
--        Cloudflare-gated set), which is a legitimate configuration, so
--        (server_id, proxy_id) alone would be too strict. What is never
--        legitimate is the identical triple twice.
--
--      * UNIQUE (server_id, domain_set_id, priority) — within one node and one
--        set, the ordering must be total. Two proxies tied at priority 100
--        would make the failover order depend on whatever the planner felt like
--        that day, and the syncer would rewrite the node config on no change.
--        Ordering is the entire purpose of the column, so ties are an error.
--
--    domain_set_id is NOT NULL: an attachment that routes nothing is not a
--    thing anybody wants, and ON DELETE RESTRICT means deleting a set that is
--    still in use fails loudly instead of silently detaching live routing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.server_exit_proxies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  server_id     uuid NOT NULL REFERENCES public.vpn_servers(id)      ON DELETE CASCADE,
  proxy_id      uuid NOT NULL REFERENCES public.exit_proxies(id)     ON DELETE CASCADE,
  domain_set_id uuid NOT NULL REFERENCES public.proxy_domain_sets(id) ON DELETE RESTRICT,

  -- Lower first. Gaps are fine and encouraged: 100/200/300 leaves room to
  -- insert a proxy between two others without renumbering under a UNIQUE.
  priority      integer NOT NULL DEFAULT 100 CHECK (priority > 0),

  enabled       boolean NOT NULL DEFAULT true,
  notes         text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT server_exit_proxies_unique_attachment
    UNIQUE (server_id, proxy_id, domain_set_id),
  CONSTRAINT server_exit_proxies_unique_priority
    UNIQUE (server_id, domain_set_id, priority)
);

COMMENT ON TABLE public.server_exit_proxies IS
  'WS6. Which exit proxy carries which domain set on which node, in priority order (lower '
  'first). Both unique constraints are load-bearing: the first forbids the identical triple '
  'twice while still allowing one proxy to carry two different sets on a node; the second '
  'forbids ties, because a tie makes failover order nondeterministic.';

-- server_id is the leftmost column of server_exit_proxies_unique_attachment, so
-- it is already indexed. The other two FKs are not — unindexed FK columns turn
-- an ON DELETE CASCADE and every join into a sequential scan.
CREATE INDEX IF NOT EXISTS server_exit_proxies_proxy_id_idx
  ON public.server_exit_proxies (proxy_id);
CREATE INDEX IF NOT EXISTS server_exit_proxies_domain_set_id_idx
  ON public.server_exit_proxies (domain_set_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Access control. Credentials live here; this section is the protection.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.proxy_domain_sets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exit_proxies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_exit_proxies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.proxy_domain_sets   FROM PUBLIC;
REVOKE ALL ON TABLE public.exit_proxies        FROM PUBLIC;
REVOKE ALL ON TABLE public.server_exit_proxies FROM PUBLIC;

REVOKE ALL ON TABLE public.proxy_domain_sets   FROM anon, authenticated;
REVOKE ALL ON TABLE public.exit_proxies        FROM anon, authenticated;
REVOKE ALL ON TABLE public.server_exit_proxies FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proxy_domain_sets   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exit_proxies        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.server_exit_proxies TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. updated_at triggers.
--
--    This repo has two updated_at trigger functions with different names
--    (see S3). Rather than guess and fail the whole migration on a name, detect
--    which exists and wire the triggers to it.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_fn text;
  v_tbl text;
BEGIN
  SELECT quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '()'
  INTO v_fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('update_updated_at_column', 'update_updated_at')
    AND p.pronargs = 0
  ORDER BY CASE p.proname WHEN 'update_updated_at_column' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_fn IS NULL THEN
    RAISE EXCEPTION
      'No updated_at trigger function found in public (looked for '
      'update_updated_at_column / update_updated_at). See pre-flight S3.';
  END IF;

  FOREACH v_tbl IN ARRAY ARRAY['proxy_domain_sets','exit_proxies','server_exit_proxies'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_tbl || '_updated_at', v_tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION %s',
      v_tbl || '_updated_at', v_tbl, v_fn);
  END LOOP;

  RAISE NOTICE 'WS6: updated_at triggers wired to %', v_fn;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Seed: the OpenAI set.
--
--    These ten entries are copied EXACTLY from the `routing` rule in
--    `landing/infrastructure/xray/routing-flagged-domains.json`, in the same
--    order, prefixes included. If that file changes, this row is what must be
--    changed to match — the file is the fragment a human merges today, this row
--    is what the syncer will render tomorrow, and the two disagreeing is the
--    failure mode worth guarding against.
--
--    Seeding a SET is not seeding a route. There is no proxy and no attachment,
--    so this row changes nothing about how any node behaves.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.proxy_domain_sets (name, description, domains)
VALUES (
  'openai',
  'ChatGPT/OpenAI and the Cloudflare-gated assets and support widgets it loads. '
  'Copied verbatim from landing/infrastructure/xray/routing-flagged-domains.json. '
  'Requires the inbound to have sniffing enabled (destOverride tls/http) so xray sees the '
  'SNI/host; Marzban''s VLESS-Reality inbound has this on by default.',
  ARRAY[
    'domain:openai.com',
    'domain:chatgpt.com',
    'domain:chat.openai.com',
    'domain:oaistatic.com',
    'domain:oaiusercontent.com',
    'domain:cdn.openai.com',
    'domain:auth0.openai.com',
    'domain:featureassets.org',
    'domain:intercom.io',
    'domain:intercomcdn.com'
  ]::text[]
)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The node-side RPC: one server's whole proxy assignment, one round trip.
--
--    A syncer on the node calls this, renders the `outbounds` + `routing.rules`
--    fragment, and reloads xray. Everything it needs is in the response:
--    protocol, host, port, credentials, priority order, and the domain list for
--    each attachment. No second call, no local config file to drift.
--
--    Returns ONLY enabled attachments of enabled proxies, ordered by priority
--    then label. `label` is the tiebreaker for cross-set ordering; within one
--    set the UNIQUE constraint has already made ties impossible.
--
--    It returns CREDENTIALS, so it is SECURITY DEFINER and service_role only.
--    It is the only sanctioned read path for `exit_proxies.password`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.node_exit_proxy_assignment(
  p_server_id  uuid DEFAULT NULL,
  p_ip_address text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
  v_server_id uuid;
  v_n         integer;
  v_result    jsonb;
BEGIN
  IF p_server_id IS NULL AND p_ip_address IS NULL THEN
    RAISE EXCEPTION 'node_exit_proxy_assignment: pass p_server_id or p_ip_address';
  END IF;

  IF p_server_id IS NOT NULL THEN
    v_server_id := p_server_id;
  ELSE
    -- A node knows its own public IP; it may not know its vpn_servers uuid.
    -- Ambiguity is an error, never a guess: silently picking one of two rows
    -- would hand a node another node's credentials.
    SELECT count(*) INTO v_n FROM public.vpn_servers WHERE ip_address = p_ip_address;
    IF v_n > 1 THEN
      RAISE EXCEPTION
        'node_exit_proxy_assignment: % vpn_servers rows share ip_address %; pass p_server_id',
        v_n, p_ip_address;
    END IF;
    SELECT id INTO v_server_id FROM public.vpn_servers WHERE ip_address = p_ip_address;
  END IF;

  IF v_server_id IS NULL THEN
    RAISE EXCEPTION 'node_exit_proxy_assignment: no vpn_servers row for ip_address %',
                    p_ip_address;
  END IF;

  SELECT jsonb_build_object(
    'server_id',    v_server_id,
    'generated_at', now(),
    'assignments',  coalesce(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'attachment_id', sep.id,
                  'priority',      sep.priority,
                  'proxy', jsonb_build_object(
                    'id',           ep.id,
                    'label',        ep.label,
                    'protocol',     ep.protocol,
                    'host',         ep.host,
                    'port',         ep.port,
                    'username',     ep.username,
                    'password',     ep.password,
                    'country_code', ep.country_code,
                    'provider',     ep.provider
                  ),
                  'domain_set', jsonb_build_object(
                    'id',      pds.id,
                    'name',    pds.name,
                    'domains', to_jsonb(pds.domains)
                  )
                )
                ORDER BY sep.priority ASC, ep.label ASC)
       FROM public.server_exit_proxies sep
       JOIN public.exit_proxies        ep  ON ep.id  = sep.proxy_id
       JOIN public.proxy_domain_sets   pds ON pds.id = sep.domain_set_id
       WHERE sep.server_id = v_server_id
         AND sep.enabled
         AND ep.enabled),
      '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.node_exit_proxy_assignment(uuid, text) IS
  'WS6. One server''s complete exit-proxy assignment in one round trip: enabled proxies in '
  'priority order, WITH CREDENTIALS, each with the domain set it routes. The only sanctioned '
  'read path for exit_proxies.password. Resolves the server by uuid, or by ip_address when the '
  'node does not know its uuid — an ambiguous IP raises rather than guessing, because guessing '
  'would hand a node another node''s credentials. Returns {"assignments": []} when nothing is '
  'attached, which is every server today. service_role only.';

REVOKE ALL ON FUNCTION public.node_exit_proxy_assignment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.node_exit_proxy_assignment(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.node_exit_proxy_assignment(uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- 8. POST-APPLY VERIFICATION
-- =============================================================================
--
--   -- 8.1 THE IMPORTANT ONE. Run with the ANON key, not psql. All three must
--   --     be a permission error, NOT an empty array:
--   --   for t in exit_proxies server_exit_proxies proxy_domain_sets; do
--   --     curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" -H "apikey: $ANON_KEY"; echo; done
--
--   -- 8.2 The seed landed, exactly ten entries, prefixes intact:
--   SELECT name, array_length(domains,1) AS n, domains
--   FROM public.proxy_domain_sets WHERE name = 'openai';
--   -- n must be 10 and every element must start with 'domain:'.
--
--   -- 8.3 Inert: every server returns an empty assignment list.
--   SELECT s.name, public.node_exit_proxy_assignment(s.id) -> 'assignments'
--   FROM public.vpn_servers s WHERE s.is_active;
--   -- every row must be [].
--
--   -- 8.4 The RPC actually assembles a route (rolls back, writes nothing):
--   BEGIN;
--     INSERT INTO public.exit_proxies (label, protocol, host, port, username, password,
--                                      country_code, provider, enabled)
--     VALUES ('scratch-check','socks','198.51.100.7',1080,'u','p','NL','none',true);
--     INSERT INTO public.server_exit_proxies (server_id, proxy_id, domain_set_id, priority)
--     SELECT (SELECT id FROM public.vpn_servers WHERE is_active LIMIT 1),
--            (SELECT id FROM public.exit_proxies WHERE label='scratch-check'),
--            (SELECT id FROM public.proxy_domain_sets WHERE name='openai'),
--            100;
--     SELECT jsonb_pretty(public.node_exit_proxy_assignment(
--              (SELECT id FROM public.vpn_servers WHERE is_active LIMIT 1)));
--   ROLLBACK;
--
--   -- 8.5 The constraints bite. Each of these must FAIL:
--   --   * a domain set containing NULL, '' or ' x ' (the validate trigger)
--   --   * the same (server_id, proxy_id, domain_set_id) twice
--   --   * two attachments at the same (server_id, domain_set_id, priority)
--   --   * a username with no password
--   --   * DELETE of a proxy_domain_sets row that is still attached (RESTRICT)
--
-- =============================================================================
-- 9. OPERATING IT — when a proxy is actually bought
-- =============================================================================
--
--   -- 9.1 Record it. It is INERT until enabled, so record first, test, then arm.
--   INSERT INTO public.exit_proxies
--     (label, protocol, host, port, username, password, country_code, provider)
--   VALUES ('nl-residential-1','socks','proxy.example.net',1080,'user','pass','NL','<provider>');
--
--   -- 9.2 Attach it to the nodes that need it, at the OpenAI set.
--   INSERT INTO public.server_exit_proxies (server_id, proxy_id, domain_set_id, priority)
--   SELECT s.id,
--          (SELECT id FROM public.exit_proxies      WHERE label = 'nl-residential-1'),
--          (SELECT id FROM public.proxy_domain_sets WHERE name  = 'openai'),
--          100
--   FROM public.vpn_servers s
--   WHERE s.country_code IN ('NL','DE');
--
--   -- 9.3 Arm it. One statement, and one statement to reverse it.
--   UPDATE public.exit_proxies SET enabled = true  WHERE label = 'nl-residential-1';
--
--   -- 9.4 KILL. Every node drops the route on its next sync.
--   UPDATE public.exit_proxies SET enabled = false WHERE label = 'nl-residential-1';
--
--   -- 9.5 Record a health check (whatever runs the probe writes this).
--   UPDATE public.exit_proxies
--      SET last_check_at = now(), last_check_status = 'ok', last_check_status_code = 200
--    WHERE label = 'nl-residential-1';
--   -- 'unknown' when the probe threw. NEVER 'ok'.
--
--   -- 9.6 What is live right now, without exposing a password:
--   SELECT s.name AS node, ep.label, ep.protocol, ep.host, ep.port, ep.country_code,
--          sep.priority, pds.name AS domain_set,
--          ep.enabled AND sep.enabled AS routing,
--          ep.last_check_status, ep.last_check_at
--   FROM public.server_exit_proxies sep
--   JOIN public.exit_proxies        ep  ON ep.id  = sep.proxy_id
--   JOIN public.proxy_domain_sets   pds ON pds.id = sep.domain_set_id
--   JOIN public.vpn_servers         s   ON s.id   = sep.server_id
--   ORDER BY s.name, pds.name, sep.priority;
--
--   -- 9.7 Keeping the JSON fragment and this table in step. The syncer replaces
--   --     routing-flagged-domains.json's hand-merged `flagged-upstream` outbound
--   --     and its rule. Until the syncer exists, whoever edits that file by hand
--   --     must mirror the change into the 'openai' set here, or the first sync
--   --     will silently revert their edit.
-- =============================================================================
