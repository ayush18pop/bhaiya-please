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

/** Plain-language error, chain jargon only in `detail`. Says what happened, no apology. */
export function describeError(e: unknown): { code: string; message: string; detail: string } {
  const code = (e as { code?: string })?.code ?? 'UNKNOWN';
  const detail = (e as Error)?.message ?? String(e);
  const map: Record<string, string> = {
    INSUFFICIENT_FUNDS: 'This test network needs a little free credit on your account. Settings → Advanced.',
    RATE_LIMITED: 'The network is busy. Try again in a moment.',
    QUOTA_EXHAUSTED: "The network's free limit is used up for now. Try again in a minute.",
    NETWORK: 'Network dropped.',
    EXPIRED: 'The run ended.',
    CAPACITY_EXHAUSTED: 'The run filled up.',
    TIER_LIMIT: "That's above this runner's limit.",
    INVALID_REVEAL: "Code doesn't match this request.",
    NOT_FOUND: 'It has expired or was removed.',
    NOT_OWNER: 'Only the owner can do that.',
    NO_SIGNER: 'Finish signing up first.',
  };
  let message = map[code];
  if (!message && code === 'INVALID_INPUT') message = /accepted/i.test(detail) ? 'It was already accepted.' : /declined/i.test(detail) ? 'The runner declined it.' : detail;
  return { code, message: message ?? 'Nothing was saved. Try again.', detail };
}
