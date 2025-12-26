/**
 * Fetches VPN servers from VPN Gate and populates Supabase
 *
 * Usage:
 *   npx tsx scripts/populate-vpn-servers.ts
 *
 * Required env vars:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY - Your Supabase service role key (NOT anon key)
 */

import { createClient } from '@supabase/supabase-js';

const VPNGATE_API = 'http://www.vpngate.net/api/iphone/';

interface VPNGateServer {
  HostName: string;
  IP: string;
  Score: string;
  Ping: string;
  Speed: string;
  CountryLong: string;
  CountryShort: string;
  NumVpnSessions: string;
  Uptime: string;
  TotalUsers: string;
  TotalTraffic: string;
  LogType: string;
  Operator: string;
  Message: string;
  OpenVPN_ConfigData_Base64: string;
}

async function fetchVPNGateServers(): Promise<VPNGateServer[]> {
  console.log('Fetching servers from VPN Gate...');

  const response = await fetch(VPNGATE_API);
  const text = await response.text();

  // Parse CSV - skip first 2 lines (header info) and last line
  const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('*'));
  const headerLine = lines.find(line => line.startsWith('#HostName'));

  if (!headerLine) {
    throw new Error('Could not find header line in CSV');
  }

  const headers = headerLine.substring(1).split(','); // Remove leading #
  const dataLines = lines.filter(line => !line.startsWith('#'));

  const servers: VPNGateServer[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const values = line.split(',');
    if (values.length < headers.length) continue;

    const server: Record<string, string> = {};
    headers.forEach((header, index) => {
      server[header.trim()] = values[index] || '';
    });

    // Only include servers with OpenVPN config
    if (server['OpenVPN_ConfigData_Base64']) {
      servers.push(server as unknown as VPNGateServer);
    }
  }

  console.log(`Found ${servers.length} servers with OpenVPN support`);
  return servers;
}

function getCityFromHostname(hostname: string, country: string): string {
  // Try to extract city from hostname or use country as fallback
  const parts = hostname.toLowerCase().split('.');
  if (parts.length > 0) {
    const cityPart = parts[0].replace(/[0-9]/g, '').replace(/-/g, ' ');
    if (cityPart.length > 2) {
      return cityPart.charAt(0).toUpperCase() + cityPart.slice(1);
    }
  }
  return country;
}

async function populateSupabase(servers: VPNGateServer[]) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
    console.log('\nSet them like this:');
    console.log('  export SUPABASE_URL="https://your-project.supabase.co"');
    console.log('  export SUPABASE_SERVICE_KEY="your-service-role-key"');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Clear existing servers (optional - comment out to keep existing)
  console.log('Clearing existing servers...');
  await supabase.from('vpn_servers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('Inserting new servers...');

  const vpnServers = servers.map((server, index) => ({
    name: server.HostName || `Server ${index + 1}`,
    country: server.CountryLong || 'Unknown',
    country_code: server.CountryShort || 'XX',
    city: getCityFromHostname(server.HostName, server.CountryLong),
    ip_address: server.IP,
    port: 1194,
    protocol: 'udp' as const,
    config_data: Buffer.from(server.OpenVPN_ConfigData_Base64, 'base64').toString('utf-8'),
    load_percentage: Math.min(100, Math.floor(parseInt(server.NumVpnSessions || '0') / 10)),
    is_premium: false,
    latency_ms: parseInt(server.Ping) || null,
    is_active: true,
    speed_mbps: parseInt(server.Speed) / 1000000 || null, // Convert bps to Mbps
    score: parseInt(server.Score) || 0,
    operator: server.Operator || null,
    uptime_seconds: parseInt(server.Uptime) || null,
    total_users: parseInt(server.TotalUsers) || null,
  }));

  // Insert in batches of 50
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < vpnServers.length; i += batchSize) {
    const batch = vpnServers.slice(i, i + batchSize);
    const { error } = await supabase.from('vpn_servers').insert(batch);

    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${vpnServers.length} servers...`);
    }
  }

  console.log(`\nDone! Inserted ${inserted} VPN servers.`);
}

async function main() {
  try {
    const servers = await fetchVPNGateServers();
    await populateSupabase(servers);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
