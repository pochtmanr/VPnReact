-- VPN App Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'premium')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- VPN Servers table
CREATE TABLE IF NOT EXISTS vpn_servers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  city TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER DEFAULT 1194,
  protocol TEXT DEFAULT 'udp' CHECK (protocol IN ('udp', 'tcp')),
  config_data TEXT NOT NULL,
  load_percentage INTEGER DEFAULT 0,
  is_premium BOOLEAN DEFAULT FALSE,
  latency_ms INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  speed_mbps NUMERIC,
  score INTEGER,
  operator TEXT,
  uptime_seconds BIGINT,
  total_users BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User favorites table
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES vpn_servers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, server_id)
);

-- Connection logs table
CREATE TABLE IF NOT EXISTS connection_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES vpn_servers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('connecting', 'connected', 'disconnecting', 'disconnected', 'error')),
  message TEXT NOT NULL,
  bytes_sent BIGINT DEFAULT 0,
  bytes_received BIGINT DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vpn_servers_active ON vpn_servers(is_active);
CREATE INDEX IF NOT EXISTS idx_vpn_servers_country ON vpn_servers(country);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_logs_user ON connection_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_logs_created ON connection_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vpn_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles: users can manage their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- VPN Servers: everyone can read active servers
CREATE POLICY "Anyone can view active servers" ON vpn_servers
  FOR SELECT USING (is_active = true);

-- User favorites: users can manage their own favorites
CREATE POLICY "Users can view own favorites" ON user_favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites" ON user_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove favorites" ON user_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Connection logs: users can manage their own logs
CREATE POLICY "Users can view own logs" ON connection_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add logs" ON connection_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, username)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Enable realtime for connection_logs
ALTER PUBLICATION supabase_realtime ADD TABLE connection_logs;
