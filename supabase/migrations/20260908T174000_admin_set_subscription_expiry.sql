-- =============================================================================
-- 20260908T174000 — admin_set_subscription_expiry
-- =============================================================================
-- Admin-grant rows only. Two mutually exclusive writes:
--   p_expires_at — set that absolute timestamp
--   p_days       — stack on the live term (start = max(now, current expiry))
-- Paid stores are refused. Does not depend on subscription_normalize_store or
-- the unapplied admin_grant_subscription migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_subscription_expiry(
    p_account_id TEXT,
    p_reason     TEXT,
    p_actor      TEXT DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_days       INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_key         TEXT;
    v_acct        TEXT;
    v_tier        TEXT;
    v_expires     TIMESTAMPTZ;
    v_store       TEXT;
    v_store_n     TEXT;
    v_reason      TEXT;
    v_entitled    BOOLEAN;
    v_new_expires TIMESTAMPTZ;
    v_action      TEXT;
BEGIN
    v_key := btrim(coalesce(p_account_id, ''));
    IF v_key = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_id_required');
    END IF;

    v_reason := btrim(coalesce(p_reason, ''));
    IF v_reason = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    IF (p_expires_at IS NULL AND p_days IS NULL)
       OR (p_expires_at IS NOT NULL AND p_days IS NOT NULL) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'specify_expires_at_or_days'
        );
    END IF;

    IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 3650) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'invalid_days',
            'given',   p_days
        );
    END IF;

    IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'expires_at_must_be_future',
            'given',   p_expires_at
        );
    END IF;

    IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT account_id, subscription_tier, subscription_expires_at, subscription_store
          INTO v_acct, v_tier, v_expires, v_store
        FROM accounts WHERE id = v_key::uuid FOR UPDATE;
    ELSE
        SELECT account_id, subscription_tier, subscription_expires_at, subscription_store
          INTO v_acct, v_tier, v_expires, v_store
        FROM accounts WHERE account_id = v_key FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_not_found',
                                  'account_id', p_account_id);
    END IF;

    v_store_n := lower(btrim(coalesce(v_store, '')));
    IF v_store_n NOT IN ('admin', 'dev-grant') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'admin_grant_only',
            'store',   v_store
        );
    END IF;

    IF p_days IS NOT NULL THEN
        v_entitled := v_tier IS NOT NULL AND v_tier <> 'free'
                  AND v_expires IS NOT NULL AND v_expires > now();
        v_new_expires := (CASE WHEN v_entitled THEN v_expires ELSE now() END)
                         + make_interval(days => p_days);
        v_action := 'extended';
    ELSE
        v_entitled := false;
        v_new_expires := p_expires_at;
        v_action := 'set_expiry';
    END IF;

    PERFORM set_config('doppler.reason', v_reason, true);
    PERFORM set_config('doppler.actor',
                       coalesce(nullif(btrim(coalesce(p_actor, '')), ''), '(unattributed admin)'),
                       true);

    UPDATE accounts SET
        subscription_tier       = 'pro',
        subscription_expires_at = v_new_expires,
        updated_at              = NOW()
    WHERE account_id = v_acct;

    RETURN jsonb_build_object(
        'success', true,
        'action',  v_action,
        'account_id', v_acct,
        'days',    p_days,
        'reason',  v_reason,
        'actor',   p_actor,
        'stacked', CASE WHEN p_days IS NOT NULL THEN v_entitled ELSE NULL END,
        'before', jsonb_build_object(
            'tier',       v_tier,
            'expires_at', v_expires,
            'store',      v_store
        ),
        'after', jsonb_build_object(
            'tier',       'pro',
            'expires_at', v_new_expires,
            'store',      v_store
        )
    );
END;
$fn$;

COMMENT ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) IS
    'Set or stack a Pro expiry on an admin-grant row only. Pass p_expires_at XOR p_days. '
    'service_role only.';

REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription_expiry(TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
