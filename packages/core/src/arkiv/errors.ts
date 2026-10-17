/**
 * SDK/viem error → BhaiyaPleaseError. Matches on error `name`s and messages along the cause
 * chain rather than `instanceof`, so duplicated module copies (Metro, hoisting) can't break it.
 */
import { BhaiyaPleaseError } from '../types';
import type { BhaiyaPleaseErrorCode } from '../types';

export type Retry = 'transport' | 'nonce' | 'never';

export interface Classified {
  code: BhaiyaPleaseErrorCode;
  retry: Retry;
  /** Engine revert error name, if the chain rejected the operation. */
  revert?: string;
  /** True once a tx hash exists: never retry (the tx may land). */
  broadcast: boolean;
}

const REVERT_CODES: Record<string, BhaiyaPleaseErrorCode> = {
  NotOwner: 'NOT_OWNER',
  // No dedicated code for "readonly": both mean "you may not mutate this entity".
  ReadOnlyEntity: 'NOT_OWNER',
  EntityNotFound: 'NOT_FOUND',
  EntityExpired: 'EXPIRED',
  ExpiryNotExtended: 'INVALID_INPUT',
  ExpiryDeadOnArrival: 'INVALID_INPUT',
  TransferToSelf: 'INVALID_INPUT',
  TransferToZeroAddress: 'INVALID_INPUT',
  TooManyAttributes: 'INVALID_INPUT',
  InvalidValueType: 'INVALID_INPUT',
  Ident32InvalidByte: 'INVALID_INPUT',
  Ident32Empty: 'INVALID_INPUT',
};

interface ErrLike {
  name?: unknown;
  message?: unknown;
  shortMessage?: unknown;
  details?: unknown;
  status?: unknown;
  code?: unknown;
  txHash?: unknown;
  cause?: unknown;
  data?: { errorName?: unknown };
}

function chain(err: unknown): ErrLike[] {
  const out: ErrLike[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 10 && cur && typeof cur === 'object'; i++) {
    out.push(cur as ErrLike);
    cur = (cur as ErrLike).cause;
  }
  return out;
}

const text = (e: ErrLike): string =>
  [e.message, e.shortMessage, e.details].filter((v) => typeof v === 'string').join(' | ');

export function classify(err: unknown): Classified {
  if (err instanceof BhaiyaPleaseError) {
    return { code: err.code, retry: err.retryable ? 'transport' : 'never', broadcast: false };
  }
  const links = chain(err);
  const broadcast = links.some((e) => typeof e.txHash === 'string' && e.txHash.startsWith('0x'));
  const all = links.map(text).join(' || ');

  for (const e of links) {
    if (e.name === 'ContractFunctionRevertedError') {
      const revert = typeof e.data?.errorName === 'string' ? e.data.errorName : undefined;
      return { code: (revert && REVERT_CODES[revert]) || 'BATCH_FAILED', retry: 'never', revert, broadcast };
    }
  }
  const revertName = /\b(NotOwner|ReadOnlyEntity|EntityNotFound|EntityExpired|ExpiryNotExtended)\b/.exec(all)?.[1];
  if (revertName) return { code: REVERT_CODES[revertName] ?? 'BATCH_FAILED', retry: 'never', revert: revertName, broadcast };
  if (/readonly, so its contents can never change/i.test(all)) {
    return { code: 'NOT_OWNER', retry: 'never', revert: 'ReadOnlyEntity', broadcast };
  }
  if (/is owned by 0x[0-9a-f]+, not 0x/i.test(all)) return { code: 'NOT_OWNER', retry: 'never', revert: 'NotOwner', broadcast };
  if (/reverted/i.test(all)) return { code: 'BATCH_FAILED', retry: 'never', broadcast };

  if (links.some((e) => e.name === 'NoEntityFoundError')) return { code: 'NOT_FOUND', retry: 'never', broadcast };
  // arkiv_query rejections reuse -32005 for "cursor expired"; never treat them as rate limits. The
  // paginator restarts cursor errors itself; other kinds (parse/type/literal/limits/block) are bugs.
  const qe = links.find((e) => e.name === 'QueryError') as (ErrLike & { kind?: unknown }) | undefined;
  if (qe) return { code: qe.kind === 'cursor' ? 'NETWORK' : 'INVALID_INPUT', retry: 'never', broadcast };
  if (links.some((e) => e.name === 'InsufficientFundsError') || /insufficient funds/i.test(all)) {
    return { code: 'INSUFFICIENT_FUNDS', retry: 'never', broadcast };
  }
  if (links.some((e) => e.name === 'NonceTooLowError') || /nonce too low|nonce has already been used/i.test(all)) {
    return { code: 'NETWORK', retry: 'nonce', broadcast };
  }
  // Quota, not congestion: retrying only burns more of a budget that is already gone.
  if (/QUOTA_EXCEEDED|ANON_COST_LIMITED|quota exhausted|budget exhausted/i.test(all + links.map((e) => String((e as { details?: unknown }).details ?? '')).join(' '))) {
    return { code: 'QUOTA_EXHAUSTED', retry: 'never', broadcast };
  }
  if (
    links.some((e) => e.status === 429 || e.code === -32005 || e.name === 'LimitExceededRpcError') ||
    /\b429\b|rate limit|too many requests/i.test(all)
  ) {
    return { code: 'RATE_LIMITED', retry: 'transport', broadcast };
  }
  if (
    links.some(
      (e) =>
        e.name === 'HttpRequestError' ||
        e.name === 'TimeoutError' ||
        e.name === 'WebSocketRequestError' ||
        e.name === 'SocketClosedError' ||
        (typeof e.status === 'number' && e.status >= 500),
    ) ||
    /fetch failed|network request failed|failed to fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(all)
  ) {
    return { code: 'NETWORK', retry: 'transport', broadcast };
  }
  if (links.some((e) => e.name === 'InvalidValueError' || e.name === 'InvalidAttributeNameError')) {
    return { code: 'INVALID_INPUT', retry: 'never', broadcast };
  }
  return { code: 'UNKNOWN', retry: 'never', broadcast };
}

export function toBhaiyaError(op: string, err: unknown, c: Classified = classify(err)): BhaiyaPleaseError {
  if (err instanceof BhaiyaPleaseError) return err;
  const detail = chain(err).map(text).find((t) => t.length > 0) ?? String(err);
  return new BhaiyaPleaseError(c.code, `${op}: ${detail.slice(0, 300)}`, {
    cause: err,
    retryable: c.code === 'RATE_LIMITED' || c.code === 'NETWORK',
  });
}
