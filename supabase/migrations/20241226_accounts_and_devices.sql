    -- Create accounts table for device-based authentication
    -- Each account has a unique shareable ID that works across platforms

    CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id TEXT UNIQUE NOT NULL, -- Format: VPN-XXXX-XXXX-XXXX
        max_devices INTEGER DEFAULT 10,
        subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'premium')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create device_sessions table to track active devices
    CREATE TABLE IF NOT EXISTS device_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL, -- Unique device identifier
        device_name TEXT NOT NULL, -- Human readable name like "iPhone 15 Pro"
        device_type TEXT NOT NULL CHECK (device_type IN ('ios', 'android', 'chrome', 'firefox', 'web')),
        last_active_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(account_id, device_id)
    );

    -- Create indexes for faster lookups
    CREATE INDEX IF NOT EXISTS idx_accounts_account_id ON accounts(account_id);
    CREATE INDEX IF NOT EXISTS idx_device_sessions_account_id ON device_sessions(account_id);
    CREATE INDEX IF NOT EXISTS idx_device_sessions_device_id ON device_sessions(device_id);

    -- Function to generate a strong account ID
    CREATE OR REPLACE FUNCTION generate_account_id()
    RETURNS TEXT AS $$
    DECLARE
        chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- No I, O, 0, 1 to avoid confusion
        result TEXT := 'VPN-';
        i INTEGER;
        segment INTEGER;
    BEGIN
        FOR segment IN 1..3 LOOP
            FOR i IN 1..4 LOOP
                result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
            END LOOP;
            IF segment < 3 THEN
                result := result || '-';
            END IF;
        END LOOP;
        RETURN result;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to create a new account with generated ID
    CREATE OR REPLACE FUNCTION create_account()
    RETURNS accounts AS $$
    DECLARE
        new_account accounts;
        new_id TEXT;
        attempts INTEGER := 0;
    BEGIN
        LOOP
            new_id := generate_account_id();
            BEGIN
                INSERT INTO accounts (account_id)
                VALUES (new_id)
                RETURNING * INTO new_account;
                RETURN new_account;
            EXCEPTION WHEN unique_violation THEN
                attempts := attempts + 1;
                IF attempts > 10 THEN
                    RAISE EXCEPTION 'Could not generate unique account ID after 10 attempts';
                END IF;
            END;
        END LOOP;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to register a device for an account
    -- Returns error if max devices exceeded
    CREATE OR REPLACE FUNCTION register_device(
        p_account_id TEXT,
        p_device_id TEXT,
        p_device_name TEXT,
        p_device_type TEXT
    )
    RETURNS JSON AS $$
    DECLARE
        v_account accounts;
        v_device_count INTEGER;
        v_session device_sessions;
    BEGIN
        -- Find the account
        SELECT * INTO v_account FROM accounts WHERE account_id = p_account_id;

        IF v_account IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Account not found');
        END IF;

        -- Check if this device already exists for this account
        SELECT * INTO v_session
        FROM device_sessions
        WHERE account_id = v_account.id AND device_id = p_device_id;

        IF v_session IS NOT NULL THEN
            -- Device already registered, update last active
            UPDATE device_sessions
            SET last_active_at = NOW(), device_name = p_device_name
            WHERE id = v_session.id
            RETURNING * INTO v_session;

            RETURN json_build_object(
                'success', true,
                'session', row_to_json(v_session),
                'account', row_to_json(v_account)
            );
        END IF;

        -- Count current devices
        SELECT COUNT(*) INTO v_device_count
        FROM device_sessions
        WHERE account_id = v_account.id;

        IF v_device_count >= v_account.max_devices THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Maximum device limit reached',
                'current_devices', v_device_count,
                'max_devices', v_account.max_devices
            );
        END IF;

        -- Register new device
        INSERT INTO device_sessions (account_id, device_id, device_name, device_type)
        VALUES (v_account.id, p_device_id, p_device_name, p_device_type)
        RETURNING * INTO v_session;

        RETURN json_build_object(
            'success', true,
            'session', row_to_json(v_session),
            'account', row_to_json(v_account),
            'device_count', v_device_count + 1
        );
    END;
    $$ LANGUAGE plpgsql;

    -- Function to get account devices
    CREATE OR REPLACE FUNCTION get_account_devices(p_account_id TEXT)
    RETURNS JSON AS $$
    DECLARE
        v_account accounts;
        v_devices JSON;
    BEGIN
        SELECT * INTO v_account FROM accounts WHERE account_id = p_account_id;

        IF v_account IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Account not found');
        END IF;

        SELECT json_agg(d_row) INTO v_devices
        FROM (
            SELECT *
            FROM device_sessions d
            WHERE d.account_id = v_account.id
            ORDER BY d.last_active_at DESC
        ) d_row;

        RETURN json_build_object(
            'success', true,
            'account', row_to_json(v_account),
            'devices', COALESCE(v_devices, '[]'::json)
        );
    END;
    $$ LANGUAGE plpgsql;

    -- Function to remove a device
    CREATE OR REPLACE FUNCTION remove_device(p_account_id TEXT, p_device_id TEXT)
    RETURNS JSON AS $$
    DECLARE
        v_account accounts;
    BEGIN
        SELECT * INTO v_account FROM accounts WHERE account_id = p_account_id;

        IF v_account IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Account not found');
        END IF;

        DELETE FROM device_sessions
        WHERE account_id = v_account.id AND device_id = p_device_id;

        RETURN json_build_object('success', true);
    END;
    $$ LANGUAGE plpgsql;

    -- Enable RLS
    ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;

    -- Policies for anonymous access (no auth required)
    CREATE POLICY "Anyone can read accounts by account_id" ON accounts
        FOR SELECT USING (true);

    CREATE POLICY "Anyone can create accounts" ON accounts
        FOR INSERT WITH CHECK (true);

    CREATE POLICY "Anyone can read device sessions" ON device_sessions
        FOR SELECT USING (true);

    CREATE POLICY "Anyone can insert device sessions" ON device_sessions
        FOR INSERT WITH CHECK (true);

    CREATE POLICY "Anyone can update device sessions" ON device_sessions
        FOR UPDATE USING (true);

    CREATE POLICY "Anyone can delete device sessions" ON device_sessions
        FOR DELETE USING (true);

    -- Trigger to update updated_at
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER accounts_updated_at
        BEFORE UPDATE ON accounts
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
