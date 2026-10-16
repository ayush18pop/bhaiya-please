/**
 * Liveness: is the app actually hearing the chain right now? Fed by the one core.subscribe bridge
 * (event times) and by query fetch times. Tiny external store, no context needed.
 */
import { useSyncExternalStore } from 'react';

let lastEventAt = 0;
const listeners = new Set<() => void>();

export function markEvent() {
  lastEventAt = Date.now();
  listeners.forEach((l) => l());
}

export function useLastEventAt() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lastEventAt,
    () => lastEventAt,
  );
}

/** Healthy if data refreshed recently and the last fetch did not fail. */
export function liveness(dataUpdatedAt: number, isError: boolean, nowMs: number, eventAt: number) {
  const fresh = Math.max(dataUpdatedAt, eventAt);
  const ago = fresh ? Math.max(0, Math.round((nowMs - fresh) / 1000)) : null;
  return { live: !isError && ago !== null && ago < 15, ago };
}
