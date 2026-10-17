/**
 * THE ONLY file importing @arkiv-network/sdk. Implements ArkivPort over SDK 0.8.1:
 *   - query AST → SDK expressions (escaping/typing lives in the SDK constructors)
 *   - block numbers → unix seconds via arkiv_getBlockTiming (cached 30 s)
 *   - serialized write queue (one in-flight tx per wallet) + viem nonceManager
 *   - bounded retry with backoff on transport / rate-limit errors only; never after broadcast,
 *     never on engine rejections
 *   - access key sent as the X-API-KEY header (never in the URL, so it cannot leak through
 *     error messages that echo the request URL); paginated walks pinned to one block
 *   - every error leaves as BhaiyaPleaseError
 */
import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import type { FullEntity, WalletArkivClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { addr, bytes32, i32, key, str, u64 } from '@arkiv-network/sdk/attr';
import type { AttributeInputs, ValueInput } from '@arkiv-network/sdk/attr';
import { eq, gt, gte, lt, lte, or } from '@arkiv-network/sdk/query';
import type { Expression } from '@arkiv-network/sdk/query';
import { bytesToString, custom, http, stringToBytes } from 'viem';
import type { Chain, EIP1193Provider } from 'viem';
import { nonceManager, privateKeyToAccount } from 'viem/accounts';
import { BhaiyaPleaseError } from '../types';
import type { Address, BhaiyaPleaseConfig, EntityKey, Hex, TxHash, UnixSeconds } from '../types';
import { classify, toBhaiyaError } from './errors';
import type {
  ArkivPort,
  AttrMap,
  AttrValue,
  CreateSpec,
  Predicate,
  QueryAst,
  RawAttr,
  RawEntity,
  RawEvent,
  ReadPort,
  Writer,
} from './port';
import { lifetimeSeconds } from './port';
import { createWriteQueue } from './queue';

export const DEFAULT_RPC_URL = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network';
/** Safety cap on a single paginated query (200 per page). */
const MAX_QUERY_RESULTS = 2000;
const READ_ATTEMPTS = 3;
const WRITE_ATTEMPTS = 3;
const TIMING_TTL_MS = 30_000;

/**
 * Access key appended as a path segment: "<rpc>/<KEY>". Works on Tiramisu (spike, 16 Oct), but the
 * adapter uses the X-API-KEY header instead (see rpcTransport). Kept for scripts/tests.
 */
export function rpcUrlWithKey(rpcUrl: string, accessKey?: string): string {
  const base = rpcUrl.replace(/\/+$/, '');
  return accessKey ? `${base}/${encodeURIComponent(accessKey)}` : base;
}

/**
 * HTTP transport with the access key in the X-API-KEY header (verified 16 Oct: 200 with key, 401
 * INVALID_KEY with a wrong key; CORS preflight allows X-Api-Key from any origin). Header rather
 * than URL path because viem error messages print the request URL.
 */
export function rpcTransport(rpcUrl: string, accessKey?: string) {
  const base = rpcUrl.replace(/\/+$/, '');
  // retryCount 0: the adapter owns retries (retryRead / retryWrite). viem's own retries stacked on
  // top multiplied every failing read several times over, which burned the RPC quota.
  return accessKey ? http(base, { retryCount: 0, fetchOptions: { headers: { 'X-API-KEY': accessKey } } }) : http(base, { retryCount: 0 });
}

/** After the keyed quota runs out, read anonymously for this long before trying the key again. */
const KEY_FALLBACK_MS = 15 * 60_000;
/** After every read path is out of quota, fail reads locally (no network) for this long. */
const QUOTA_BREAKER_MS = 60_000;

const lowerHex = <T extends Hex>(v: string): T => v.toLowerCase() as T;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const backoff = (attempt: number) => 400 * 2 ** attempt + Math.floor(Math.random() * 200);

function toSdkValue(v: AttrValue): ValueInput {
  switch (v.type) {
    case 'str':
      return str(v.value);
    case 'i32':
      return i32(v.value);
    case 'u64':
      return u64(v.value);
    case 'addr':
      return addr(v.value);
    case 'key':
      return key(v.value);
    case 'bytes32':
      return bytes32(v.value);
  }
}

function toSdkAttrs(m: AttrMap): AttributeInputs {
  const out: Record<string, ValueInput> = {};
  for (const [name, v] of Object.entries(m)) out[name] = toSdkValue(v);
  return out;
}

function toExpr(p: Predicate): Expression {
  switch (p.op) {
    case 'eq':
      return eq(p.name, toSdkValue(p.value));
    case 'gt':
      return gt(p.name, toSdkValue(p.value));
    case 'gte':
      return gte(p.name, toSdkValue(p.value));
    case 'lt':
      return lt(p.name, toSdkValue(p.value));
    case 'lte':
      return lte(p.name, toSdkValue(p.value));
    case 'or':
      return or(p.preds.map(toExpr));
  }
}

function lifetime(seconds: number) {
  return ExpirationTime.fromSeconds(lifetimeSeconds(seconds));
}

function toSdkCreate(spec: CreateSpec) {
  return {
    payload: stringToBytes(spec.payload),
    contentType: 'application/json',
    attributes: toSdkAttrs(spec.attributes),
    flags: { readonly: spec.readonly, permissionlessExtension: spec.permissionlessExtension },
    expires: lifetime(spec.expiresInSeconds),
    ...(spec.salt !== undefined ? { salt: spec.salt } : {}),
  };
}

interface Timing {
  block: bigint;
  time: number;
  duration: number;
  fetchedAt: number;
}

export async function createArkivAdapter(config: BhaiyaPleaseConfig): Promise<ArkivPort> {
  const transport = () => rpcTransport(config.rpcUrl || DEFAULT_RPC_URL, config.accessKey);
  const chain: Chain = config.chainId && config.chainId !== tiramisu.id ? { ...tiramisu, id: config.chainId } : tiramisu;
  const keyed = createPublicClient({ chain, transport: transport() });
  const anon = config.accessKey ? createPublicClient({ chain, transport: rpcTransport(config.rpcUrl || DEFAULT_RPC_URL) }) : keyed;
  // Reads go through `pub`: the keyed client normally, the anonymous one while the key's quota is out.
  let pub = keyed;
  let anonUntil = 0;
  let breakerUntil = 0;
  const report = (op: string, err: unknown) => config.onSdkError?.(op, err);

  async function retryRead<T>(op: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (now < breakerUntil) {
      throw new BhaiyaPleaseError('QUOTA_EXHAUSTED', `${op}: the network's read quota is used up; paused for ${Math.ceil((breakerUntil - now) / 1000)} s`, { retryable: false });
    }
    if (pub === anon && anon !== keyed && now >= anonUntil) pub = keyed; // try the key again
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        report(op, err);
        const c = classify(err);
        if (c.code === 'QUOTA_EXHAUSTED') {
          if (pub === keyed && anon !== keyed) {
            // Key quota gone: fall back to the anonymous budget and retry this read there once.
            pub = anon;
            anonUntil = Date.now() + KEY_FALLBACK_MS;
            continue;
          }
          breakerUntil = Date.now() + QUOTA_BREAKER_MS;
          throw toBhaiyaError(op, err, c);
        }
        if (c.retry !== 'transport' || attempt >= READ_ATTEMPTS - 1) throw toBhaiyaError(op, err, c);
        await sleep(backoff(attempt));
      }
    }
  }

  let timing: Timing | null = null;
  async function getTiming(): Promise<Timing> {
    if (timing && Date.now() - timing.fetchedAt < TIMING_TTL_MS) return timing;
    try {
      const t = await retryRead('getBlockTiming', () => pub.getBlockTiming());
      // Observed on Tiramisu (16 Oct): currentBlockTime in unix seconds, blockDuration 2. Tolerate ms anyway.
      const time = t.currentBlockTime > 1e11 ? t.currentBlockTime / 1000 : t.currentBlockTime;
      const duration = t.blockDuration >= 100 ? t.blockDuration / 1000 : t.blockDuration || 2;
      timing = { block: t.currentBlock, time, duration, fetchedAt: Date.now() };
    } catch {
      const block = await retryRead('getBlockNumber', () => pub.getBlockNumber());
      timing = { block, time: Date.now() / 1000, duration: 2, fetchedAt: Date.now() };
    }
    return timing;
  }
  const unixOf = (t: Timing, block: bigint): UnixSeconds =>
    Math.round(t.time + Number(block - t.block) * t.duration);

  function toRaw(e: FullEntity, t: Timing): RawEntity {
    const attributes: Record<string, RawAttr> = {};
    for (const [name, v] of Object.entries(e.attributes)) {
      const value = typeof v.value === 'string' && /^0x/i.test(v.value) ? v.value.toLowerCase() : v.value;
      attributes[name] = { type: v.type, value };
    }
    let payload = '';
    try {
      payload = bytesToString(e.payload);
    } catch {
      payload = '';
    }
    return {
      key: lowerHex(e.key),
      owner: lowerHex(e.owner),
      creator: lowerHex(e.creator),
      createdAt: unixOf(t, e.createdAt),
      expiresAt: unixOf(t, e.expiresAt),
      readonly: e.creationFlags.readonly,
      permissionlessExtension: e.creationFlags.permissionlessExtension,
      attributes,
      payload,
      contentType: e.contentType,
    };
  }

  const isCursorError = (err: unknown) =>
    !!err && typeof err === 'object' && (err as { name?: unknown; kind?: unknown }).name === 'QueryError' &&
    (err as { kind?: unknown }).kind === 'cursor';

  async function runQuery(q: QueryAst, atBlock?: bigint): Promise<RawEntity[]> {
    if (q.where.length === 0) throw new BhaiyaPleaseError('INVALID_INPUT', 'query needs at least one predicate');
    const build = (block?: bigint) => {
      const b = pub.select('*').where(q.where.map(toExpr)).limit(200);
      if (q.owner) b.ownedBy(q.owner);
      if (q.creator) b.createdBy(q.creator);
      if (block !== undefined) b.atBlock(block);
      return b;
    };
    let page = await retryRead('query', () => build(atBlock).fetch());
    // Single page (the common case): done. Otherwise walk every page at ONE block: an unpinned
    // cursor can be rejected (-32005) once the head moves, and mixing blocks gives an inconsistent set.
    let pinned = atBlock;
    let rows: FullEntity[] = [...page.entities];
    for (let restarts = 0; page.hasNextPage() && rows.length < MAX_QUERY_RESULTS; ) {
      try {
        if (pinned === undefined) {
          pinned = page.blockNumber;
          page = await retryRead('query', () => build(pinned).fetch());
          rows = [...page.entities];
          continue;
        }
        const current = page;
        page = await retryRead('query.next', () => current.next());
        rows.push(...page.entities);
      } catch (err) {
        // Cursor expired: discard the partial walk and restart once at a fresh head (current-state
        // reads only; a historical read keeps its block and surfaces the error).
        if (!isCursorError((err as { cause?: unknown }).cause ?? err) || atBlock !== undefined || restarts++ > 0) throw err;
        pinned = undefined;
        page = await retryRead('query', () => build().fetch());
        rows = [...page.entities];
      }
    }
    if (page.hasNextPage()) {
      report('query', new Error(`query truncated at ${rows.length} results (cap ${MAX_QUERY_RESULTS}); result is incomplete`));
    }
    const t = await getTiming();
    return rows.map((e) => toRaw(e, t));
  }

  async function getOne(k: EntityKey, atBlock?: bigint): Promise<RawEntity | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
    const rows = await runQuery({ where: [{ op: 'eq', name: '$key', value: { type: 'key', value: k } }] }, atBlock);
    return rows[0] ?? null;
  }

  const wallet = await createWallet(config, chain, transport);
  const address = wallet ? lowerHex<Address>(wallet.account.address) : null;
  const queue = createWriteQueue();

  async function retryWrite<T>(op: string, fn: () => Promise<T>): Promise<T> {
    let nonceRetried = false;
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        report(op, err);
        const c = classify(err);
        const canRetry =
          !c.broadcast &&
          attempt < WRITE_ATTEMPTS - 1 &&
          (c.retry === 'transport' || (c.retry === 'nonce' && !nonceRetried));
        if (!canRetry) throw toBhaiyaError(op, err, c);
        if (c.retry === 'nonce') {
          nonceRetried = true;
          wallet?.account.nonceManager?.reset({ address: wallet.account.address, chainId: chain.id });
        }
        await sleep(backoff(attempt));
      }
    }
  }

  const writer: Writer | null = wallet && address
    ? {
        address,
        async predictKeys(count) {
          const keys = await retryRead('predictEntityKeys', () => pub.predictEntityKeys({ owner: address, count }));
          return keys.map((p) => ({ key: lowerHex<EntityKey>(p.key), salt: p.salt }));
        },
        async create(spec) {
          const r = await retryWrite('createEntity', () => wallet.createEntity(toSdkCreate(spec)));
          return { key: lowerHex<EntityKey>(r.entityKey), txHash: r.txHash as TxHash };
        },
        async patch(k, set) {
          const r = await retryWrite('patchEntity', () => wallet.patchEntity({ entityKey: k, set: toSdkAttrs(set) }));
          return { txHash: r.txHash as TxHash };
        },
        async extend(k, seconds) {
          const r = await retryWrite('extendEntity', () => wallet.extendEntity({ entityKey: k, expires: lifetime(seconds) }));
          return { txHash: r.txHash as TxHash };
        },
        async transfer(k, to) {
          const r = await retryWrite('changeOwnership', () => wallet.changeOwnership({ entityKey: k, newOwner: to }));
          return { txHash: r.txHash as TxHash };
        },
        async remove(k) {
          const r = await retryWrite('deleteEntity', () => wallet.deleteEntity({ entityKey: k }));
          return { txHash: r.txHash as TxHash };
        },
        async batch(ops) {
          const r = await retryWrite('executeBatch', () =>
            wallet.executeBatch({
              creates: (ops.creates ?? []).map(toSdkCreate),
              patches: (ops.patches ?? []).map((p) => ({ entityKey: p.key, set: toSdkAttrs(p.set) })),
              deletes: (ops.deletes ?? []).map((k) => ({ entityKey: k })),
              extensions: (ops.extensions ?? []).map((x) => ({ entityKey: x.key, expires: lifetime(x.seconds) })),
              ownershipChanges: (ops.transfers ?? []).map((x) => ({ entityKey: x.key, newOwner: x.to })),
            }),
          );
          return { txHash: r.txHash as TxHash, created: r.createdEntities.map((k) => lowerHex<EntityKey>(k)) };
        },
      }
    : null;

  const port: ArkivPort = {
    address,
    now: () => Math.floor(Date.now() / 1000),
    query: (q) => runQuery(q),
    get: (k) => getOne(k),
    async at(block): Promise<ReadPort> {
      const t = await getTiming();
      const time = unixOf(t, block);
      return { now: () => time, query: (q) => runQuery(q, block), get: (k) => getOne(k, block) };
    },
    write(fn) {
      if (!writer) return Promise.reject(new BhaiyaPleaseError('NO_SIGNER', 'Read-only mode: no wallet configured'));
      return queue(() => fn(writer));
    },
    watch(onEvent: (e: RawEvent) => void) {
      return pub.watchEntityEvents({
        pollingInterval: config.pollIntervalMs ?? 2000,
        onError: (err) => report('watchEntityEvents', err),
        onEntityCreated: (e) => onEvent({ kind: 'created', key: lowerHex(e.entityKey), owner: lowerHex(e.owner) }),
        onEntityPatched: (e) => onEvent({ kind: 'patched', key: lowerHex(e.entityKey), owner: lowerHex(e.owner) }),
        onExpiryExtended: (e) => onEvent({ kind: 'extended', key: lowerHex(e.entityKey), owner: lowerHex(e.owner) }),
        onOwnershipTransferred: (e) =>
          onEvent({
            kind: 'transferred',
            key: lowerHex(e.entityKey),
            owner: lowerHex(e.previousOwner),
            newOwner: lowerHex(e.newOwner),
          }),
        onEntityDeleted: (e) => onEvent({ kind: 'deleted', key: lowerHex(e.entityKey), owner: lowerHex(e.owner) }),
      });
    },
    balance: (a) => retryRead('getBalance', () => pub.getBalance({ address: a })),
    blockNumber: () => retryRead('getBlockNumber', () => pub.getBlockNumber()),
  };
  return port;
}

type ChainLike = Chain;

async function createWallet(config: BhaiyaPleaseConfig, chain: ChainLike, transport: () => ReturnType<typeof http>) {
  const signer = config.signer;
  if (signer.kind === 'none') return null;
  if (signer.kind === 'privateKey') {
    const account = privateKeyToAccount(signer.privateKey, { nonceManager });
    return createWalletClient({ chain, transport: transport(), account }) as WalletArkivClient<
      ReturnType<typeof http>,
      ChainLike,
      typeof account
    >;
  }
  // [verify on chain] injected wallets must be switched to Tiramisu by the user.
  const provider = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new BhaiyaPleaseError('NO_SIGNER', 'No injected wallet (window.ethereum) found');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const first = accounts[0];
  if (!first) throw new BhaiyaPleaseError('NO_SIGNER', 'Injected wallet returned no accounts');
  const account = jsonRpcAccount(first);
  return createWalletClient({ chain, transport: custom(provider), account }) as unknown as WalletArkivClient<
    ReturnType<typeof http>,
    ChainLike,
    ReturnType<typeof privateKeyToAccount>
  >;
}

/** JSON-RPC account shape for injected wallets; nonceManager absent (wallet manages nonces). */
function jsonRpcAccount(address: Address) {
  return { address, type: 'json-rpc' as const };
}
