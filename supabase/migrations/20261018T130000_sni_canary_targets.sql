-- What the in-country SNI canary (doppler-infra/canary, on SPb) probes: every active server's
-- address and the PUBLIC half of each REALITY inbound. Paste after 20261018T120000_sni_scoring.sql.
--
-- Gated by the same secret as report_canary (sni_canary_keys). It returns only what any Pro client
-- already receives in sni_options, plus the server id the canary reports against.

CREATE OR REPLACE FUNCTION public.canary_targets(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_secret IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.sni_canary_keys WHERE key_hash = encode(digest(p_secret, 'sha256'), 'hex')) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'server_id', s.id, 'name', s.name, 'ip', s.ip_address,
             'sni', x->>'sni', 'port', (x->>'port')::int,
             'publicKey', x->>'publicKey', 'shortId', x->>'shortId',
             'fingerprint', coalesce(x->>'fingerprint', 'chrome')))
    FROM public.vpn_servers s, jsonb_array_elements(coalesce(s.sni_options, '[]')) x
    WHERE s.is_active AND s.ip_address IS NOT NULL
      AND x ? 'port' AND x ? 'publicKey' AND x ? 'shortId'
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.canary_targets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canary_targets(text) TO anon;
