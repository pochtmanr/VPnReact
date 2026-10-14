-- St Petersburg node (194.87.196.120): Russian-SNI REALITY options for users inside Russia.
--
-- A user in Russia reported "connected, no internet" on this node while every other server
-- worked. All six original inbounds disguise as foreign sites (yahoo, amazon, apple, bing,
-- cloudflare, dl.google) on a Russian hosting IP; Russian TSPU lets the handshake through and
-- then freezes the flow, which still passes the client's ~100-byte health probe. Three inbounds
-- with Russian dests were added on the box 2026-10-05 (9/9 handshakes PASS, test-reality.sh):
--   8449 vk.com · 8450 max.ru · 8451 www.ozon.ru
--
-- regions ["ru"] + priority 0: iOS (SNIResilienceService.orderedProfiles) and Windows filter by
-- region, so Russian users try these first and nobody else sees them. Android ignores regions
-- and sorts by priority alone, so every Android user on this node tries them first; a Russian
-- SNI on a Russian IP is the more natural pairing anyway.
--
-- Idempotent: appends only entries whose sni is not already present.

update vpn_servers v
set sni_options = coalesce(v.sni_options, '[]'::jsonb) || (
    select coalesce(jsonb_agg(e), '[]'::jsonb)
    from jsonb_array_elements('[
      {"sni": "vk.com",      "port": 8449, "regions": ["ru"], "shortId": "f2fe21c774a2df8e", "priority": 0, "publicKey": "g3GuyWevKcYM1mWxDPH2UVyAFqXdbdxbB0dS6zlmol8", "fingerprint": "chrome"},
      {"sni": "max.ru",      "port": 8450, "regions": ["ru"], "shortId": "5e8521d5eeebd479", "priority": 0, "publicKey": "9w88yniLrfrVfPnTsvPy50fzXSsR3BihnI4Bh5J_0gg", "fingerprint": "chrome"},
      {"sni": "www.ozon.ru", "port": 8451, "regions": ["ru"], "shortId": "50cbf8c02bd557db", "priority": 0, "publicKey": "W4InUtWRauM9IPKOUnN5LV4X2OjTL0H5FR1EA8rQNC8", "fingerprint": "chrome"}
    ]'::jsonb) e
    where not exists (
      select 1 from jsonb_array_elements(coalesce(v.sni_options, '[]'::jsonb)) x
      where x->>'sni' = e->>'sni'
    )
  )
where v.ip_address = '194.87.196.120';

-- Check: expect 9 rows, the last three at priority 0 with regions ["ru"].
-- select e->>'sni', e->>'port', e->>'priority', e->'regions'
-- from vpn_servers, jsonb_array_elements(sni_options) e where ip_address = '194.87.196.120';
