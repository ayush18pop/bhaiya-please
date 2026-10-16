/** One MapView API, implemented by MapView.web.tsx (MapLibre GL) and MapView.native.tsx. */
import type { ShopCategory, TierName } from '@bhaiya-please/core';
import type { StyleProp, ViewStyle } from 'react-native';

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface ShopPin {
  id: string;
  pos: MapPoint;
  category: ShopCategory;
  name: string;
  selected?: boolean;
}

export interface RunnerPin {
  id: string;
  /** Centre of the latest valid ping's geohash-7 cell. */
  pos: MapPoint;
  heading?: number;
  tier: TierName | null;
  /** 'stale' = last ping older than 60 s (marker fades). Expired pings are not passed at all. */
  freshness: 'live' | 'stale';
  /** Main chip, e.g. "2 min away". */
  chip?: string;
  /** Secondary, e.g. "12 s ago". */
  sub?: string;
  focused?: boolean;
  /** Older live pings of this run (≤ 2 min), oldest first: breadcrumbs that vanish with their ping. */
  trail?: MapPoint[];
}

export interface RouteLine {
  id: string;
  /** Start: a fixed point, or "follow this runner's animated marker". */
  from: MapPoint | { runner: string };
  to: MapPoint;
  tone: 'primary' | 'muted';
}

export interface MapViewProps {
  society?: { pos: MapPoint; label: string };
  shops?: ShopPin[];
  runners?: RunnerPin[];
  routes?: RouteLine[];
  /** Points the camera keeps in view; refits when `fitKey` changes. */
  fit: MapPoint[];
  fitKey?: string;
  /** Extra camera padding (px), e.g. for an overlaid bottom sheet. */
  padding?: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>;
  onShopPress?: (id: string) => void;
  onRunnerPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Short footnote shown in the corner (e.g. "approx. ~150 m"). */
  note?: string;
}

export const BRAND = '#e2591b';
export const TIER_RING: Record<TierName | 'unknown', string> = {
  new: '#64748b',
  verified: '#0f766e',
  trusted: '#e2591b',
  unknown: '#94a3b8',
};
export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  grocery: 'Grocery',
  bakery: 'Bakery',
  pharmacy_otc: 'OTC',
  stationery: 'Stationery',
  household: 'Household',
};

/** Smooth arc a → b (quadratic Bézier bowed to one side), like delivery apps draw the last mile. */
export function arc(a: MapPoint, b: MapPoint, steps = 32): MapPoint[] {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const bow = 0.18;
  const c = { lat: (a.lat + b.lat) / 2 - dLng * bow, lng: (a.lng + b.lng) / 2 + dLat * bow };
  const out: MapPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({ lat: u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, lng: u * u * a.lng + 2 * u * t * c.lng + t * t * b.lng });
  }
  return out;
}

export function boundsOf(points: MapPoint[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of points) {
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
  }
  // Never zoom closer than ~400 m across.
  const minSpan = 0.004;
  if (n - s < minSpan) {
    const m = (n + s) / 2;
    s = m - minSpan / 2;
    n = m + minSpan / 2;
  }
  if (e - w < minSpan) {
    const m = (e + w) / 2;
    w = m - minSpan / 2;
    e = m + minSpan / 2;
  }
  return [[w, s], [e, n]];
}
