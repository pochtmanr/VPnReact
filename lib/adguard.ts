// AdGuard Home API Service
// Connects to the AdGuard Home DNS server running on the VPN server
// AdGuard is only accessible via VPN tunnel (internal IP)

const ADGUARD_API = {
  baseUrl: 'http://10.0.0.1:3000',
  username: 'admin',
  password: 'VpnAdmin123',
};

interface AdGuardStats {
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing: number;
  num_replaced_parental: number;
  avg_processing_time: number;
  top_blocked_domains: Array<Record<string, number>>;
  blocked_filtering: number[];
  dns_queries: number[];
}

interface AdGuardFilteringStatus {
  enabled: boolean;
  filters: Array<{
    id: number;
    name: string;
    rules_count: number;
    enabled: boolean;
  }>;
}

interface FeatureStatus {
  enabled: boolean;
}

export interface AdBlockStats {
  totalBlocked: number;
  totalQueries: number;
  blockRate: number;
  isEnabled: boolean;
  safeBrowsingEnabled: boolean;
  parentalEnabled: boolean;
  filterRulesCount: number;
}

// Helper to make API request with timeout - fails silently when VPN disconnected
async function adguardFetch(path: string, options: RequestInit = {}): Promise<Response | null> {
  const auth = btoa(`${ADGUARD_API.username}:${ADGUARD_API.password}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await fetch(`${ADGUARD_API.baseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch {
    // Silently fail - VPN likely not connected
    return null;
  }
}

async function fetchAdGuard<T>(endpoint: string): Promise<T | null> {
  const response = await adguardFetch(endpoint);
  if (!response?.ok) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postAdGuard(endpoint: string, body?: object): Promise<boolean> {
  const response = await adguardFetch(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });

  return response?.ok ?? false;
}

export async function getAdBlockStats(): Promise<AdBlockStats> {
  const [stats, filtering, safebrowsing, parental] = await Promise.all([
    fetchAdGuard<AdGuardStats>('/control/stats'),
    fetchAdGuard<AdGuardFilteringStatus>('/control/filtering/status'),
    fetchAdGuard<FeatureStatus>('/control/safebrowsing/status'),
    fetchAdGuard<FeatureStatus>('/control/parental/status'),
  ]);

  const totalBlocked = stats?.num_blocked_filtering ?? 0;
  const totalQueries = stats?.num_dns_queries ?? 0;
  const blockRate = totalQueries > 0 ? (totalBlocked / totalQueries) * 100 : 0;

  const filterRulesCount = filtering?.filters?.reduce(
    (sum, f) => sum + (f.enabled ? f.rules_count : 0),
    0
  ) ?? 0;

  return {
    totalBlocked,
    totalQueries,
    blockRate: Math.round(blockRate * 10) / 10,
    isEnabled: filtering?.enabled ?? false,
    safeBrowsingEnabled: safebrowsing?.enabled ?? false,
    parentalEnabled: parental?.enabled ?? false,
    filterRulesCount,
  };
}

export async function setFilteringEnabled(enabled: boolean): Promise<boolean> {
  return postAdGuard('/control/filtering/config', {
    enabled,
    interval: 24,
  });
}

export async function setSafeBrowsingEnabled(enabled: boolean): Promise<boolean> {
  const endpoint = enabled ? '/control/safebrowsing/enable' : '/control/safebrowsing/disable';
  return postAdGuard(endpoint);
}

export async function setParentalEnabled(enabled: boolean): Promise<boolean> {
  const endpoint = enabled ? '/control/parental/enable' : '/control/parental/disable';
  return postAdGuard(endpoint);
}
