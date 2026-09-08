-- =============================================================================
-- 20260908T200000 — WS4 part 1: per-account VLESS identity (schema + sync RPC)
-- =============================================================================
--
-- WHY
--   Every customer on the fleet presents the SAME VLESS UUID,
--   `9c215195-aef6-49b5-b653-6226e0d280ed`. It is baked into every node's
--   xray config and into every `vpn_servers.config_data` URI (see
--   `.superpowers/sdd/okay-so-we-have-ethereal-spindle/task-5-report.md:141`
--   and the NL node payload at :210). Three consequences:
--
--     1. No node can count users. `stats-agent.py` says so in its own docstring:
--        "`distinct_peers` ... still not an account count, since every client
--        presents the same shared VLESS UUID".
--
--        The scale of that blindness, measured 2026-09-08: Hong Kong alone was
--        holding 2,197 established sockets, against 58 accounts fleet-wide
--        that satisfy the Pro predicate. One node's socket count exceeds the
--        entire paying customer base by ~38x. Anyone reading the Load column as
--        an occupancy figure is out by nearly two orders of magnitude. Nothing
--        on the node can currently do better, because there is nothing on the
--        wire that distinguishes one customer from another — which is what this
--        file changes.
--     2. Nobody can be revoked. Removing the one UUID from a node removes
--        every customer from that node.
--     3. A leaked config works forever, for anyone, on every node.
--
-- WHAT THIS FILE DOES (all additive, no existing function is touched)
--   1. `public.account_vless_uuid(text)` — the deterministic derivation.
--   2. `public.vless_uri_with_uuid(text, uuid)` — rewrites the userinfo part of
--      a `vless://` URI. Used by the get_servers_v2 patch in the NEXT file.
--   3. `accounts.vless_uuid` — stored, unique-indexed, backfilled, and
--      maintained for new rows by a BEFORE INSERT/UPDATE trigger.
--   4. `public.node_authorized_vless_uuids()` — the service-role-only RPC a
--      node-side syncer polls to learn which UUIDs should currently exist in
--      each xray inbound's client list.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--   * It does not touch `get_servers_v2`. That is a separate file
--     (20260908T201000) precisely because it CANNOT be applied without first
--     reconciling against the live function body.
--   * It does not touch `vpn_servers_safe`, `get_servers`, or
--     `vpn_servers.config_data`. The stored `config_data` keeps the shared
--     UUID; substitution happens at read time, per caller.
--   * It does not retire the shared UUID from any node. See §7.
--
-- =============================================================================
-- PRE-FLIGHT
-- =============================================================================
--
-- P1. `accounts` is NOT anon-readable. SETTLED — this is a record, not a gate.
--
--     This file adds a credential-equivalent value to `accounts`, so the first
--     question is whether anon can read that table. It cannot.
--
--     ### IGNORE `supabase/schema.sql` AND `20241226_accounts_and_devices.sql`
--     ### ON THIS POINT. THEIR POLICY DEFINITION IS STALE.
--
--     20241226_accounts_and_devices.sql:197-198 still reads
--
--         CREATE POLICY "Anyone can read accounts by account_id" ON accounts
--             FOR SELECT USING (true);
--
--     and that is NOT what production runs. The policy was tightened
--     out-of-band and no migration file records it — the same class of drift
--     that SRV-01 documents for get_servers_v2. Anyone re-reading those repo
--     files in six months will re-derive an alarm that has already been
--     answered. Do not. The live check below is the authority.
--
--     VERIFIED LIVE 2026-09-08 against fzlrhmjdjjzcgstaeblu, using the anon key
--     from the admin app's own environment:
--
--       # anon sees no rows at all
--       curl -sS "$SUPABASE_URL/rest/v1/accounts?select=created_at&limit=1" \
--            -H "apikey: $ANON_KEY"
--       # -> []
--
--       # anon's exact row count, via the count header
--       curl -sSI "$SUPABASE_URL/rest/v1/accounts?select=*&limit=0" \
--            -H "apikey: $ANON_KEY" -H "Prefer: count=exact"
--       # -> content-range: */0
--
--       # service_role's, for contrast
--       curl -sSI "$SUPABASE_URL/rest/v1/accounts?select=account_id&limit=0" \
--            -H "apikey: $SERVICE_ROLE_KEY" -H "Prefer: count=exact"
--       # -> content-range: */2825
--
--     2,825 accounts exist. service_role sees all 2,825; anon sees 0. The same
--     check was run on `device_tokens` and `vpn_servers` with the same result.
--     This corroborates the note already in the Windows client
--     (dopplerWindows/DopplerVPN/Services/SupabaseService.cs:748-755:
--     "verified live against a genuinely ACTIVE pro account, anon returns `[]`
--     and only service_role returns the row").
--
--     So adding `vless_uuid` here does not expose it. §6.5 still re-checks
--     after apply — not because this conclusion is in doubt, but because it
--     proves the NEW COLUMN did not arrive with a policy or grant of its own.
--     That is a confirmation, not a gate.
--
--     If you want the policy text itself rather than its effect:
--
--       SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
--              polroles::regrole[]
--       FROM pg_policy WHERE polrelid = 'public.accounts'::regclass;
--
--       SELECT grantee, privilege_type
--       FROM information_schema.role_table_grants
--       WHERE table_schema='public' AND table_name='accounts'
--         AND grantee IN ('anon','authenticated','PUBLIC');
--
-- P2. Which schema holds uuid-ossp? This file calls `uuid_generate_v5`
--     unqualified under `search_path = public, extensions`, which works whether
--     the extension is in `public` (as `supabase/schema.sql` implies) or in
--     `extensions` (the Supabase default).
--
--       SELECT e.extname, n.nspname
--       FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
--       WHERE e.extname IN ('uuid-ossp','pgcrypto');
--
--     If uuid-ossp is absent: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
--     WITH SCHEMA extensions;` before applying.
--
-- P3. Confirm the `accounts_updated_at` trigger name. §4 disables it for the
--     duration of the backfill so a one-off UPDATE does not stamp `updated_at`
--     on every account row. That column is load-bearing forensic evidence:
--     `SUBSCRIPTION-AND-ANTIFRAUD.md` §6c identifies the expiry sweeper purely
--     from `updated_at` landing on 6-hour UTC boundaries. A fleet-wide bump
--     destroys that signal permanently.
--
--       SELECT tgname FROM pg_trigger
--       WHERE tgrelid = 'public.accounts'::regclass AND NOT tgisinternal;
--
--     The DO block below detects the trigger by name and skips the disable if
--     it is absent, so a rename degrades to "backfill bumps updated_at", not
--     to an error. If the trigger has been renamed, edit §4 first.
--
-- P4. How big is the backfill? MEASURED 2026-09-08: 2,825 account rows, of
--     which 58 currently satisfy the Pro predicate.
--
--     2,825 rows is nothing. §4's single UPDATE is sub-second, so the
--     SHARE ROW EXCLUSIVE it holds on `accounts` (writes block, reads do not)
--     is a blip rather than a window that needs scheduling. The off-peak advice
--     that would apply at 100k+ rows does not apply here. `lock_timeout` stays
--     at 5s so the migration still fails fast rather than queueing behind live
--     traffic.
--
--     Re-run before applying if this file has been sitting for a while — the
--     number only matters if it has grown by two orders of magnitude:
--
--       SELECT count(*) AS total,
--              count(*) FILTER (WHERE subscription_tier IS NOT NULL
--                                 AND subscription_tier <> 'free'
--                                 AND subscription_expires_at IS NOT NULL
--                                 AND subscription_expires_at > now()) AS pro
--       FROM public.accounts;
--
-- P5. `subscription_tier` / `subscription_expires_at` must exist on `accounts`
--     with those exact names — the sync RPC reuses the Pro predicate from
--     `get_servers_v2`. Confirm:
--
--       SELECT column_name, data_type, is_nullable
--       FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='accounts'
--       ORDER BY ordinal_position;
--
-- HOW TO APPLY: this file carries its own BEGIN/COMMIT, so run it as the object
-- owner (postgres) through psql or the Dashboard SQL editor. If you instead go
-- through the Supabase CLI / `apply_migration`, which wraps the file in its own
-- transaction, STRIP the BEGIN and COMMIT first — 20260815202750_sni_health_view.sql
-- records that convention. Do not leave both.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The derivation.
--
--    UUIDv5 = SHA-1 over (namespace bytes || name bytes), with the version and
--    variant bits forced. It is a pure function, so ANY language can reproduce
--    it — which is the point: a node-side syncer, an admin script and this
--    database all arrive at the same value from `account_id` alone, with no
--    shared state to drift.
--
--    The namespace is itself derived, so it is auditable rather than random:
--
--        namespace = uuid_v5(NAMESPACE_DNS, 'vless.dopplervpn.org')
--                  = uuid_v5(6ba7b810-9dad-11d1-80b4-00c04fd430c8,
--                            'vless.dopplervpn.org')
--                  = eb1e5511-ab0f-5dec-b459-9a563b39fee7
--
--    Reproduce it in Python:
--        import uuid
--        ns = uuid.uuid5(uuid.NAMESPACE_DNS, 'vless.dopplervpn.org')
--        uuid.uuid5(ns, 'VPN-TEST-TEST-TEST')
--
--    Known-good vectors, computed offline, for the self-check in §6:
--        'VPN-TEST-TEST-TEST' -> cf39f654-78cf-5d07-b23d-2eafefe13797
--        'VPN-CKC4-348C-7PMQ' -> 37cc328a-c4ca-5ae5-ba6c-9cc1825a2562
--        'VPN-BXKQ-AUDB-ATY8' -> bc214b4b-22f6-5bbd-b894-888d927bd331
--
--    THE NAMESPACE IS FROZEN. Changing it re-derives every account's UUID and
--    invalidates every config cached on every device. If a future rotation is
--    ever needed, add a SECOND namespace and a version column — do not edit
--    this constant.
--
--    SECURITY MODEL, stated plainly. The namespace is in this file, so anyone
--    who knows an `account_id` can compute that account's VLESS UUID offline.
--    That is acceptable and deliberate: `account_id` IS the account credential
--    (it is the whole of the login), so knowing it already grants full access.
--    A guessing attack is bounded by the account-id space itself —
--    `generate_account_id()` draws 12 characters from a 32-symbol alphabet,
--    32^12 ~ 1.2e18. What this design does NOT provide is a UUID that survives
--    the disclosure of an account id; if that is ever wanted, the derivation
--    needs a server-side pepper held in Vault, and the node syncer then has to
--    read values from the RPC rather than compute them. That is a deliberate
--    trade, not an oversight.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_vless_uuid(p_account_id text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = 'public', 'extensions'
AS $function$
  SELECT uuid_generate_v5('eb1e5511-ab0f-5dec-b459-9a563b39fee7'::uuid, p_account_id);
$function$;

COMMENT ON FUNCTION public.account_vless_uuid(text) IS
  'WS4. Deterministic per-account VLESS UUID: uuid_v5(eb1e5511-ab0f-5dec-b459-9a563b39fee7, '
  'account_id), where the namespace is uuid_v5(NAMESPACE_DNS, ''vless.dopplervpn.org''). '
  'Pure function — reproducible in any language, which is how the node-side syncer and this '
  'database agree without shared state. The namespace is FROZEN: changing it invalidates every '
  'cached client config. Not an oracle worth handing out, so EXECUTE is service_role only, but '
  'note the value is computable offline by anyone holding the account_id.';

REVOKE ALL ON FUNCTION public.account_vless_uuid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_vless_uuid(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_vless_uuid(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rewriting the UUID inside a vless:// URI.
--
--    `vpn_servers.config_data` is a single string of the shape
--
--      vless://<uuid>@<host>:<port>?type=tcp&security=reality&sni=...&pbk=...#<name>
--
--    and `get_servers_v2` uses it TWICE per row: once raw, as the `config_data`
--    key, and once through `parse_vless_uri()`, whose output is merged over the
--    row with `||`. Both must see the same UUID or a client that reads the
--    parsed `id`/`uuid` field will disagree with a client that re-parses
--    `config_data` itself — and the two are different code paths on different
--    platforms. Substituting on the URI STRING, before either use, is the only
--    place that keeps them consistent by construction. It also means this file
--    needs no knowledge of what keys `parse_vless_uri` emits (its body exists
--    in no repo file; see the next migration's header).
--
--    Fail-open by design: a NULL uri, a NULL uuid, a string that does not start
--    with `vless://`, or one with no `@` is returned UNCHANGED. The worst case
--    is therefore "behaves exactly like today", never "returns a broken URI".
--
--    The first `@` is the correct split point: the userinfo segment of a VLESS
--    URI is a bare UUID and cannot itself contain `@`; any `@` in the query
--    string or the `#fragment` necessarily comes later.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.vless_uri_with_uuid(p_uri text, p_uuid uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_uri IS NULL OR p_uuid IS NULL          THEN p_uri
    WHEN lower(left(p_uri, 8)) <> 'vless://'      THEN p_uri
    WHEN position('@' IN p_uri) = 0               THEN p_uri
    ELSE 'vless://' || p_uuid::text || substr(p_uri, position('@' IN p_uri))
  END;
$function$;

COMMENT ON FUNCTION public.vless_uri_with_uuid(text, uuid) IS
  'WS4. Returns the vless:// URI with its userinfo UUID replaced. Returns the input unchanged '
  'for NULL, non-vless, or @-less input, so the worst case is current behaviour. Called twice '
  'per row in get_servers_v2 — once for the config_data key and once as the argument to '
  'parse_vless_uri — so the raw URI and the parsed fields can never disagree.';

REVOKE ALL ON FUNCTION public.vless_uri_with_uuid(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vless_uri_with_uuid(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vless_uri_with_uuid(text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The column, its index, and the trigger that maintains it.
--
--    Stored rather than computed on read so it is indexable, so the sync RPC is
--    an index scan rather than a seq scan + 1 SHA-1 per row, and so a future
--    per-account rotation remains possible (a GENERATED ALWAYS column would
--    have forbidden it forever).
--
--    The trigger only ever FILLS A NULL. It cannot overwrite a value that is
--    already set, which means: (a) the backfill in §4 is idempotent, (b) any
--    row that somehow escapes the backfill self-heals on its next UPDATE, and
--    (c) a deliberate future rotation survives.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS vless_uuid uuid;

COMMENT ON COLUMN public.accounts.vless_uuid IS
  'WS4. This account''s own VLESS client UUID, replacing the fleet-shared '
  '9c215195-aef6-49b5-b653-6226e0d280ed. Derived deterministically by '
  'public.account_vless_uuid(account_id) and maintained by the accounts_set_vless_uuid trigger. '
  'CREDENTIAL-EQUIVALENT: it must never be reachable by anon or authenticated. Returned to the '
  'owning device only, inside get_servers_v2, and only when that account is Pro.';

CREATE OR REPLACE FUNCTION public.accounts_set_vless_uuid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'extensions'
AS $function$
BEGIN
  -- Fill only. Never overwrite: see §3.
  IF NEW.vless_uuid IS NULL THEN
    NEW.vless_uuid := public.account_vless_uuid(NEW.account_id);
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.accounts_set_vless_uuid() IS
  'WS4. BEFORE INSERT OR UPDATE on accounts. Fills a NULL vless_uuid from account_id and does '
  'nothing else — it can never overwrite an existing value, so the backfill is idempotent and a '
  'future deliberate rotation is not clobbered on the next unrelated UPDATE.';

DROP TRIGGER IF EXISTS accounts_set_vless_uuid ON public.accounts;
CREATE TRIGGER accounts_set_vless_uuid
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.accounts_set_vless_uuid();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill, with `updated_at` protected.
--
--    A bare `UPDATE accounts SET vless_uuid = ...` fires the existing
--    `accounts_updated_at` BEFORE UPDATE trigger, which sets updated_at = NOW()
--    unconditionally. That would stamp today's timestamp on EVERY account row
--    and destroy the only evidence that identifies the expiry sweeper's 6-hour
--    schedule (SUBSCRIPTION-AND-ANTIFRAUD.md §6c). The loss is permanent and
--    one-way, so the trigger is disabled for exactly the length of the UPDATE.
--
--    The subscription audit triggers (20260906T100000) are deliberately LEFT
--    ENABLED: their WHEN clauses only fire on subscription_tier /
--    subscription_expires_at / subscription_store / original_transaction_id /
--    revenuecat_synced_at, none of which this statement touches. It writes no
--    audit rows, and that is correct — this is not a subscription event.
--
--    ALTER TABLE ... DISABLE TRIGGER takes SHARE ROW EXCLUSIVE on `accounts`:
--    concurrent reads are unaffected, concurrent WRITES block until COMMIT.
--    That is why lock_timeout is 5s and why P4 asks for the row count first.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_has_updated_at_trigger boolean;
  v_rows bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.accounts'::regclass
      AND t.tgname  = 'accounts_updated_at'
      AND NOT t.tgisinternal
  ) INTO v_has_updated_at_trigger;

  IF v_has_updated_at_trigger THEN
    EXECUTE 'ALTER TABLE public.accounts DISABLE TRIGGER accounts_updated_at';
  ELSE
    RAISE WARNING
      'accounts_updated_at trigger not found — the backfill will stamp updated_at on every '
      'row it touches. If the trigger was renamed, roll back and edit section 4 (see P3).';
  END IF;

  UPDATE public.accounts
     SET vless_uuid = public.account_vless_uuid(account_id)
   WHERE vless_uuid IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'WS4 backfill: vless_uuid set on % account row(s)', v_rows;

  IF v_has_updated_at_trigger THEN
    EXECUTE 'ALTER TABLE public.accounts ENABLE TRIGGER accounts_updated_at';
  END IF;
END $$;

-- Uniqueness. Guaranteed by construction (account_id is UNIQUE and the
-- derivation is a function of it), so this index exists to (a) make the sync
-- RPC and any future reverse lookup an index scan, and (b) turn a hand-edited
-- duplicate into an error rather than into two accounts sharing an identity.
--
-- NOT built CONCURRENTLY because this file runs in one transaction. On a small
-- `accounts` that is the right call. If P4 showed a large table, remove this
-- statement, apply the rest, then run outside a transaction:
--   CREATE UNIQUE INDEX CONCURRENTLY accounts_vless_uuid_key
--     ON public.accounts (vless_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_vless_uuid_key
  ON public.accounts (vless_uuid);

-- Serves the sync RPC's Pro predicate. `now()` is not immutable so it cannot go
-- in the predicate; the index covers the two immutable legs and the expiry
-- comparison rides the indexed column.
CREATE INDEX IF NOT EXISTS accounts_pro_expiry_idx
  ON public.accounts (subscription_expires_at)
  WHERE subscription_tier IS NOT NULL AND subscription_tier <> 'free';

-- NOT NULL, added the cheap way. A bare SET NOT NULL takes ACCESS EXCLUSIVE and
-- rescans the table; a validated CHECK lets Postgres skip that scan if SET NOT
-- NULL is ever wanted later. VALIDATE takes only SHARE UPDATE EXCLUSIVE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_vless_uuid_present'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_vless_uuid_present
      CHECK (vless_uuid IS NOT NULL) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.accounts VALIDATE CONSTRAINT accounts_vless_uuid_present;

-- OPTIONAL HARDENING — leave this commented unless you have checked the grants.
--
--   P1 proves anon reads ZERO ROWS of accounts, which is the property that
--   matters. It does NOT prove anon lacks the table-level SELECT grant — and
--   the shape of the answer suggests the opposite: anon got `[]` and a
--   `content-range: */0`, not a 403. PostgREST returns 401/403 when the GRANT
--   is missing and an empty result when the grant is present but RLS filters
--   every row away. So the live state is most likely "grant present, RLS
--   restrictive".
--
--   In that world a column-level REVOKE is NOT a no-op: it turns any anon
--   `select=*` on accounts from `[]` into a hard permission error for that
--   role. No shipped client should be doing that — Windows removed its direct
--   read (SupabaseService.cs:748), and iOS/Android go through RPCs — but
--   "should" is not "verified". Check the grants explicitly before you
--   uncomment:
--
--     SELECT grantee, privilege_type
--     FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='accounts'
--       AND grantee IN ('anon','authenticated');
--
--   If anon holds no SELECT, this line is free and adds a second lock. If it
--   does, weigh that against a benefit that is already largely delivered by
--   RLS, and probably skip it.
--
-- REVOKE SELECT (vless_uuid) ON public.accounts FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The node-side sync RPC.
--
--    A syncer on each node polls this, diffs the returned set against the
--    client lists in its six REALITY inbounds (8443-8448), and adds/removes
--    UUIDs. It returns the FULL authorised set every call, on purpose: an
--    incremental "changed since" feed cannot express a deletion, and a syncer
--    that misses a deletion leaves a revoked customer connected indefinitely.
--    `changed_at` is there so the syncer can skip rewriting an unchanged config
--    (compare max(changed_at) and the row count against the previous poll), not
--    so it can fetch a delta.
--
--    The Pro predicate is character-for-character the one get_servers_v2 uses
--    (20260815221927_ios05_killswitch_flag.sql:175-180). If they ever diverge,
--    a node authorises somebody the API refuses to hand credentials to, or vice
--    versa — the exact class of bypass that keeps `get_servers` dangerous.
--
--    It deliberately does NOT return account_id. The node needs an authorisation
--    set, not a customer list; keeping identity off the node means a compromised
--    node yields opaque UUIDs and nothing else.
--
--    HOW BIG IS THE SET? Measured 2026-09-08: 58 rows, out of 2,825 accounts.
--    Not thousands. Anyone sizing the node-side syncer should design for tens,
--    not for a streaming diff: the whole authorised set is a few kilobytes, a
--    poll costs one index scan, and rewriting a node's client list from scratch
--    every time is entirely reasonable. Do not build incremental machinery for
--    this. (The same 58 is the number that makes the Load column meaningless —
--    see the WHY note above.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.node_authorized_vless_uuids()
RETURNS TABLE (vless_uuid uuid, changed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
  SELECT a.vless_uuid,
         a.updated_at
  FROM public.accounts a
  WHERE a.vless_uuid IS NOT NULL
    -- The get_servers_v2 Pro predicate, verbatim.
    AND a.subscription_tier IS NOT NULL
    AND a.subscription_tier <> 'free'
    AND a.subscription_expires_at IS NOT NULL
    AND a.subscription_expires_at > now()
  ORDER BY a.vless_uuid;
$function$;

COMMENT ON FUNCTION public.node_authorized_vless_uuids() IS
  'WS4. The complete set of VLESS UUIDs that should currently exist in every node''s REALITY '
  'inbound client lists: active Pro accounts only, using the same predicate as get_servers_v2. '
  'Always returns the FULL set — a delta feed cannot express a revocation. changed_at is a skip '
  'marker for the syncer, not a cursor. Returns no account_id on purpose. service_role only.';

REVOKE ALL ON FUNCTION public.node_authorized_vless_uuids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.node_authorized_vless_uuids() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.node_authorized_vless_uuids() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- 6. POST-APPLY VERIFICATION (§8 of the pre-flight contract)
-- =============================================================================
--
--   -- 6.1 The derivation matches the offline vectors. If any of these three
--   --     rows is false, uuid_generate_v5 is not doing what this file assumes
--   --     and NOTHING downstream should be applied.
--   SELECT public.account_vless_uuid('VPN-TEST-TEST-TEST')
--            = 'cf39f654-78cf-5d07-b23d-2eafefe13797'::uuid AS ok_1,
--          public.account_vless_uuid('VPN-CKC4-348C-7PMQ')
--            = '37cc328a-c4ca-5ae5-ba6c-9cc1825a2562'::uuid AS ok_2,
--          public.account_vless_uuid('VPN-BXKQ-AUDB-ATY8')
--            = 'bc214b4b-22f6-5bbd-b894-888d927bd331'::uuid AS ok_3;
--
--   -- 6.2 Nothing was left behind, and every stored value matches its
--   --     derivation (i.e. the trigger and the backfill agree).
--   --     Both columns must be 0. Total rows should be ~2,825 (2026-09-08).
--   SELECT count(*) FILTER (WHERE vless_uuid IS NULL)                          AS unfilled,
--          count(*) FILTER (WHERE vless_uuid
--                                 IS DISTINCT FROM public.account_vless_uuid(account_id)) AS drifted
--   FROM public.accounts;
--
--   -- 6.3 updated_at was NOT disturbed. Compare against the value captured in
--   --     pre-flight; the 6-hour-boundary population must be unchanged.
--   SELECT date_trunc('hour', updated_at) AS h, count(*)
--   FROM public.accounts
--   WHERE updated_at > now() - interval '2 days'
--   GROUP BY 1 ORDER BY 1 DESC;
--
--   -- 6.4 The sync RPC returns the Pro population and only that. Expect ~58
--   --     (2026-09-08), not thousands — if this comes back in the hundreds or
--   --     more, the predicate is wrong, not the business.
--   SELECT count(*) FROM public.node_authorized_vless_uuids();
--   SELECT count(*) FROM public.accounts
--    WHERE subscription_tier IS NOT NULL AND subscription_tier <> 'free'
--      AND subscription_expires_at IS NOT NULL AND subscription_expires_at > now();
--   -- the two counts must be equal.
--
--   -- 6.5 anon still cannot see the column. P1 already established that anon
--   --     reads zero rows of `accounts`, so this is a CONFIRMATION, not a gate:
--   --     what it proves is that the new column did not arrive carrying a
--   --     policy or grant of its own. Run with the ANON key, not psql:
--   --   curl -s "$SUPABASE_URL/rest/v1/accounts?select=vless_uuid&limit=1" \
--   --        -H "apikey: $ANON_KEY"
--   -- Expect [] or a permission error, matching P1's result exactly. A UUID
--   -- here would be new behaviour introduced by this migration: STOP and revert.
--
-- =============================================================================
-- 7. THE TRANSITION — READ BEFORE TOUCHING ANY NODE
-- =============================================================================
--
-- Applying this file and the next one changes what the API HANDS OUT. It does
-- not change what the nodes ACCEPT. Those are two separate systems and they
-- must be changed in this order, with an overlap:
--
--   STEP 1 (this file + 20260908T201000).
--     The API starts returning per-account UUIDs. Nodes still only accept the
--     shared UUID, so NOTHING WORKS YET for a client that refetches — which is
--     why step 2 must be live on every node before step 1 reaches users. In
--     practice: apply step 2 first (it is purely additive on the node side),
--     then this.
--
--   STEP 2 (node side, no SQL here).
--     Stand up the syncer. It polls node_authorized_vless_uuids() and writes
--     each returned UUID into all six REALITY inbounds, ADDING to the existing
--     client list. The shared UUID `9c215195-aef6-49b5-b653-6226e0d280ed`
--     STAYS in that list. Both work. Nobody is disconnected.
--
--     Scale, so nobody over-engineers this: 58 UUIDs today across 6 inbounds =
--     348 client entries per node. That is a small JSON rewrite and an xray
--     reload, not a streaming protocol.
--
--   STEP 3 (changeover window, minimum 30 days).
--     Every device holding a cached `config_data` keeps connecting on the
--     shared UUID until it next calls get_servers_v2 and stores the new one.
--     The window must exceed the longest realistic gap between launches for an
--     installed device — 30 days is the floor, not the target. Measure it, do
--     not assume it: `device_tokens.last_used_at` is stamped on every
--     get_servers_v2 call, so
--
--       SELECT count(*) FILTER (WHERE last_used_at > now() - interval '30 days'),
--              count(*) FILTER (WHERE last_used_at > now() - interval '60 days'),
--              count(*) FROM public.device_tokens WHERE revoked_at IS NULL;
--
--     gives the real refresh distribution. Retire only when the 30-day and the
--     all-time counts have converged.
--
--   STEP 4 (RETIREMENT — a separate, later, deliberate change; NOT part of
--           this migration and NOT to be folded into it).
--     Remove `9c215195-aef6-49b5-b653-6226e0d280ed` from every node's inbound
--     client lists, and rewrite `vpn_servers.config_data` so the stored URI no
--     longer carries a live credential. Until step 4 happens, the shared UUID
--     remains a valid free ride for anyone who ever saw a config — this file
--     does not fix that, it only makes fixing it possible.
--
--   ALSO STILL OPEN, and deliberately untouched here: the legacy
--   `get_servers(p_api_key, p_account_id, p_device_id)` RPC is still live
--   (SUBSCRIPTION-AND-ANTIFRAUD.md §6b) and still hands out the shared UUID
--   verbatim from config_data. Patching it is not attempted here — its live
--   body cannot be reconstructed from this repo (see the next file's header),
--   and 20260723_server_capacity.sql's copy of it is a July snapshot that must
--   never be replayed. Retiring it is the cleaner move and is server work
--   nobody has scheduled.
-- =============================================================================
