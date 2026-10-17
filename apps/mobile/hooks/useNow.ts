import { useSyncExternalStore } from 'react';

/**
 * One shared 1 s ticker for every countdown. Returns unix seconds, shifted by the sandbox clock
 * offset (F5 "fast-forward" advances the mock chain's clock; the UI follows).
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let offset = 0;
let current = Math.floor(Date.now() / 1000);
const tick = () => {
  current = Math.floor(Date.now() / 1000) + offset;
  listeners.forEach((l) => l());
};

export function setClockOffset(seconds: number) {
  offset = seconds;
  tick();
}
export const getClockOffset = () => offset;
export const nowUnix = () => Math.floor(Date.now() / 1000) + offset;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) timer = setInterval(tick, 1000);
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
