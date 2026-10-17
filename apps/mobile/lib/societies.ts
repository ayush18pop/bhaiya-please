/**
 * Curated societies directory (A4) and named areas runners come from (C3). Only a society's
 * geohash-6 cell ever goes on chain; names are app-side copy. All names are fictional.
 * Lotus Heights and Green Park are the seeded cells (core DEMO_ZONES), so they have live data.
 */
import type { Zone } from '@bhaiya-please/core';
import { DEMO_ZONES, geohashCenter, zoneFromLatLng } from '@bhaiya-please/core/mock';

export interface Society extends Zone {
  id: string;
  name: string;
  area: string;
  /** Meeting point shown on maps: centre of the society's cell. */
  gate: { lat: number; lng: number };
}

const fromZone = (id: string, name: string, area: string, z: Zone): Society => ({ ...z, id, name, area, gate: geohashCenter(z.zone6) });
const at = (id: string, name: string, area: string, lat: number, lng: number) => fromZone(id, name, area, zoneFromLatLng(lat, lng));

export const SOCIETIES: readonly Society[] = [
  fromZone('A', 'Lotus Heights', 'Whitefield', DEMO_ZONES[0]!),
  fromZone('B', 'Green Park Apts', 'Whitefield North', DEMO_ZONES[1]!),
  at('neem-court', 'Neem Court', 'Hope Farm', 12.9842, 77.7531),
  at('banyan', 'Banyan Residency', 'ITPL Main Rd', 12.9889, 77.7302 + 0.0125),
  at('mango-grove', 'Mango Grove Apts', 'Kadugodi', 12.9972, 77.7608),
  at('sunrise', 'Sunrise Enclave', 'Channasandra', 12.9701, 77.7655),
  at('jasmine', 'Jasmine Towers', 'Varthur Rd', 12.9668, 77.7488),
  at('coconut', 'Coconut Grove', 'Siddapura', 13.0021, 77.7489),
];

/** Areas a runner can start from (plus every society). */
export const AREAS: readonly { id: string; name: string; zone6: string }[] = [
  { id: 'wf-main', name: 'Whitefield Main Rd', zone6: zoneFromLatLng(12.9806, 77.7431).zone6 },
  { id: 'hope-farm', name: 'Hope Farm Junction', zone6: zoneFromLatLng(12.9858, 77.7563).zone6 },
  { id: 'itpl', name: 'ITPL Main Rd', zone6: zoneFromLatLng(12.9875, 77.7375).zone6 },
  { id: 'varthur', name: 'Varthur Rd', zone6: zoneFromLatLng(12.9655, 77.7520).zone6 },
  { id: 'kadugodi', name: 'Kadugodi Market', zone6: zoneFromLatLng(12.9955, 77.7605).zone6 },
];

export const societyById = (id?: string | null) => SOCIETIES.find((s) => s.id === id) ?? SOCIETIES[0]!;
export const societyByZone = (zone6?: string | null) => SOCIETIES.find((s) => s.zone6 === zone6);

/** Human name for any zone6 cell: a society, a named area, or a plain fallback. */
export function placeName(zone6?: string | null): string {
  if (!zone6) return 'Nearby';
  return societyByZone(zone6)?.name ?? AREAS.find((a) => a.zone6 === zone6)?.name ?? 'Nearby area';
}

export function searchSocieties(q: string): Society[] {
  const s = q.trim().toLowerCase();
  if (!s) return [...SOCIETIES];
  return SOCIETIES.filter((x) => x.name.toLowerCase().includes(s) || x.area.toLowerCase().includes(s));
}

/** Rough distance in km between two points (for "1.2 km away" in the society list). */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
