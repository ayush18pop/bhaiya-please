/**
 * The internal primitive surface services depend on. Implemented by the real SDK adapter
 * (adapter.ts) and by the in-memory fake (mock/chain.ts), so services behave identically on both.
 * No SDK types cross this boundary.
 */
import type { Address, EntityKey, Hex, TxHash, UnixSeconds } from '../types';

/** Attribute types we write. Readers may see others (hostile writers), see RawAttr. */
export type AttrValue =
  | { type: 'str'; value: string }
  | { type: 'i32'; value: number }
  | { type: 'u64'; value: bigint }
  | { type: 'addr'; value: Address }
  | { type: 'key'; value: EntityKey }
  | { type: 'bytes32'; value: Hex };

export type AttrType = AttrValue['type'];
export type AttrMap = Record<string, AttrValue>;

/** An attribute as read from chain: any type tag, any primitive value. Validated by the codec. */
export interface RawAttr {
  type: string;
  value: string | number | bigint | boolean;
}

export interface RawEntity {
  key: EntityKey;
  /** Lowercased. */
  owner: Address;
  /** Lowercased. */
  creator: Address;
  createdAt: UnixSeconds;
  expiresAt: UnixSeconds;
  readonly: boolean;
  permissionlessExtension: boolean;
  attributes: Record<string, RawAttr>;
  /** Payload decoded as UTF-8 (empty string if none). */
  payload: string;
  contentType: string;
}

export type RangeOp = 'gt' | 'gte' | 'lt' | 'lte';

export type Predicate =
  | { op: 'eq'; name: string; value: AttrValue }
  | { op: RangeOp; name: string; value: Extract<AttrValue, { type: 'i32' | 'u64' }> }
  | { op: 'or'; preds: Predicate[] };

/** All fields AND-ed. `where` must be non-empty (the chain has no match-all query). */
export interface QueryAst {
  where: Predicate[];
  owner?: Address;
  creator?: Address;
}

export interface CreateSpec {
  attributes: AttrMap;
  /** JSON text. */
  payload: string;
  readonly: boolean;
  permissionlessExtension: boolean;
  /** Lifetime from now. Adapters round up to a whole number of 2 s blocks. */
  expiresInSeconds: number;
  /** From predictKeys; omit for a random salt. */
  salt?: bigint;
}

export interface BatchOps {
  creates?: CreateSpec[];
  patches?: { key: EntityKey; set: AttrMap }[];
  deletes?: EntityKey[];
  extensions?: { key: EntityKey; seconds: number }[];
  transfers?: { key: EntityKey; to: Address }[];
}

export interface PredictedKey {
  key: EntityKey;
  salt: bigint;
}

/** Writes. Only reachable inside ArkivPort.write(), which serializes them per wallet. */
export interface Writer {
  readonly address: Address;
  predictKeys(count: number): Promise<PredictedKey[]>;
  create(spec: CreateSpec): Promise<{ key: EntityKey; txHash: TxHash }>;
  patch(key: EntityKey, set: AttrMap): Promise<{ txHash: TxHash }>;
  extend(key: EntityKey, seconds: number): Promise<{ txHash: TxHash }>;
  transfer(key: EntityKey, to: Address): Promise<{ txHash: TxHash }>;
  remove(key: EntityKey): Promise<{ txHash: TxHash }>;
  /** Atomic. Applied in order creates → patches → deletes → extensions → transfers. */
  batch(ops: BatchOps): Promise<{ txHash: TxHash; created: EntityKey[] }>;
}

export type RawEventKind = 'created' | 'patched' | 'extended' | 'transferred' | 'deleted';

export interface RawEvent {
  kind: RawEventKind;
  key: EntityKey;
  owner?: Address;
  newOwner?: Address;
}

export interface ReadPort {
  /** Current time as this port sees it (unix seconds). At a past block: that block's time. */
  now(): UnixSeconds;
  /** All live matches (adapter paginates). */
  query(q: QueryAst): Promise<RawEntity[]>;
  /** Null if missing or expired. */
  get(key: EntityKey): Promise<RawEntity | null>;
}

export interface ArkivPort extends ReadPort {
  /** Active wallet, lowercased; null when read-only. May change (mock dev.setAddress). */
  readonly address: Address | null;
  /** Read view at a historical block. Throws UNKNOWN where unsupported (mock). */
  at(block: bigint): Promise<ReadPort>;
  /** Runs `fn` holding the wallet's write slot: one in-flight tx per wallet. Throws NO_SIGNER if read-only. */
  write<T>(fn: (w: Writer) => Promise<T>): Promise<T>;
  watch(onEvent: (e: RawEvent) => void): () => void;
  balance(address: Address): Promise<bigint>;
  blockNumber(): Promise<bigint>;
}

/** Lifetimes are whole 2 s blocks (the SDK rejects fractions); both adapters round up the same way. */
export function lifetimeSeconds(seconds: number): number {
  return Math.max(2, Math.ceil(seconds / 2) * 2);
}
