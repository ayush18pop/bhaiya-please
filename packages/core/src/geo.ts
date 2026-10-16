/**
 * Live-location geometry. Pure, no SDK, safe for the app bundle (also re-exported from the mock entry).
 *
 * Privacy rule: exact coordinates never leave the device. `coarsenToGh7` is the ONLY way a position
 * becomes chain data (a geohash-7 cell, ~153 m x 153 m); everything else here is display or
 * simulation math. The simulated route is synthetic (demo zones in Whitefield, Bengaluru).
 */
import ngeohash from 'ngeohash';
import { BhaiyaPleaseError } from './types';
import type { EntityKey, Gh7, Ping, UnixSeconds, Zone6 } from './types';
import { PING_RULES } from './types';

export interface LatLng {
  lat: number;
  lng: number;
}

const M_PER_DEG = 111_320;

/** Device position → geohash-7 cell. Throws INVALID_INPUT on impossible coordinates. */
export function coarsenToGh7(lat: number, lng: number): Gh7 {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new BhaiyaPleaseError('INVALID_INPUT', 'Invalid coordinates');
  }
  return ngeohash.encode(lat, lng, PING_RULES.precision);
}

/** Centre of any geohash cell (zone6, zone5 or gh7). This is all a viewer can know. */
export function geohashCenter(gh: string): LatLng {
  const { latitude, longitude } = ngeohash.decode(gh);
  return { lat: latitude, lng: longitude };
}

/** Cell bounds [south, west, north, east]. */
export function geohashBounds(gh: string): [number, number, number, number] {
  const [s, w, n, e] = ngeohash.decode_bbox(gh);
  return [s, w, n, e];
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const r = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a → b in degrees, 0 = north, clockwise. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * toRad) * Math.cos(b.lat * toRad);
  const x =
    Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) -
    Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lng - a.lng) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Move `meters` from `p` along `bearing` (flat-earth approximation; fine at city scale). */
export function offset(p: LatLng, bearing: number, meters: number): LatLng {
  const t = (bearing * Math.PI) / 180;
  return {
    lat: p.lat + (Math.cos(t) * meters) / M_PER_DEG,
    lng: p.lng + (Math.sin(t) * meters) / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180)),
  };
}

export function routeLength(route: readonly LatLng[]): number {
  let d = 0;
  for (let i = 1; i < route.length; i++) d += distanceMeters(route[i - 1]!, route[i]!);
  return d;
}

/** Point `meters` along a polyline, with the heading of that segment. Clamped to the ends. */
export function pointAlong(route: readonly LatLng[], meters: number): { pos: LatLng; heading: number } {
  if (route.length === 0) throw new BhaiyaPleaseError('INVALID_INPUT', 'empty route');
  if (route.length === 1) return { pos: route[0]!, heading: 0 };
  let left = Math.max(0, meters);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const seg = distanceMeters(a, b);
    if (left <= seg || i === route.length - 1) {
      const f = seg === 0 ? 1 : Math.min(1, left / seg);
      return { pos: { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, heading: bearingDeg(a, b) };
    }
    left -= seg;
  }
  const n = route.length;
  return { pos: route[n - 1]!, heading: bearingDeg(route[n - 2]!, route[n - 1]!) };
}

/** Viewer-side freshness of a ping. 'expired' pings are also gone from queries. */
export type PingFreshness = 'live' | 'stale' | 'expired';

export function pingAge(ping: Pick<Ping, 'createdAt'>, now: UnixSeconds): number {
  return Math.max(0, now - ping.createdAt);
}

export function pingFreshness(ping: Pick<Ping, 'createdAt' | 'expiresAt'>, now: UnixSeconds): PingFreshness {
  if (now >= ping.expiresAt) return 'expired';
  return pingAge(ping, now) > PING_RULES.staleAfterSeconds ? 'stale' : 'live';
}

// ---------------------------------------------------------------------------
// Synthetic movement (mock chain, heartbeat script, runner app "Simulate route")
// ---------------------------------------------------------------------------

/** Two-wheeler pace through Whitefield traffic. */
export const SIM_SPEED_KMH = 18;
const MIN_ROUTE_M = 900;
const MAX_ROUTE_M = 9_000;

export interface SimRunInput {
  key: EntityKey;
  fromZone: Zone6;
  destZone: Zone6;
  createdAt: UnixSeconds;
  eta: UnixSeconds;
}

export interface SimPosition {
  pos: LatLng;
  heading: number;
  speedKmh: number;
  /** 0..1 along the route. */
  progress: number;
  arrived: boolean;
}

function rng(seedHex: string): () => number {
  let s = Number.parseInt(seedHex.replace(/^0x/, '').slice(0, 8) || '1', 16) >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A believable, deterministic route for a run: it starts out on the far side of `from_zone`, winds
 * along a main road through the shops in `from_zone`, then turns into the society road and ends at
 * the `dest_zone` gate. Its length matches SIM_SPEED_KMH over the run's announce → ETA window, so a
 * simulated runner arrives on time and visibly moves on the map the whole way.
 */
export function simulatedRoute(run: SimRunInput): LatLng[] {
  const rand = rng(run.key);
  const gate = geohashCenter(run.destZone);
  const via = geohashCenter(run.fromZone);
  const duration = Math.max(120, run.eta - run.createdAt);
  const target = Math.min(MAX_ROUTE_M, Math.max(MIN_ROUTE_M, (SIM_SPEED_KMH / 3.6) * duration));

  const lastLeg = distanceMeters(via, gate);
  // Approach from the side of `via` facing away from the gate (random side if they coincide).
  const away = lastLeg > 50 ? bearingDeg(gate, via) : rand() * 360;
  const approach = (away + (rand() - 0.5) * 70 + 360) % 360;
  const outbound = Math.max(300, (target - lastLeg) / 1.12); // wiggles add ~12 %
  const origin = offset(via, approach, outbound);

  const pts: LatLng[] = [origin];
  const legs = 4 + Math.floor(rand() * 3);
  for (let i = 1; i < legs; i++) {
    const f = i / legs;
    const base = { lat: origin.lat + (via.lat - origin.lat) * f, lng: origin.lng + (via.lng - origin.lng) * f };
    const swing = (i % 2 === 0 ? 1 : -1) * (80 + rand() * 160);
    pts.push(offset(base, (bearingDeg(origin, via) + 90) % 360, swing));
  }
  pts.push(via);
  // Elbow into the society lane: go along one axis, then the other.
  const elbow = rand() < 0.5 ? { lat: gate.lat, lng: via.lng } : { lat: via.lat, lng: gate.lng };
  if (distanceMeters(elbow, via) > 20 && distanceMeters(elbow, gate) > 20) pts.push(elbow);
  pts.push(gate);
  return pts;
}

/** Where the simulated runner is at `now`. Before announce = route start; after ETA = at the gate. */
export function simulatedPosition(run: SimRunInput, now: UnixSeconds, route = simulatedRoute(run)): SimPosition {
  const len = routeLength(route);
  const duration = Math.max(120, run.eta - run.createdAt);
  const progress = Math.min(1, Math.max(0, (now - run.createdAt) / duration));
  const { pos, heading } = pointAlong(route, progress * len);
  const arrived = progress >= 1;
  return { pos, heading, speedKmh: arrived ? 0 : (len / duration) * 3.6, progress, arrived };
}
