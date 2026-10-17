/** Phone guided-tour progress (per tab). null = no tour running. */
import { useSyncExternalStore } from 'react';
import { getItem, removeItem, setItem } from '@/lib/storage';

const KEY = 'bp.sb.tour';
const subs = new Set<() => void>();
let cached: number | null | undefined;

function read(): number | null {
  if (cached !== undefined) return cached;
  const v = getItem('session', KEY);
  cached = v == null ? null : Number(v);
  return cached;
}

export function setTourStep(n: number | null) {
  cached = n;
  if (n == null) removeItem('session', KEY);
  else setItem('session', KEY, String(n));
  subs.forEach((f) => f());
}

export function useTourStep() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    read,
    read,
  );
}
