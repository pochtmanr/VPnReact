-- 2026-11-20 security pass, task 3: lock the anon surface.
-- APPLIED on core-db 2026-11-20 13:29 UTC. One transaction, idempotent, safe to re-run.
-- Dry-run on live core-db 2026-11-20 (same file, ROLLBACK instead of COMMIT): passed.
-- Apply on core-db:  docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
-- (supabase_admin, so the ALTER DEFAULT PRIVILEGES for both roles takes effect).
--
-- Evidence this was written against (live core-db, 2026-11-20):
--   * client RPC inventory from the Apple/Android/Windows/Linux/RN sources, and
--     three days of Envoy logs: none of the functions revoked in section 1 was
--     called by anything but a service-key server (web, admin, bots, webhook, cron);
--   * the claim_subscription body in section 2 is the LIVE body
--     (pg_get_functiondef), not the repo copy — the two had drifted;
--   * every direct INSERT into accounts comes from a service-key server;
--   * vpn_invoices: 216 rows, no NULL/empty/duplicate provider_payment_id.
--
-- Deliberately NOT done here: accepting a claim only for a transaction the
-- RevenueCat webhook already wrote. The webhook does not deliver Play purchases
-- (33 Play accounts claimed in 60 days, 1 has a webhook row; no GPA id since
-- August), so that rule would stop every Android purchase from granting Pro.
-- An invented transaction id can therefore still buy up to 400 days of Pro.
-- Closing it needs server-side receipt verification first (Phase 2).

begin;
set local lock_timeout = '3s';

-- 0. Preconditions --------------------------------------------------------
do $$
begin
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname = 'claim_subscription') <> 1 then
    raise exception 'claim_subscription: expected exactly 1 overload';
  end if;
  if 'public.claim_subscription(text,text,timestamptz,text,text,text)'::regprocedure is null then
    raise exception 'claim_subscription: signature changed';
  end if;
  if exists (select 1 from public.vpn_invoices where provider_payment_id is not null
             group by provider_payment_id having count(*) > 1) then
    raise exception 'vpn_invoices has duplicate provider_payment_id; resolve first';
  end if;
end $$;

-- 1. Server-only functions: service_role only -------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname in (
            'link_contact', 'verify_contact',
            'find_account_by_transaction', 'get_subscription_owner',
            'get_account_config_counts', 'get_account_device_counts',
            'apply_promo_code', 'redeem_promo_code', 'validate_promo_code',
            'increment_promo_redemptions',
            'upsert_telegram_user', 'redeem_link_token',
            'downgrade_expired_subscriptions', 'cleanup_rate_limits',
            'claim_editorial_translation', 'webhook_log_event',
            'sync_subscription', 'track_qr_scan',
            'enroll_corporate_device', 'report_device_heartbeat',
            'analytics_top_pages', 'analytics_top_keywords',
            'cold_outreach_daily_stats')
           or p.proname like 'bot\_%'
           or p.proname like 'reporting\_%')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- 2. claim_subscription: live body + three guards for non-service callers ---
--    (a) only pro/premium is grantable; anything else writes nothing
--    (b) a transaction id is required (the "updated_legacy" branch is closed)
--    (c) an expiry is required and may not be more than 400 days ahead
--    The webhook (service_role) keeps today's behaviour exactly.
CREATE OR REPLACE FUNCTION public.claim_subscription(p_account_id text, p_tier text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_original_transaction_id text DEFAULT NULL::text, p_store text DEFAULT 'app_store'::text, p_product_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existing_owner TEXT;
    v_account_exists BOOLEAN;
    v_store TEXT;
    v_platform TEXT;
    v_role TEXT;
BEGIN
    v_role := COALESCE(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        nullif(current_setting('request.jwt.claim.role', true), ''),
        ''
    );

    -- store value for subscription_ownership.store + accounts.subscription_store
    v_store := CASE
        WHEN p_store IN ('play_store','android') THEN 'play_store'
        WHEN p_store IN ('app_store','ios','mac_app_store','macos') THEN 'app_store'
        WHEN p_store = 'stripe' THEN 'stripe'
        ELSE 'app_store'
    END;
    -- platform value for subscription_events.platform
    v_platform := CASE
        WHEN p_store IN ('play_store','android') THEN 'android'
        WHEN p_store IN ('mac_app_store','macos') THEN 'macos'
        WHEN p_store IN ('app_store','ios') THEN 'ios'
        WHEN p_store = 'stripe' THEN 'stripe'
        ELSE 'ios'
    END;

    SELECT EXISTS(SELECT 1 FROM accounts WHERE account_id = p_account_id) INTO v_account_exists;
    IF NOT v_account_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'account_not_found');
    END IF;

    IF v_role <> 'service_role' THEN
        IF lower(coalesce(p_tier, '')) NOT IN ('pro', 'premium') THEN
            RETURN jsonb_build_object('success', true, 'action', 'ignored', 'reason', 'tier_not_grantable');
        END IF;
        IF p_original_transaction_id IS NULL OR p_original_transaction_id = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'transaction_id_required');
        END IF;
        IF p_expires_at IS NULL OR p_expires_at > NOW() + INTERVAL '400 days' THEN
            RETURN jsonb_build_object('success', false, 'error', 'expires_at_out_of_range');
        END IF;
    END IF;

    IF p_original_transaction_id IS NULL OR p_original_transaction_id = '' THEN
        UPDATE accounts SET
            subscription_tier = p_tier,
            subscription_expires_at = p_expires_at,
            revenuecat_synced_at = NOW(),
            updated_at = NOW()
        WHERE account_id = p_account_id;
        RETURN jsonb_build_object('success', true, 'action', 'updated_legacy', 'owner', p_account_id);
    END IF;

    SELECT current_owner_account_id INTO v_existing_owner
    FROM subscription_ownership
    WHERE original_transaction_id = p_original_transaction_id;

    -- New purchase — claim it
    IF v_existing_owner IS NULL THEN
        INSERT INTO subscription_ownership (
            original_transaction_id, store, product_id,
            current_owner_account_id, original_owner_account_id
        ) VALUES (
            p_original_transaction_id, v_store, p_product_id,
            p_account_id, p_account_id
        );

        UPDATE accounts SET
            subscription_tier = p_tier,
            subscription_expires_at = p_expires_at,
            original_transaction_id = p_original_transaction_id,
            subscription_store = v_store,
            subscription_product_id = p_product_id,
            subscription_claimed_at = NOW(),
            revenuecat_synced_at = NOW(),
            updated_at = NOW()
        WHERE account_id = p_account_id;

        INSERT INTO subscription_events (account_id, original_transaction_id, event_type, platform, product_id, expires_at)
        VALUES (p_account_id, p_original_transaction_id, 'INITIAL_PURCHASE', v_platform, p_product_id, p_expires_at);

        RETURN jsonb_build_object('success', true, 'action', 'claimed', 'owner', p_account_id);
    END IF;

    -- Same account — update
    IF v_existing_owner = p_account_id THEN
        UPDATE accounts SET
            subscription_tier = p_tier,
            subscription_expires_at = p_expires_at,
            revenuecat_synced_at = NOW(),
            updated_at = NOW()
        WHERE account_id = p_account_id;

        UPDATE subscription_ownership SET updated_at = NOW()
        WHERE original_transaction_id = p_original_transaction_id;

        INSERT INTO subscription_events (account_id, original_transaction_id, event_type, platform, product_id, expires_at)
        VALUES (p_account_id, p_original_transaction_id, 'RENEWAL', v_platform, p_product_id, p_expires_at);

        RETURN jsonb_build_object('success', true, 'action', 'updated', 'owner', p_account_id);
    END IF;

    -- Different owner — reject
    INSERT INTO subscription_events (
        account_id, original_transaction_id, event_type, platform, product_id, details
    ) VALUES (
        p_account_id, p_original_transaction_id, 'RESTORE_REJECTED', v_platform, p_product_id,
        jsonb_build_object('actual_owner', v_existing_owner, 'attempted_by', p_account_id)
    );

    RETURN jsonb_build_object(
        'success', false,
        'action', 'rejected',
        'error', 'subscription_owned_by_another_account',
        'owner', v_existing_owner
    );

EXCEPTION WHEN OTHERS THEN
    -- Record the failure so it is never silently lost again.
    BEGIN
        INSERT INTO public.subscription_claim_errors (account_id, tier, store, product_id, original_transaction_id, error)
        VALUES (p_account_id, p_tier, p_store, p_product_id, p_original_transaction_id, SQLERRM);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    RETURN jsonb_build_object('success', false, 'error', 'database_error', 'details', SQLERRM);
END;
$function$;

-- 3. accounts: no direct inserts with the public key ------------------------
--    Clients create accounts through create_account() (SECURITY DEFINER);
--    web and the Telegram bot insert with the service key, which bypasses RLS.
drop policy if exists "Anyone can create accounts" on public.accounts;
revoke insert, update, delete, truncate, references, trigger
  on public.accounts from anon, authenticated;

-- 4. RLS on the tables that had none (no policies: service_role only) -------
alter table public.analytics_appstore        enable row level security;
alter table public.analytics_blog            enable row level security;
alter table public.analytics_search          enable row level security;
alter table public.analytics_installs        enable row level security;
alter table public.analytics_subscriptions   enable row level security;
alter table public.analytics_traffic         enable row level security;
alter table public.subscription_claim_errors enable row level security;
revoke all on public.analytics_appstore, public.analytics_blog, public.analytics_search,
              public.analytics_installs, public.analytics_subscriptions,
              public.analytics_traffic, public.subscription_claim_errors
  from anon, authenticated;

-- 5. New objects no longer open to anon/authenticated by default ------------
--    The schema-less form is what removes the built-in EXECUTE-to-PUBLIC on
--    new functions; the per-schema form removes the explicit Supabase grants.
do $$
declare r text;
begin
  foreach r in array array['postgres', 'supabase_admin'] loop
    begin
      execute format('alter default privileges for role %I in schema public revoke all on tables from anon, authenticated', r);
      execute format('alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated', r);
      execute format('alter default privileges for role %I in schema public revoke all on functions from anon, authenticated', r);
      execute format('alter default privileges for role %I revoke execute on functions from public', r);
    exception when insufficient_privilege then
      raise exception 'cannot alter default privileges for % — run as supabase_admin', r;
    end;
  end loop;
end $$;

-- 6. One invoice per provider payment ---------------------------------------
create unique index if not exists vpn_invoices_provider_payment_id_key
  on public.vpn_invoices (provider_payment_id);

commit;

-- Verification (read-only), expected results in comments:
--   select count(*) from pg_proc p where p.pronamespace='public'::regnamespace
--     and p.proname in ('link_contact','verify_contact','apply_promo_code','upsert_telegram_user')
--     and has_function_privilege('anon', p.oid, 'EXECUTE');                         -- 0
--   select has_function_privilege('anon','public.claim_subscription(text,text,timestamptz,text,text,text)','EXECUTE');  -- t
--   select count(*) from pg_policies where tablename='accounts' and cmd='INSERT';  -- 0
--   select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;      -- 0
--
-- Rollback of section 2: re-apply the body saved in
--   /opt/supabase/backups/2026-11-20T081630Z/postgres.dump (pg_restore -l | grep claim_subscription).
-- Rollback of section 1 for one function: grant execute on function <sig> to anon, authenticated;
