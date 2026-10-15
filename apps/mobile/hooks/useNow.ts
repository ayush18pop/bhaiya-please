import { useSyncExternalStore } from 'react';

/** One shared 1 s ticker for every countdown. Returns unix seconds. */
let listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Math.floor(Date.now() / 1000);

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      current = Math.floor(Date.now() / 1000);
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow() {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
