/**
 * ICE servers for WebRTC. STUN finds each browser's public address, which is enough for most home
 * networks. A TURN relay is added for players whose networks block direct connections (often mobile
 * data, hotspots, hotel or office Wi-Fi): with VITE_OPENRELAY_APP + VITE_OPENRELAY_API_KEY set at build
 * time, fresh credentials come from Open Relay (Metered); without them, STUN only.
 *
 * Anything baked into the build is visible in the page's JavaScript.
 */
const STUN: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' };
const CACHE_MS = 10 * 60_000;
let cached: { at: number; servers: RTCIceServer[] } | null = null;

export async function iceServers(): Promise<RTCIceServer[]> {
  const env = import.meta.env;
  const app = String(env.VITE_OPENRELAY_APP ?? '');
  const key = String(env.VITE_OPENRELAY_API_KEY ?? '');
  if (!/^[a-z0-9-]+$/i.test(app) || !key) return [STUN];

  if (cached && Date.now() - cached.at < CACHE_MS) return cached.servers;
  try {
    const res = await fetch(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) throw new Error(`Open Relay answered ${res.status}`);
    const relays: unknown = await res.json();
    if (!Array.isArray(relays) || relays.length === 0) throw new Error('Open Relay returned no servers');
    cached = { at: Date.now(), servers: [STUN, ...(relays as RTCIceServer[])] };
    return cached.servers;
  } catch (err) {
    console.warn('Relay unavailable, using direct connections only:', err);
    return [STUN];
  }
}
