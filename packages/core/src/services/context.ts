import type { ArkivPort, Predicate, RawEntity, ReadPort } from '../arkiv/port';
import { strV } from '../codec/attrs';
import type { DropSink } from '../codec/entities';
import { BhaiyaPleaseError } from '../types';
import type { Address, EntityKey, EntityMeta, EntityType } from '../types';

/** 'auto' tries the single atomic batch and falls back to two txs (for the session) if rejected. */
export type ReceiptMode = 'auto' | 'batch' | 'two_tx';

export interface ServiceContext {
  port: ArkivPort;
  project: string;
  /** Lowercased. */
  trustedVerifiers: ReadonlySet<Address>;
  receiptMode: ReceiptMode;
  explorerBaseUrl?: string;
  drop?: DropSink;
}

export const DAY = 24 * 3600;
export const TTL = {
  shop: 30 * DAY,
  attestation: 180 * DAY,
  complaint: 180 * DAY,
  /** No-show evidence lives as long as a complaint that may cite it. */
  noshow: 180 * DAY,
  year: 365 * DAY,
  /** Run lives until eta + 10 min. */
  runAfterEta: 600,
  /** Request lives until run expiry + 1 h. */
  requestGrace: 3600,
} as const;

/**
 * extend SETS expiry to now+seconds and reverts unless that is later, so only include an
 * extension that clearly moves it (60 s margin absorbs block↔time conversion drift).
 */
export function extensionMovesLater(currentExpiresAt: number, now: number, seconds: number): boolean {
  return currentExpiresAt < now + seconds - 60;
}

export function requireSigner(ctx: ServiceContext): Address {
  const a = ctx.port.address;
  if (!a) throw new BhaiyaPleaseError('NO_SIGNER', 'Connect a wallet first (read-only mode)');
  return a;
}

export type Decoder<T> = (raw: RawEntity, project: string, drop?: DropSink) => T | null;

export interface Reader {
  now(): number;
  list<T extends EntityMeta>(
    type: EntityType,
    decoder: Decoder<T>,
    where?: Predicate[],
    scope?: { owner?: Address; creator?: Address },
  ): Promise<T[]>;
  one<T extends EntityMeta>(key: EntityKey, decoder: Decoder<T>): Promise<T | null>;
}

/** Typed, validated, expiry-filtered reads over any ReadPort (head or historical). */
export function reader(r: ReadPort, project: string, drop?: DropSink): Reader {
  const live = <T extends EntityMeta>(x: T | null): x is T => x !== null && x.expiresAt > r.now();
  return {
    now: () => r.now(),
    async list(type, decoder, where = [], scope = {}) {
      const q: Parameters<ReadPort['query']>[0] = {
        where: [
          { op: 'eq', name: 'project', value: strV(project) },
          { op: 'eq', name: 'type', value: strV(type) },
          ...where,
        ],
      };
      if (scope.owner) q.owner = scope.owner;
      if (scope.creator) q.creator = scope.creator;
      const rows = await r.query(q);
      return rows.map((raw) => decoder(raw, project, drop)).filter(live);
    },
    async one(key, decoder) {
      const raw = await r.get(key.toLowerCase() as EntityKey);
      const x = raw ? decoder(raw, project, drop) : null;
      return live(x) ? x : null;
    },
  };
}

/** Memoizes `get` for the lifetime of one computation (reputation joins hit the same keys). */
export function memoGets(r: ReadPort): ReadPort {
  const cache = new Map<EntityKey, Promise<RawEntity | null>>();
  return {
    now: () => r.now(),
    query: (q) => r.query(q),
    get(key) {
      let p = cache.get(key);
      if (!p) {
        p = r.get(key);
        cache.set(key, p);
      }
      return p;
    },
  };
}

export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

export const sameAddr = (a: string | undefined | null, b: string | undefined | null): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
