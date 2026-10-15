/**
 * In-memory fake of the Arkiv engine behind the same ArkivPort the real adapter implements.
 * Enforces what services rely on: owner-only patch/transfer/delete, readonly, permissionless
 * extension, extend-must-move-later, nonce-bound key prediction, atomic ordered batches, expiry
 * by a simulated clock. Optional persistence to a localStorage-like store with cross-tab sync.
 */
import { encodePacked, keccak256, stringToHex, toHex } from 'viem';
import { getCrypto } from '../codec/handoff';
import { BhaiyaPleaseError } from '../types';
import type { Address, EntityKey, TxHash, UnixSeconds } from '../types';
import { lifetimeSeconds } from '../arkiv/port';
import type {
  ArkivPort,
  BatchOps,
  CreateSpec,
  Predicate,
  QueryAst,
  RawEntity,
  RawEvent,
  Writer,
} from '../arkiv/port';
import { createWriteQueue } from '../arkiv/queue';

/** Minimal Web Storage surface (window.localStorage). */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MockChainOptions {
  /** Base clock (unix seconds). Simulated time = base() + offset. */
  now?: () => UnixSeconds;
  latencyMs?: number;
  storage?: KVStorage;
  storageKey?: string;
  /** Simulates an engine that rejects transferring an entity created in the same batch. */
  rejectSameBatchTransfer?: boolean;
}

interface State {
  entities: Record<string, RawEntity>;
  nonces: Record<string, number>;
  clockOffset: number;
  tx: number;
}

const CHAIN_ID = 7738577n;
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_ATTRS = 32;
const MAX_STR_BYTES = 128;
const MAX_PAYLOAD_BYTES = 128 * 1024;
const ATTR_NAME = /^[A-Za-z][A-Za-z0-9._-]*$/;
const RESERVED = new Set(
  'and or not true false startswith exists typeof bool i32 u64 u256 dec bytes32 bytes str addr key'.split(' '),
);
export const DEFAULT_STORAGE_KEY = 'bhaiyaplease.mock.v1';
export const MOCK_BALANCE = 10n ** 18n;

const emptyState = (): State => ({ entities: {}, nonces: {}, clockOffset: 0, tx: 0 });
const err = (code: ConstructorParameters<typeof BhaiyaPleaseError>[0], msg: string) => new BhaiyaPleaseError(code, msg);

export function mockEntityKey(owner: Address, nonce: number, salt: bigint): EntityKey {
  return keccak256(
    encodePacked(['uint256', 'address', 'uint64', 'uint128'], [CHAIN_ID, owner, BigInt(nonce), salt]),
  ).toLowerCase() as EntityKey;
}

function randomSalt(): bigint {
  const b = getCrypto().getRandomValues(new Uint8Array(16));
  return BigInt(toHex(b));
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

// bigint-safe JSON for persistence
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? { $big: v.toString() } : v);
const reviver = (_k: string, v: unknown) =>
  v && typeof v === 'object' && '$big' in v && typeof (v as { $big: unknown }).$big === 'string'
    ? BigInt((v as { $big: string }).$big)
    : v;

export class MockChain {
  latencyMs: number;
  private state: State = emptyState();
  private readonly base: () => UnixSeconds;
  private readonly listeners = new Set<(e: RawEvent) => void>();
  private readonly storage: KVStorage | undefined;
  private readonly storageKey: string;
  private readonly rejectSameBatchTransfer: boolean;
  private readonly detachStorage: (() => void) | undefined;
  /** While true, commits skip persistence (bulk seeding); call persist() after. */
  persistencePaused = false;

  constructor(opts: MockChainOptions = {}) {
    this.base = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.latencyMs = opts.latencyMs ?? 0;
    this.storage = opts.storage;
    this.storageKey = opts.storageKey ?? DEFAULT_STORAGE_KEY;
    this.rejectSameBatchTransfer = opts.rejectSameBatchTransfer ?? false;
    this.detachStorage = this.storage ? this.listenForOtherTabs() : undefined;
  }

  /** True if persisted state was found and loaded. */
  load(): boolean {
    const text = this.storage?.getItem(this.storageKey);
    if (!text) return false;
    try {
      this.state = JSON.parse(text, reviver) as State;
      return true;
    } catch {
      return false;
    }
  }

  now(): UnixSeconds {
    return Math.floor(this.base() + this.state.clockOffset);
  }

  advance(seconds: number): void {
    this.state.clockOffset += seconds;
    this.persist();
  }

  /** Seeding: pretend it is `unix` (null = back to the present). Not persisted mid-seed by design. */
  travelTo(unix: UnixSeconds | null, presentOffset = 0): void {
    this.state.clockOffset = unix === null ? presentOffset : unix - this.base();
  }

  get clockOffset(): number {
    return this.state.clockOffset;
  }

  reset(): void {
    this.state = emptyState();
    this.persist();
  }

  persist(): void {
    if (this.persistencePaused) return;
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.state, replacer));
    } catch {
      // Quota or privacy mode: keep working in memory.
    }
  }

  dispose(): void {
    this.detachStorage?.();
    this.listeners.clear();
  }

  subscribe(cb: (e: RawEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(events: RawEvent[]) {
    for (const e of events) for (const l of [...this.listeners]) l(e);
  }

  // ---------------------------------------------------------------- reads

  private isLive(e: RawEntity): boolean {
    return e.expiresAt > this.now();
  }

  get(key: EntityKey): RawEntity | null {
    const e = this.state.entities[key.toLowerCase()];
    return e && this.isLive(e) ? structuredCloneEntity(e) : null;
  }

  query(q: QueryAst): RawEntity[] {
    if (q.where.length === 0) throw err('INVALID_INPUT', 'query needs at least one predicate');
    const owner = q.owner?.toLowerCase();
    const creator = q.creator?.toLowerCase();
    return Object.values(this.state.entities)
      .filter(
        (e) =>
          this.isLive(e) &&
          (!owner || e.owner === owner) &&
          (!creator || e.creator === creator) &&
          q.where.every((p) => matches(e, p)),
      )
      .map(structuredCloneEntity);
  }

  // ---------------------------------------------------------------- writes

  predictKeys(sender: Address, count: number): { key: EntityKey; salt: bigint }[] {
    const nonce = this.state.nonces[sender] ?? 0;
    return Array.from({ length: count }, (_, i) => {
      const salt = randomSalt();
      return { key: mockEntityKey(sender, nonce + i, salt), salt };
    });
  }

  /** One "transaction": waits a block, applies atomically, then emits events. */
  async commit(sender: Address, ops: BatchOps): Promise<{ txHash: TxHash; created: EntityKey[] }> {
    await sleep(this.latencyMs);
    const work: State = {
      ...this.state,
      entities: { ...this.state.entities },
      nonces: { ...this.state.nonces },
    };
    const events: RawEvent[] = [];
    const created = this.apply(work, sender, ops, events);
    work.tx += 1;
    this.state = work;
    this.pruneExpired();
    this.persist();
    this.emit(events);
    return { txHash: keccak256(stringToHex(`mock-tx-${work.tx}`)) as TxHash, created };
  }

  private apply(s: State, sender: Address, ops: BatchOps, events: RawEvent[]): EntityKey[] {
    const now = this.now();
    const created: EntityKey[] = [];
    const total =
      (ops.creates?.length ?? 0) +
      (ops.patches?.length ?? 0) +
      (ops.deletes?.length ?? 0) +
      (ops.extensions?.length ?? 0) +
      (ops.transfers?.length ?? 0);
    if (total === 0) throw err('INVALID_INPUT', 'empty batch');

    const live = (key: EntityKey): RawEntity => {
      const e = s.entities[key.toLowerCase()];
      if (!e) throw err('NOT_FOUND', `no entity ${key}`);
      if (e.expiresAt <= now) throw err('EXPIRED', `entity ${key} expired`);
      return e;
    };
    const mustOwn = (e: RawEntity) => {
      if (e.owner !== sender) throw err('NOT_OWNER', `entity ${e.key} is owned by ${e.owner}, not ${sender}`);
    };

    for (const spec of ops.creates ?? []) {
      validateCreate(spec);
      const nonce = s.nonces[sender] ?? 0;
      const key = mockEntityKey(sender, nonce, spec.salt ?? randomSalt());
      if (s.entities[key]) throw err('INVALID_INPUT', 'entity key collision (salt reused)');
      s.nonces[sender] = nonce + 1;
      s.entities[key] = {
        key,
        owner: sender,
        creator: sender,
        createdAt: now,
        expiresAt: now + lifetimeSeconds(spec.expiresInSeconds),
        readonly: spec.readonly,
        permissionlessExtension: spec.permissionlessExtension,
        attributes: Object.fromEntries(Object.entries(spec.attributes).map(([n, v]) => [n, { ...v }])),
        payload: spec.payload,
        contentType: 'application/json',
      };
      created.push(key);
      events.push({ kind: 'created', key, owner: sender });
    }
    for (const p of ops.patches ?? []) {
      const e = live(p.key);
      mustOwn(e);
      if (e.readonly) throw err('NOT_OWNER', `entity ${e.key} was created readonly, so its contents can never change`);
      if (Object.keys(p.set).length === 0) throw err('INVALID_INPUT', 'empty patch');
      validateAttrs(p.set);
      const attributes = { ...e.attributes };
      for (const [n, v] of Object.entries(p.set)) attributes[n] = { ...v };
      s.entities[e.key] = { ...e, attributes };
      events.push({ kind: 'patched', key: e.key, owner: e.owner });
    }
    for (const k of ops.deletes ?? []) {
      const e = live(k);
      mustOwn(e);
      delete s.entities[e.key];
      events.push({ kind: 'deleted', key: e.key, owner: e.owner });
    }
    for (const x of ops.extensions ?? []) {
      const e = live(x.key);
      if (e.owner !== sender && !e.permissionlessExtension) {
        throw err('NOT_OWNER', `entity ${e.key} is owned by ${e.owner}, not ${sender}`);
      }
      const expiresAt = now + lifetimeSeconds(x.seconds);
      if (expiresAt <= e.expiresAt) throw err('INVALID_INPUT', `entity ${e.key} already expires later (ExpiryNotExtended)`);
      s.entities[e.key] = { ...e, expiresAt };
      events.push({ kind: 'extended', key: e.key, owner: e.owner });
    }
    for (const t of ops.transfers ?? []) {
      if (this.rejectSameBatchTransfer && created.includes(t.key.toLowerCase() as EntityKey)) {
        throw err('BATCH_FAILED', 'simulated: transfer of an entity created in the same batch rejected');
      }
      const e = live(t.key);
      mustOwn(e);
      const to = t.to.toLowerCase() as Address;
      if (to === ZERO) throw err('INVALID_INPUT', 'transfer to zero address');
      if (to === e.owner) throw err('INVALID_INPUT', 'transfer to self');
      s.entities[e.key] = { ...e, owner: to };
      events.push({ kind: 'transferred', key: e.key, owner: e.owner, newOwner: to });
    }
    return created;
  }

  /** Drops entities that expired more than a day ago (keeps storage bounded). */
  private pruneExpired() {
    const cutoff = this.now() - 86_400;
    for (const [k, e] of Object.entries(this.state.entities)) if (e.expiresAt < cutoff) delete this.state.entities[k];
  }

  // ---------------------------------------------------------------- cross-tab

  private listenForOtherTabs(): (() => void) | undefined {
    const g = globalThis as {
      addEventListener?: (t: string, cb: (e: { key: string | null; newValue: string | null }) => void) => void;
      removeEventListener?: (t: string, cb: (e: { key: string | null; newValue: string | null }) => void) => void;
    };
    if (typeof g.addEventListener !== 'function') return undefined;
    const onStorage = (e: { key: string | null; newValue: string | null }) => {
      if (e.key !== this.storageKey) return;
      const before = this.state;
      if (e.newValue === null) this.state = emptyState();
      else {
        try {
          this.state = JSON.parse(e.newValue, reviver) as State;
        } catch {
          return;
        }
      }
      this.emit(diff(before, this.state));
    };
    g.addEventListener('storage', onStorage);
    return () => g.removeEventListener?.('storage', onStorage);
  }

  // ---------------------------------------------------------------- port

  /** An ArkivPort acting as whichever address `getAddress` returns. `gate` delays all I/O until it settles. */
  port(getAddress: () => Address | null, gate: () => Promise<void> = () => Promise.resolve()): ArkivPort {
    const queue = createWriteQueue();
    const chain = this;
    const writerFor = (address: Address): Writer => ({
      address,
      predictKeys: async (n) => chain.predictKeys(address, n),
      create: async (spec: CreateSpec) => {
        const r = await chain.commit(address, { creates: [spec] });
        return { key: r.created[0] as EntityKey, txHash: r.txHash };
      },
      patch: async (key, set) => ({ txHash: (await chain.commit(address, { patches: [{ key, set }] })).txHash }),
      extend: async (key, seconds) => ({ txHash: (await chain.commit(address, { extensions: [{ key, seconds }] })).txHash }),
      transfer: async (key, to) => ({ txHash: (await chain.commit(address, { transfers: [{ key, to }] })).txHash }),
      remove: async (key) => ({ txHash: (await chain.commit(address, { deletes: [key] })).txHash }),
      batch: (ops) => chain.commit(address, ops),
    });
    return {
      get address() {
        return getAddress();
      },
      now: () => chain.now(),
      query: async (q) => {
        await gate();
        return chain.query(q);
      },
      get: async (key) => {
        await gate();
        return chain.get(key);
      },
      at: async () => {
        throw err('UNKNOWN', 'not implemented: historical (atBlock) reads are not simulated by the mock');
      },
      write: async (fn) => {
        await gate();
        const address = getAddress();
        if (!address) throw err('NO_SIGNER', 'Read-only mode: no wallet configured');
        return queue(() => fn(writerFor(address)));
      },
      watch: (cb) => chain.subscribe(cb),
      balance: async () => MOCK_BALANCE,
      blockNumber: async () => BigInt(Math.floor(chain.now() / 2)),
    };
  }
}

function matches(e: RawEntity, p: Predicate): boolean {
  if (p.op === 'or') return p.preds.some((q) => matches(e, q));
  const a =
    p.name === '$key'
      ? { type: 'key', value: e.key }
      : p.name === '$owner'
        ? { type: 'addr', value: e.owner }
        : p.name === '$creator'
          ? { type: 'addr', value: e.creator }
          : e.attributes[p.name];
  // Like the engine: a typed comparison never matches a differently-typed attribute.
  if (!a || a.type !== p.value.type) return false;
  const left = typeof a.value === 'string' ? a.value.toLowerCase() : a.value;
  const right = typeof p.value.value === 'string' ? p.value.value.toLowerCase() : p.value.value;
  switch (p.op) {
    case 'eq':
      return left === right;
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
  }
}

function validateAttrs(attrs: CreateSpec['attributes']) {
  const names = Object.keys(attrs);
  if (names.length > MAX_ATTRS) throw err('INVALID_INPUT', `more than ${MAX_ATTRS} attributes`);
  for (const n of names) {
    if (!ATTR_NAME.test(n) || n.includes('--') || n.length > 32 || RESERVED.has(n.toLowerCase())) {
      throw err('INVALID_INPUT', `invalid attribute name "${n}"`);
    }
    const v = attrs[n];
    if (v?.type === 'str' && new TextEncoder().encode(v.value).length > MAX_STR_BYTES) {
      throw err('INVALID_INPUT', `attribute "${n}" exceeds ${MAX_STR_BYTES} bytes`);
    }
  }
}

function validateCreate(spec: CreateSpec) {
  validateAttrs(spec.attributes);
  if (new TextEncoder().encode(spec.payload).length > MAX_PAYLOAD_BYTES) throw err('INVALID_INPUT', 'payload too large');
  if (!(spec.expiresInSeconds > 0)) throw err('INVALID_INPUT', 'expiry must be in the future');
}

function structuredCloneEntity(e: RawEntity): RawEntity {
  return { ...e, attributes: Object.fromEntries(Object.entries(e.attributes).map(([n, v]) => [n, { ...v }])) };
}

/** Events that turn `a` into `b` (cross-tab sync). */
function diff(a: State, b: State): RawEvent[] {
  const out: RawEvent[] = [];
  for (const [k, e] of Object.entries(b.entities)) {
    const key = k as EntityKey;
    const old = a.entities[k];
    if (!old) {
      out.push({ kind: 'created', key, owner: e.owner });
      continue;
    }
    if (JSON.stringify(old.attributes, replacer) !== JSON.stringify(e.attributes, replacer)) {
      out.push({ kind: 'patched', key, owner: e.owner });
    }
    if (old.expiresAt !== e.expiresAt) out.push({ kind: 'extended', key, owner: e.owner });
    if (old.owner !== e.owner) out.push({ kind: 'transferred', key, owner: old.owner, newOwner: e.owner });
  }
  for (const [k, e] of Object.entries(a.entities)) {
    if (!b.entities[k]) out.push({ kind: 'deleted', key: k as EntityKey, owner: e.owner });
  }
  return out;
}
