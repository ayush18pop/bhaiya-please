/**
 * Tiramisu spike: exercises every risky Arkiv primitive Bhaiya Please relies on and prints a
 * PASS / FAIL / SKIP table. Reads SEED_PRIVATE_KEY (+ optional VERIFIER_PRIVATE_KEY as the second
 * wallet) and ARKIV_RPC_URL / ARKIV_ACCESS_KEY from the repo-root .env.
 * Never prints private keys or the access key. Spike entities use type=spike and expire in ~15 min.
 *
 *   pnpm --filter @bhaiya-please/spike spike
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, ExpirationTime, jsonToPayload } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { addr, bytes32, i32, key, str, u64 } from '@arkiv-network/sdk/attr';
import { eq, gt, gte, lt, ne } from '@arkiv-network/sdk/query';
import type { Expression } from '@arkiv-network/sdk/query';
import { formatEther, http, keccak256, stringToHex } from 'viem';
import type { Hex } from 'viem';
import { nonceManager, privateKeyToAccount } from 'viem/accounts';

// ------------------------------------------------------------------ env

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_PATH = resolve(ROOT, '.env');

function loadEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnv(), ...pickProcessEnv() };
function pickProcessEnv(): Record<string, string> {
  const keys = ['SEED_PRIVATE_KEY', 'VERIFIER_PRIVATE_KEY', 'ARKIV_RPC_URL', 'ARKIV_ACCESS_KEY'];
  return Object.fromEntries(keys.flatMap((k) => (process.env[k] ? [[k, process.env[k] as string]] : [])));
}

const isKey = (k: string | undefined): k is Hex => !!k && /^0x[0-9a-fA-F]{64}$/.test(k);

if (!isKey(env.SEED_PRIVATE_KEY)) {
  console.error(
    [
      '',
      'Spike needs a funded Tiramisu test key, and none was found.',
      '',
      `  1. cp .env.example .env            (repo root: ${ROOT})`,
      '  2. Generate a burner key, e.g.  node -e "console.log(require(\'viem/accounts\').generatePrivateKey())"',
      '  3. Put it in .env as SEED_PRIVATE_KEY=0x... (optional second wallet: VERIFIER_PRIVATE_KEY=0x...)',
      '  4. Fund the address at https://hub.arkiv.network/faucet',
      '  5. Optional: ARKIV_ACCESS_KEY=<key from hub.arkiv.network>',
      '  6. pnpm --filter @bhaiya-please/spike spike',
      '',
      existsSync(ENV_PATH) ? '(.env exists but SEED_PRIVATE_KEY is missing or not 0x + 64 hex)' : '(.env not found)',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const BASE_RPC = (env.ARKIV_RPC_URL || 'https://rpc.tiramisu.db-chain.testnet.arkiv.network').replace(/\/+$/, '');
const ACCESS_KEY = env.ARKIV_ACCESS_KEY || '';
const SECRETS = [env.SEED_PRIVATE_KEY, env.VERIFIER_PRIVATE_KEY, ACCESS_KEY].filter((s): s is string => !!s && s.length > 4);

/** Scrub anything secret from text we print (SDK/viem errors include request URLs). */
function redact(text: string): string {
  let t = text;
  for (const s of SECRETS) t = t.split(s).join('***').split(s.toLowerCase()).join('***');
  return t;
}

// ------------------------------------------------------------------ results

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'INFO';
const results: { name: string; status: Status; detail: string }[] = [];
const record = (name: string, status: Status, detail = '') => {
  results.push({ name, status, detail: redact(detail) });
  console.log(`${status.padEnd(4)}  ${name}${detail ? ` — ${redact(detail)}` : ''}`);
};
const errText = (e: unknown): string => {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === 'object'; i++) {
    const x = cur as { name?: string; shortMessage?: string; message?: string; cause?: unknown };
    parts.push(`${x.name ?? 'Error'}: ${(x.shortMessage ?? x.message ?? '').split('\n')[0]}`);
    cur = x.cause;
  }
  return parts.join(' <- ').slice(0, 400);
};
async function step(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await fn();
    record(name, 'PASS', detail ?? '');
    return true;
  } catch (e) {
    record(name, 'FAIL', errText(e));
    return false;
  }
}
async function expectReject(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    record(name, 'FAIL', 'expected a rejection, but the call succeeded');
  } catch (e) {
    record(name, 'PASS', `rejected as expected: ${errText(e)}`);
  }
}
const assert = (cond: unknown, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));

// ------------------------------------------------------------------ clients

const PROJECT = 'bhaiyaplease';
const SPIKE_RUN = `spike-${Date.now().toString(36)}`;
const TTL = ExpirationTime.fromMinutes(15);

function clients(url: string) {
  const pub = createPublicClient({ chain: tiramisu, transport: http(url) });
  const wallet = (k: Hex) =>
    createWalletClient({ chain: tiramisu, transport: http(url), account: privateKeyToAccount(k, { nonceManager }) });
  return { pub, wallet };
}

async function main() {
  console.log(`\nBhaiya Please Tiramisu spike  (${SPIKE_RUN})\n`);

  // 1. RPC + access-key URL format
  let rpc = BASE_RPC;
  const plain = clients(BASE_RPC);
  await step('rpc: default endpoint reachable (getBlockNumber)', async () => `head ${await plain.pub.getBlockNumber()}`);
  if (ACCESS_KEY) {
    const suffixed = `${BASE_RPC}/${ACCESS_KEY}`;
    const ok = await step('access key: appended as URL path segment works', async () => {
      const c = clients(suffixed);
      return `head ${await c.pub.getBlockNumber()} via <rpc>/<key>`;
    });
    if (ok) rpc = suffixed;
    else {
      await step('access key: Authorization header alternative', async () => {
        const pub = createPublicClient({
          chain: tiramisu,
          transport: http(BASE_RPC, { fetchOptions: { headers: { Authorization: `Bearer ${ACCESS_KEY}` } } }),
        });
        return `head ${await pub.getBlockNumber()} via header`;
      });
    }
    record('access key: browser CORS', 'INFO', 'not testable from Node; check from the deployed web build');
  } else {
    record('access key: URL format', 'SKIP', 'ARKIV_ACCESS_KEY not set');
  }

  const { pub, wallet } = clients(rpc);
  const A = wallet(env.SEED_PRIVATE_KEY as Hex);
  const B = isKey(env.VERIFIER_PRIVATE_KEY) ? wallet(env.VERIFIER_PRIVATE_KEY) : null;
  const a = A.account.address;
  const b = B?.account.address ?? null;
  console.log(`\nwallet A ${a}${b ? `\nwallet B ${b}` : '\nwallet B (none: set VERIFIER_PRIVATE_KEY for 2-wallet checks)'}\n`);

  const balA = await pub.getBalance({ address: a });
  const balB = b ? await pub.getBalance({ address: b }) : 0n;
  record('balance A', balA > 0n ? 'PASS' : 'FAIL', `${formatEther(balA)} GLM${balA === 0n ? ' — fund at https://hub.arkiv.network/faucet' : ''}`);
  if (b) record('balance B', balB > 0n ? 'PASS' : 'FAIL', `${formatEther(balB)} GLM`);
  if (balA === 0n) return printTable();

  await step('getBlockTiming (units for block→unix conversion)', async () => {
    const t = await pub.getBlockTiming();
    return `currentBlock=${t.currentBlock} currentBlockTime=${t.currentBlockTime} (now=${Math.floor(Date.now() / 1000)}) blockDuration=${t.blockDuration}`;
  });

  // Watch everything from here on; we filter to our keys at the end.
  const events: { type: string; key: string; shape: string }[] = [];
  const ours = new Set<string>();
  const startBlock = await pub.getBlockNumber();
  const unwatch = pub.watchEntityEvents({
    fromBlock: startBlock,
    pollingInterval: 1000,
    onEvent: (e) => events.push({ type: e.type, key: e.entityKey.toLowerCase(), shape: json(e) }),
    onError: (e) => record('watchEntityEvents onError', 'INFO', errText(e)),
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const baseAttrs = { project: str(PROJECT), type: str('spike'), spike_run: str(SPIKE_RUN) };

  // 2. typed-attr create + query
  let mainKey: Hex | null = null;
  let mainTx: Hex | null = null;
  await step('create: typed attributes (str/u64/i32/addr/key/bytes32)', async () => {
    const r = await A.createEntity({
      payload: jsonToPayload({ hello: 'spike' }),
      contentType: 'application/json',
      attributes: {
        ...baseAttrs,
        eta: u64(now + 3600n),
        cap: i32(3),
        delta: i32(-5),
        who: addr(a),
        ref: key(keccak256(stringToHex('ref'))),
        h: bytes32(keccak256(stringToHex('h'))),
      },
      expires: TTL,
    });
    mainKey = r.entityKey;
    mainTx = r.txHash;
    ours.add(r.entityKey.toLowerCase());
    return `key ${r.entityKey} expiresAt(block) ${r.expiresAt}`;
  });
  if (!mainKey) return finish(unwatch, events, ours);
  const k = mainKey as Hex;

  await step('gas: cost of one create', async () => {
    const rc = await pub.getTransactionReceipt({ hash: mainTx as Hex });
    return `gasUsed ${rc.gasUsed} × ${rc.effectiveGasPrice} wei = ${formatEther(rc.gasUsed * rc.effectiveGasPrice)} GLM`;
  });

  await step('query: indexer visibility latency after receipt', async () => {
    const t0 = Date.now();
    for (;;) {
      const page = await pub.select({ key: true }).where(eq('spike_run', SPIKE_RUN)).fetch();
      if (page.entities.length > 0) return `${Date.now() - t0} ms`;
      if (Date.now() - t0 > 20_000) throw new Error('not visible after 20 s');
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  const count = async (...preds: Expression[]) =>
    (await pub.select({ key: true }).where(eq('spike_run', SPIKE_RUN), ...preds).fetch()).entities.length;
  await step('query: eq str', async () => assert((await count(eq('type', 'spike'))) >= 1, 'no match'));
  await step('query: range u64 (eta > now, eta < now)', async () => {
    assert((await count(gt('eta', u64(now)))) === 1, 'gt failed');
    assert((await count(lt('eta', u64(now)))) === 0, 'lt matched');
  });
  await step('query: range i32 incl. negative (cap >= 3, delta < 0)', async () => {
    assert((await count(gte('cap', i32(3)))) === 1, 'gte failed');
    assert((await count(gt('cap', i32(3)))) === 0, 'gt matched');
    assert((await count(lt('delta', i32(0)))) === 1, 'negative i32 range failed');
  });
  await step('query: typed mismatch (cap = u64(3)) matches nothing', async () => {
    const n = await count(eq('cap', u64(3n)));
    return n === 0 ? 'silently empty (as SDK_NOTES predicted)' : `matched ${n} (types are coerced!)`;
  });
  await step('query: $owner / $creator filters', async () => {
    const owned = await pub.select({ key: true }).where(eq('spike_run', SPIKE_RUN)).ownedBy(a).fetch();
    const created = await pub.select({ key: true }).where(eq('spike_run', SPIKE_RUN)).createdBy(a).fetch();
    assert(owned.entities.length >= 1 && created.entities.length >= 1, 'owner/creator filter empty');
  });
  await step('query: ne() / != (open Q2)', async () => {
    try {
      const n = await count(ne('cap', i32(1)));
      return `accepted by node, ${n} match(es)`;
    } catch (e) {
      return `rejected: ${errText(e)}`;
    }
  });
  await step('read: attribute value types', async () => {
    const e = await pub.getEntity(k);
    const at = e.attributes;
    return `eta:${typeof at.eta?.value} cap:${typeof at.cap?.value} who:${String(at.who?.value).slice(0, 10)} owner:${e.owner.slice(0, 10)} flags:${json(e.creationFlags)}`;
  });

  // 3. partial patch
  await step('patch: partial set leaves other attrs and expiry unchanged', async () => {
    const before = await pub.getEntity(k);
    await A.patchEntity({ entityKey: k, set: { cap: i32(2) } });
    const after = await pub.getEntity(k);
    assert(after.attributes.cap?.value === 2, 'cap not patched');
    assert(after.attributes.eta?.value === before.attributes.eta?.value, 'eta lost');
    assert(after.attributes.who !== undefined && after.attributes.spike_run !== undefined, 'other attrs dropped');
    return `expiresAt before ${before.expiresAt} after ${after.expiresAt}${before.expiresAt === after.expiresAt ? ' (unchanged)' : ' (CHANGED!)'}`;
  });

  // 4. readonly
  let roKey: Hex | null = null;
  await step('create: readonly entity', async () => {
    const r = await A.createEntity({ payload: jsonToPayload({}), contentType: 'application/json', attributes: baseAttrs, flags: { readonly: true }, expires: TTL });
    roKey = r.entityKey;
    ours.add(r.entityKey.toLowerCase());
  });
  if (roKey) {
    const ro = roKey as Hex;
    await expectReject('patch: readonly entity is rejected', () => A.patchEntity({ entityKey: ro, set: { cap: i32(1) } }));
    await step('extend: readonly entity by owner', async () => {
      const before = (await pub.getEntity(ro)).expiresAt;
      const r = await A.extendEntity({ entityKey: ro, expires: ExpirationTime.fromMinutes(30) });
      return `expiresAt ${before} → ${r.expiresAt}`;
    });
  }

  // 5. predictEntityKeys + salt
  await step('predictEntityKeys: predicted key == created key (with salt)', async () => {
    const [p] = await pub.predictEntityKeys({ owner: a, count: 1 });
    const r = await A.createEntity({ payload: jsonToPayload({}), contentType: 'application/json', attributes: baseAttrs, expires: TTL, salt: p.salt });
    ours.add(r.entityKey.toLowerCase());
    assert(r.entityKey.toLowerCase() === p.key.toLowerCase(), `predicted ${p.key}, got ${r.entityKey}`);
  });

  // 6. batch create + patch
  await step('executeBatch: create + patch (Accept + capacity)', async () => {
    const [p] = await pub.predictEntityKeys({ owner: a, count: 1 });
    const r = await A.executeBatch({
      creates: [{ payload: jsonToPayload({}), contentType: 'application/json', attributes: { ...baseAttrs, ref: key(k) }, expires: TTL, salt: p.salt }],
      patches: [{ entityKey: k, set: { cap: i32(1) } }],
    });
    ours.add(String(r.createdEntities[0]).toLowerCase());
    assert(r.createdEntities[0]?.toLowerCase() === p.key.toLowerCase(), 'created key differs from prediction');
    const e = await pub.getEntity(k);
    assert(e.attributes.cap?.value === 1, 'patch in batch not applied');
  });

  // 7. batch create + changeOwnership of the SAME new entity (Receipt flow, primary risk)
  const recipient = b ?? privateKeyToAccount(keccak256(stringToHex(`spike-recipient-${SPIKE_RUN}`))).address;
  let receiptKey: Hex | null = null;
  await step('executeBatch: create(readonly) + extend + changeOwnership of same new key', async () => {
    const [p] = await pub.predictEntityKeys({ owner: a, count: 1 });
    const r = await A.executeBatch({
      creates: [{ payload: jsonToPayload({ tags: ['on_time'] }), contentType: 'application/json', attributes: { ...baseAttrs, rider: addr(recipient) }, flags: { readonly: true }, expires: TTL, salt: p.salt }],
      extensions: roKey ? [{ entityKey: roKey, expires: ExpirationTime.fromMinutes(45) }] : [],
      ownershipChanges: [{ entityKey: p.key, newOwner: recipient }],
    });
    receiptKey = p.key;
    ours.add(p.key.toLowerCase());
    assert(r.createdEntities[0]?.toLowerCase() === p.key.toLowerCase(), 'created key differs from prediction');
    const e = await pub.getEntity(p.key);
    assert(e.owner.toLowerCase() === recipient.toLowerCase(), `owner is ${e.owner}`);
    assert(e.creator.toLowerCase() === a.toLowerCase(), `creator is ${e.creator}`);
    const byCreator = await pub.select({ key: true }).where(eq('spike_run', SPIKE_RUN)).createdBy(a).ownedBy(recipient).fetch();
    return `owner=recipient, creator=A, readonly=${e.creationFlags.readonly}; $creator+$owner query hits ${byCreator.entities.length}`;
  });
  if (!receiptKey) {
    await step('fallback: two-tx create then changeOwnership', async () => {
      const r = await A.createEntity({ payload: jsonToPayload({}), contentType: 'application/json', attributes: baseAttrs, flags: { readonly: true }, expires: TTL });
      ours.add(r.entityKey.toLowerCase());
      await A.changeOwnership({ entityKey: r.entityKey, newOwner: recipient });
      receiptKey = r.entityKey;
    });
  }

  // 8. permissionless extension from a second wallet
  if (B && balB > 0n) {
    let shopKey: Hex | null = null;
    await step('create: permissionlessExtension entity', async () => {
      const r = await A.createEntity({ payload: jsonToPayload({}), contentType: 'application/json', attributes: baseAttrs, flags: { permissionlessExtension: true }, expires: TTL });
      shopKey = r.entityKey;
      ours.add(r.entityKey.toLowerCase());
    });
    if (shopKey) {
      const sk = shopKey as Hex;
      await step('extend: permissionless entity by a stranger (wallet B)', async () => {
        const r = await B.extendEntity({ entityKey: sk, expires: ExpirationTime.fromMinutes(30) });
        const e = await pub.getEntity(sk);
        return `expiresAt → ${r.expiresAt}; owner still ${e.owner.toLowerCase() === a.toLowerCase() ? 'A' : e.owner}`;
      });
    }
    await expectReject('extend: non-permissionless entity by a stranger is rejected', () =>
      B.extendEntity({ entityKey: k, expires: ExpirationTime.fromMinutes(30) }),
    );
    if (receiptKey && b) {
      const rk = receiptKey as Hex;
      await step('extend: transferred readonly entity by its new owner (runner renews receipt)', async () => {
        await B.extendEntity({ entityKey: rk, expires: ExpirationTime.fromMinutes(30) });
      });
    }
  } else {
    record('permissionless extension by second wallet', 'SKIP', b ? 'wallet B unfunded' : 'no VERIFIER_PRIVATE_KEY');
  }

  await expectReject('extend: shortening expiry is rejected (ExpiryNotExtended)', () =>
    A.extendEntity({ entityKey: k, expires: ExpirationTime.fromSeconds(4) }),
  );

  await step('delete: owner deletes; getEntity then throws NoEntityFoundError', async () => {
    await A.deleteEntity({ entityKey: k });
    try {
      await pub.getEntity(k);
      throw new Error('still readable after delete');
    } catch (e) {
      const name = (e as { name?: string }).name;
      assert(name === 'NoEntityFoundError', `got ${name}`);
    }
  });

  await finish(unwatch, events, ours);
}

async function finish(unwatch: () => void, events: { type: string; key: string; shape: string }[], ours: Set<string>) {
  await new Promise((r) => setTimeout(r, 6000));
  unwatch();
  const mine = events.filter((e) => ours.has(e.key));
  const types = new Set(mine.map((e) => e.type));
  const want = ['EntityCreated', 'EntityPatched', 'ExpiryExtended', 'OwnershipTransferred', 'EntityDeleted'];
  const missing = want.filter((t) => !types.has(t));
  record(
    'watchEntityEvents: received our events',
    missing.length === 0 ? 'PASS' : mine.length > 0 ? 'INFO' : 'FAIL',
    `${mine.length} events for our keys (${events.length} total on chain)${missing.length ? `; not seen: ${missing.join(', ')}` : ''}`,
  );
  const shown = new Set<string>();
  for (const e of mine) {
    if (shown.has(e.type)) continue;
    shown.add(e.type);
    console.log(`  shape ${e.type}: ${redact(e.shape)}`);
  }
  printTable();
}

function printTable() {
  const w = Math.max(...results.map((r) => r.name.length));
  console.log(`\n${'='.repeat(w + 60)}\n${'CHECK'.padEnd(w)}  RESULT  DETAIL\n${'-'.repeat(w + 60)}`);
  for (const r of results) console.log(`${r.name.padEnd(w)}  ${r.status.padEnd(6)}  ${r.detail.slice(0, 160)}`);
  const fails = results.filter((r) => r.status === 'FAIL').length;
  console.log(`${'='.repeat(w + 60)}\n${results.filter((r) => r.status === 'PASS').length} pass, ${fails} fail, ${results.filter((r) => r.status === 'SKIP').length} skip\n`);
  process.exitCode = fails > 0 ? 1 : 0;
}

main().catch((e) => {
  record('spike aborted', 'FAIL', errText(e));
  printTable();
  process.exitCode = 1;
});

