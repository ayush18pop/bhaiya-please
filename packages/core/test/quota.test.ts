import { describe, expect, it } from 'vitest';
import { classify } from '../src/arkiv/errors';

/** viem-shaped HTTP error chain as the Tiramisu RPC returns it when a read quota is used up. */
function httpError(status: number, details: string) {
  const inner = Object.assign(new Error('HTTP request failed.'), { name: 'HttpRequestError', status, details });
  return Object.assign(new Error('HTTP request failed.'), { name: 'HttpRequestError', status, details, cause: inner });
}

describe('quota classification', () => {
  it('keyed quota (QUOTA_EXCEEDED) is QUOTA_EXHAUSTED and never retried', () => {
    const c = classify(httpError(429, '"QUOTA_EXCEEDED"'));
    expect(c.code).toBe('QUOTA_EXHAUSTED');
    expect(c.retry).toBe('never');
  });
  it('anonymous budget (ANON_COST_LIMITED) is QUOTA_EXHAUSTED', () => {
    expect(classify(httpError(429, 'ANON_COST_LIMITED: unauthenticated query budget exhausted')).code).toBe('QUOTA_EXHAUSTED');
  });
  it('a plain 429 is still a retryable rate limit', () => {
    const c = classify(httpError(429, 'Too Many Requests'));
    expect(c.code).toBe('RATE_LIMITED');
    expect(c.retry).toBe('transport');
  });
});
