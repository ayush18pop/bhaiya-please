/** Domain objects → map pins. Positions are cell centres: the chain never holds anything finer. */
import type { Ping, Run, Shop, TierName } from '@bhaiya-please/core';
import { geohashBounds, geohashCenter, pingAge, pingFreshness } from '@bhaiya-please/core/mock';
import type { MapPoint, RunnerPin, ShopPin } from '@/components/map/types';

export const zoneCenter = (zone6: string): MapPoint => geohashCenter(zone6);

/** Shops only have a zone6 cell; spread them deterministically inside it so pins don't stack. */
export function shopPos(shop: Pick<Shop, 'key' | 'zone'>): MapPoint {
  const [s, w, n, e] = geohashBounds(shop.zone);
  const h = (i: number) => Number.parseInt(shop.key.slice(2 + i * 4, 6 + i * 4), 16) / 0xffff;
  return { lat: s + (n - s) * (0.2 + 0.6 * h(0)), lng: w + (e - w) * (0.2 + 0.6 * h(1)) };
}

export const shopPins = (shops: Shop[], selected?: string | null): ShopPin[] =>
  shops.map((s) => ({ id: s.key, pos: shopPos(s), category: s.category, name: s.nameTag, selected: s.key === selected }));

export function etaLabel(run: Pick<Run, 'eta'>, now: number): string {
  const left = run.eta - now;
  if (left <= 0) return 'At the gate';
  return `${Math.max(1, Math.ceil(left / 60))} min away`;
}

export function agoShort(sec: number): string {
  return sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`;
}

/** A runner pin from the latest valid ping, or null if there is no live ping (marker hidden). */
export function runnerPin(
  run: Run,
  ping: Ping | undefined,
  now: number,
  o: { tier?: TierName | null; focused?: boolean; trail?: Ping[] } = {},
): RunnerPin | null {
  if (!ping) return null;
  const f = pingFreshness(ping, now);
  if (f === 'expired') return null;
  return {
    id: run.key,
    pos: geohashCenter(ping.gh7),
    ...(ping.heading !== undefined ? { heading: ping.heading } : {}),
    tier: o.tier ?? null,
    freshness: f,
    chip: etaLabel(run, now),
    sub: agoShort(pingAge(ping, now)),
    focused: !!o.focused,
    trail: (o.trail ?? []).filter((p) => p.key !== ping.key && now < p.expiresAt).map((p) => geohashCenter(p.gh7)),
  };
}
