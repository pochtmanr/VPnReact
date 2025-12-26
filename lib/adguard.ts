// AdGuard Home API Service
// Connects to the AdGuard Home DNS server running on the VPN server

const ADGUARD_BASE_URL = 'http://72.61.87.54:3000';
const ADGUARD_AUTH = btoa('admin:VpnAdmin123');

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

interface AdGuardStatus {
  protection_enabled: boolean;
  running: boolean;
  version: string;
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

async function fetchAdGuard<T>(endpoint: string): Promise<T | null> {
  try {
    const response = await fetch(`${ADGUARD_BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Basic ${ADGUARD_AUTH}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`AdGuard API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('AdGuard API fetch error:', error);
    return null;
  }
}

async function postAdGuard(endpoint: string, body?: object): Promise<boolean> {
  try {
    const response = await fetch(`${ADGUARD_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${ADGUARD_AUTH}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.ok;
  } catch (error) {
    console.warn('AdGuard API post error:', error);
    return false;
  }
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
