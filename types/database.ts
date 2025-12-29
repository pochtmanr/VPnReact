export interface Database {
  public: {
    Tables: {
      // New account system - device-based authentication
      accounts: {
        Row: {
          id: string; // UUID
          account_id: string; // Strong unique ID (e.g., "VPN-XXXX-XXXX-XXXX")
          max_devices: number; // Default 10
          subscription_tier: 'free' | 'pro' | 'premium';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          max_devices?: number;
          subscription_tier?: 'free' | 'pro' | 'premium';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          max_devices?: number;
          subscription_tier?: 'free' | 'pro' | 'premium';
          created_at?: string;
          updated_at?: string;
        };
      };
      device_sessions: {
        Row: {
          id: string; // UUID
          account_id: string; // References accounts.id
          device_id: string; // Unique device identifier
          device_name: string; // e.g., "iPhone 15 Pro", "Chrome Extension"
          device_type: 'ios' | 'android' | 'chrome' | 'firefox' | 'web';
          is_main: boolean; // First registered device becomes main device
          last_active_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          device_id: string;
          device_name: string;
          device_type: 'ios' | 'android' | 'chrome' | 'firefox' | 'web';
          is_main?: boolean;
          last_active_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          device_id?: string;
          device_name?: string;
          device_type?: 'ios' | 'android' | 'chrome' | 'firefox' | 'web';
          is_main?: boolean;
          last_active_at?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string | null;
          avatar_url: string | null;
          subscription_tier: 'free' | 'pro' | 'premium';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          username?: string | null;
          avatar_url?: string | null;
          subscription_tier?: 'free' | 'pro' | 'premium';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string | null;
          avatar_url?: string | null;
          subscription_tier?: 'free' | 'pro' | 'premium';
          created_at?: string;
          updated_at?: string;
        };
      };
      vpn_servers: {
        Row: {
          id: string;
          name: string;
          country: string;
          country_code: string;
          city: string;
          ip_address: string;
          port: number;
          protocol: 'udp' | 'tcp' | 'wireguard';
          config_data: string;
          load_percentage: number;
          is_premium: boolean;
          latency_ms: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          country: string;
          country_code: string;
          city: string;
          ip_address: string;
          port: number;
          protocol?: 'udp' | 'tcp' | 'wireguard';
          config_data: string;
          load_percentage?: number;
          is_premium?: boolean;
          latency_ms?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          country?: string;
          country_code?: string;
          city?: string;
          ip_address?: string;
          port?: number;
          protocol?: 'udp' | 'tcp' | 'wireguard';
          config_data?: string;
          load_percentage?: number;
          is_premium?: boolean;
          latency_ms?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      connection_logs: {
        Row: {
          id: string;
          user_id: string;
          server_id: string;
          status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
          message: string;
          bytes_sent: number;
          bytes_received: number;
          duration_seconds: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          server_id: string;
          status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
          message: string;
          bytes_sent?: number;
          bytes_received?: number;
          duration_seconds?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          server_id?: string;
          status?: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
          message?: string;
          bytes_sent?: number;
          bytes_received?: number;
          duration_seconds?: number;
          created_at?: string;
        };
      };
      user_favorites: {
        Row: {
          id: string;
          user_id: string;
          server_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          server_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          server_id?: string;
          created_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

// Type exports
export type Account = Database['public']['Tables']['accounts']['Row'];
export type DeviceSession = Database['public']['Tables']['device_sessions']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type VPNServer = Database['public']['Tables']['vpn_servers']['Row'];
export type ConnectionLog = Database['public']['Tables']['connection_logs']['Row'];
export type UserFavorite = Database['public']['Tables']['user_favorites']['Row'];

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';
export type DeviceType = 'ios' | 'android' | 'chrome' | 'firefox' | 'web';
export type SubscriptionTier = 'free' | 'pro' | 'premium';
