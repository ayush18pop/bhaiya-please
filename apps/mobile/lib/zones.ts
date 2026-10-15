import type { Zone } from '@bhaiya-please/core';
import { DEMO_ZONES } from '@bhaiya-please/core/mock';

/** Demo zones: geohashes come from core (seed data lives there); society labels are app-side copy. */
const SOCIETIES = [
  { id: 'A', label: 'Lotus Heights (Whitefield, demo)', society: 'Lotus Heights' },
  { id: 'B', label: 'Green Park Apts (Whitefield N, demo)', society: 'Green Park Apts' },
] as const;

export const ZONES: readonly (Zone & { id: 'A' | 'B'; society: string })[] = DEMO_ZONES.slice(0, SOCIETIES.length).map(
  (z, i) => ({ ...z, ...SOCIETIES[i]! }),
);

export const zoneById = (id?: string | null) => ZONES.find((z) => z.id === id) ?? ZONES[0];
export const zoneByHash = (zone6?: string | null) => ZONES.find((z) => z.zone6 === zone6);
export const zoneLabel = (zone6: string) => zoneByHash(zone6)?.label ?? zone6;
