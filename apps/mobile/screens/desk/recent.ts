/** Desk "recent checks": a short device-local list per desk account (never on chain). */
import { useSyncExternalStore } from 'react';
import { getJSON, setJSON } from '@/lib/storage';

export interface RecentCheck {
  addr: string;
  at: number;
  outcome: 'looked' | 'vouched' | 'removed';
  level?: 'id_checked' | 'resident';
}

const key = (desk: string) => `bp.desk.recent.${desk.toLowerCase()}`;
const subs = new Set<() => void>();
const cache = new Map<string, RecentCheck[]>();

function read(desk: string) {
  let v = cache.get(desk);
  if (!v) cache.set(desk, (v = getJSON<RecentCheck[]>('local', key(desk), [])));
  return v;
}

/** Record a check; a stronger outcome replaces "looked" for the same runner. */
export function recordCheck(desk: string, c: RecentCheck) {
  const prev = read(desk);
  const same = prev.find((x) => x.addr === c.addr);
  const outcome = c.outcome === 'looked' && same && same.outcome !== 'looked' && c.at - same.at < 3600 ? same.outcome : c.outcome;
  const next = [{ ...same, ...c, outcome }, ...prev.filter((x) => x.addr !== c.addr)].slice(0, 20);
  cache.set(desk, next);
  setJSON('local', key(desk), next);
  subs.forEach((f) => f());
}

export function useRecentChecks(desk: string | null): RecentCheck[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => (desk ? read(desk) : EMPTY),
    () => EMPTY,
  );
}
const EMPTY: RecentCheck[] = [];
