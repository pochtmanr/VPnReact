-- Supabase Database Schema for VPN App
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    username TEXT,
    avatar_url TEXT,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'premium')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- VPN Servers table
CREATE TABLE IF NOT EXISTS public.vpn_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    city TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 1194,
    protocol TEXT DEFAULT 'udp' CHECK (protocol IN ('udp', 'tcp')),
    config_data TEXT NOT NULL,
    load_percentage INTEGER DEFAULT 0 CHECK (load_percentage >= 0 AND load_percentage <= 100),
    is_premium BOOLEAN DEFAULT FALSE,
    latency_ms INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connection Logs table
CREATE TABLE IF NOT EXISTS public.connection_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES public.vpn_servers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('connecting', 'connected', 'disconnecting', 'disconnected', 'error')),
    message TEXT NOT NULL,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Favorites table
CREATE TABLE IF NOT EXISTS public.user_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES public.vpn_servers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, server_id)
);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpn_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- VPN Servers policies (public read for authenticated users)
CREATE POLICY "Authenticated users can view active servers"
    ON public.vpn_servers FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

-- Connection Logs policies
CREATE POLICY "Users can view their own logs"
    ON public.connection_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own logs"
    ON public.connection_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- User Favorites policies
CREATE POLICY "Users can view their own favorites"
    ON public.user_favorites FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites"
    ON public.user_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
    ON public.user_favorites FOR DELETE
    USING (auth.uid() = user_id);

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vpn_servers_updated_at
    BEFORE UPDATE ON public.vpn_servers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Realtime for connection_logs (skip if already added)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connection_logs;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Sample VPN Servers data
INSERT INTO public.vpn_servers (name, country, country_code, city, ip_address, port, protocol, config_data, load_percentage, is_premium, latency_ms, is_active) VALUES
    ('US East 1', 'United States', 'US', 'New York', '10.0.1.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-us-east.example.com 1194\n...', 45, FALSE, 25, TRUE),
    ('US West 1', 'United States', 'US', 'Los Angeles', '10.0.1.2', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-us-west.example.com 1194\n...', 62, FALSE, 35, TRUE),
    ('UK London 1', 'United Kingdom', 'GB', 'London', '10.0.2.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-uk.example.com 1194\n...', 38, FALSE, 80, TRUE),
    ('Germany 1', 'Germany', 'DE', 'Frankfurt', '10.0.3.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-de.example.com 1194\n...', 55, FALSE, 95, TRUE),
    ('Japan 1', 'Japan', 'JP', 'Tokyo', '10.0.4.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-jp.example.com 1194\n...', 28, TRUE, 150, TRUE),
    ('Singapore 1', 'Singapore', 'SG', 'Singapore', '10.0.5.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-sg.example.com 1194\n...', 42, TRUE, 180, TRUE),
    ('Australia 1', 'Australia', 'AU', 'Sydney', '10.0.6.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-au.example.com 1194\n...', 35, FALSE, 200, TRUE),
    ('Canada 1', 'Canada', 'CA', 'Toronto', '10.0.7.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-ca.example.com 1194\n...', 22, FALSE, 40, TRUE),
    ('Netherlands 1', 'Netherlands', 'NL', 'Amsterdam', '10.0.8.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-nl.example.com 1194\n...', 68, TRUE, 85, TRUE),
    ('Switzerland 1', 'Switzerland', 'CH', 'Zurich', '10.0.9.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-ch.example.com 1194\n...', 15, TRUE, 90, TRUE),
    ('Sweden 1', 'Sweden', 'SE', 'Stockholm', '10.0.10.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-se.example.com 1194\n...', 33, FALSE, 100, TRUE),
    ('France 1', 'France', 'FR', 'Paris', '10.0.11.1', 1194, 'udp', 'client\ndev tun\nproto udp\nremote vpn-fr.example.com 1194\n...', 48, FALSE, 75, TRUE)
ON CONFLICT DO NOTHING;
