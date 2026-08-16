-- BE-05 — SNI coverage guard.
--
-- Applied to fzlrhmjdjjzcgstaeblu on 2026-08-15 as migration
-- version 20260815202750, name `sni_health_view`. This file is a verbatim copy
-- of what was applied — no BEGIN/COMMIT, because apply_migration wraps it.
--
-- Each active node runs six Reality inbounds on 8443-8448; `vpn_servers.sni_options`
-- carries one entry per inbound so a client can rotate when one SNI gets blocked.
-- The iOS client filters those entries by the user's detected region, treating
-- regions = ["*"] as a global fallback. If a node ever drops below two global
-- entries, an out-of-region user (Iran, Turkey, China) has fewer than two things
-- to try -- the rotation feature silently stops working, and the user sees
-- "connects, then nothing loads".
--
-- This view makes that condition queryable so the n8n Doppler Service Monitor
-- (6KtZe6D5XcbVzyFS) can warn on it. Read-only; service_role only -- it exposes
-- server names and is not meant for anon/authenticated clients.

CREATE OR REPLACE VIEW public.vpn_servers_sni_health
WITH (security_invoker = on) AS
SELECT
    s.id,
    s.name,
    s.country_code,
    jsonb_array_length(coalesce(s.sni_options, '[]'::jsonb)) AS total_entries,
    (
        SELECT count(*)
        FROM jsonb_array_elements(coalesce(s.sni_options, '[]'::jsonb)) e
        WHERE e->'regions' @> '["*"]'::jsonb
    ) AS global_entries
FROM public.vpn_servers s
WHERE s.is_active = true;

COMMENT ON VIEW public.vpn_servers_sni_health IS
    'BE-05 guard. Healthy = total_entries = 6 AND global_entries >= 2. '
    'Anything less means out-of-region clients lose SNI rotation candidates.';

REVOKE ALL ON public.vpn_servers_sni_health FROM PUBLIC;
REVOKE ALL ON public.vpn_servers_sni_health FROM anon, authenticated;
GRANT SELECT ON public.vpn_servers_sni_health TO service_role;
