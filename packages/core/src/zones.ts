import ngeohash from 'ngeohash';
import { parseOrThrow } from './codec/validate';
import { zone6Schema } from './codec/schemas';
import { BhaiyaPleaseError } from './types';
import type { Zone, Zone6 } from './types';

/** Geohash precision 6 of a device position. Only the geohash ever leaves the device. */
export function zoneFromLatLng(lat: number, lng: number): Zone {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new BhaiyaPleaseError('INVALID_INPUT', 'Invalid coordinates');
  }
  return zoneFromGeohash(ngeohash.encode(lat, lng, 6));
}

export function zoneFromGeohash(zone6: Zone6, label?: string): Zone {
  const z = parseOrThrow(zone6Schema, zone6.toLowerCase(), 'zone');
  return label === undefined ? { zone6: z, zone5: z.slice(0, 5) } : { zone6: z, zone5: z.slice(0, 5), label };
}

/** Two neighbouring Whitefield (Bengaluru) cells sharing zone5 "tdr3c", so seeded shops are on route. */
export const DEMO_ZONES: readonly Zone[] = Object.freeze([
  zoneFromGeohash('tdr3c1', 'Whitefield (demo)'),
  zoneFromGeohash('tdr3c4', 'Whitefield North (demo)'),
]);
