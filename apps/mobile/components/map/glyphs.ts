/**
 * Map marker geometry and tokens shared by the web (DOM SVG) and native (react-native-svg)
 * renderers. Drawn from the design system's "Map markers" artboard (Auto Meter Brutalism, dark).
 */
import type { ShopCategory, TierName } from '@bhaiya-please/core';
import type { RunnerPin } from './types';

export const C = {
  ink: '#141412',
  surface: '#1E1E1B',
  raised: '#292925',
  border: '#3A3A35',
  paper: '#F5F2EC',
  muted: '#B5B1A8',
  yellow: '#FFB400',
  green: '#3DBE74',
  // Basemap (tokens.color.map)
  land: '#141412',
  landAlt: '#191917',
  minorRoad: '#2A2A26',
  majorRoad: '#3A3A35',
  water: '#1C2A2E',
  labels: 'rgba(245,242,236,0.6)',
  glass: 'rgba(30,30,27,0.55)',
  glassBorder: 'rgba(245,242,236,0.85)',
} as const;

/** Font family names registered by lib/fonts.ts (expo-font). */
export const FONT = {
  display: 'ArchivoBlack_400Regular',
  body800: 'Baloo2_800ExtraBold',
  body700: 'Baloo2_700Bold',
  body600: 'Baloo2_600SemiBold',
} as const;
const FALLBACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
/** CSS font-family stacks for web. */
export const WEB_FONT = {
  display: `${FONT.display}, 'Archivo Black', ${FALLBACK}`,
  body800: `${FONT.body800}, 'Baloo 2', ${FALLBACK}`,
  body700: `${FONT.body700}, 'Baloo 2', ${FALLBACK}`,
  body600: `${FONT.body600}, 'Baloo 2', ${FALLBACK}`,
} as const;

/** Shop signboard: 34×22 paper rect; selected grows to 40×26 in yellow. */
export const SHOP = { w: 34, h: 22, selW: 40, selH: 26, shadow: 3 } as const;

/** Category glyphs, ink strokes (2px) in the 34×22 signboard's coordinate space. */
export const SHOP_GLYPH: Record<ShopCategory, string> = {
  // Basket (trapezoid + handle)
  grocery: 'M6 7h22l-2 10H8z M12 7l3-4h4l3 4',
  // Bun (dome + two score marks)
  bakery: 'M6 16a11 9 0 0 1 22 0z M13 11l2-2 M19 11l2-2',
  // Pill box with a cross
  pharmacy_otc: 'M12 4h10v14H12z M17 7v8 M13 11h8',
  // Pencil (body, tip, ferrule)
  stationery: 'M10 13L22 4l3 4-12 9z M10 13l-2 6 5-2 M19 6.3l3 4',
  // Bottle (cap + body + label line)
  household: 'M14 3h6v3h-6z M13 6h8l2 3v10H11V9z M11 13h12',
};

/** Boom barrier (48×32): paper post + yellow arm with two ink stripes. */
export const GATE = {
  w: 48,
  h: 32,
  post: { x: 2, y: 6, w: 7, h: 24 },
  arm: { x: 6, y: 6, w: 40, h: 9 },
  stripes: [14, 28],
  stripeW: 7,
} as const;
/** Horizontal distance from the gate glyph's centre to its post's centre (px at 32px height). */
export const GATE_POST_DX = GATE.w / 2 - (GATE.post.x + GATE.post.w / 2);

/** Runner marker: everything is relative to the marker centre (0,0). */
export const RUNNER = {
  r: 14,
  ring: 20,
  halo: 46,
  /** Heading arrow, pointing north before rotation. */
  arrow: 'M0 -21 L5 -13 L-5 -13 Z',
  /** Bike fallback when there's no initial (ink strokes, ~16px wide). */
  bike: 'M-5 3L-1.5-3.5H3L5.5 3 M-1.5-3.5L0.5 3H-5 M1.5-6H4.5',
  bikeWheels: [
    [-5.5, 3],
    [5.5, 3],
  ] as const,
  wheelR: 3.4,
} as const;

export const TIER_PLATE: Record<TierName, { label: string; bg: string }> = {
  verified: { label: 'VERIFIED', bg: C.yellow },
  trusted: { label: 'TRUSTED', bg: C.green },
  new: { label: 'NEW', bg: C.paper },
};

/** "Ravi · 4 min" (stale: "Ravi · 4 min · 1m ago"). */
export function runnerPlateText(r: RunnerPin): string {
  const eta = r.chip?.replace(/\s+away$/i, '');
  const parts = [r.name?.split(' ')[0], eta, r.freshness === 'stale' ? r.sub : undefined].filter(Boolean);
  return parts.join(' · ');
}

export const runnerInitial = (r: RunnerPin): string | undefined => r.initial?.trim().charAt(0).toUpperCase() || undefined;
