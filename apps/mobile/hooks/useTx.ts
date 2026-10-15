import { useCallback, useRef, useState } from 'react';

export type TxState = 'idle' | 'pending' | 'confirmed' | 'failed';

/** Wraps a write. Ref-guard drops calls while pending, so a double tap can never double-submit. */
export function useTx<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [state, setState] = useState<TxState>('idle');
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setState('pending');
      setError(null);
      try {
        const r = await fn(...args);
        setState('confirmed');
        return r;
      } catch (e) {
        setError(e);
        setState('failed');
        return undefined;
      } finally {
        busy.current = false;
      }
    },
    [fn],
  );
  const reset = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);
  return { state, error, run, reset };
}

/** Plain-language error, chain jargon only in `detail`. */
export function describeError(e: unknown): { code: string; message: string; detail: string } {
  const code = (e as { code?: string })?.code ?? 'UNKNOWN';
  const detail = (e as Error)?.message ?? String(e);
  const map: Record<string, string> = {
    INSUFFICIENT_FUNDS: 'Your wallet needs a little test money first.',
    RATE_LIMITED: 'The network is busy. Try again in a moment.',
    NETWORK: 'No connection. Check your internet.',
    EXPIRED: 'This run just ended.',
    CAPACITY_EXHAUSTED: 'This run is full.',
    TIER_LIMIT: 'That is above what this runner can take.',
    INVALID_REVEAL: "Code doesn't match. Ask them to refresh.",
    NOT_FOUND: 'We could not find that. It may have expired.',
    NOT_OWNER: 'Only the owner can do that.',
  };
  return { code, message: map[code] ?? "Didn't go through. Nothing was sent.", detail };
}
