import { describe, expect, it } from 'vitest';
import { attr } from '../src/codec/attrs';
import { encode } from '../src/codec/entities';
import { MockChain } from '../src/mock/chain';
import type { KVStorage } from '../src/mock/chain';
import { createMockBhaiyaPlease } from '../src/mock';
import { BhaiyaPleaseError, PROJECT_TAG } from '../src/types';
import type { BhaiyaPleaseErrorCode, ChangeEvent } from '../src/types';
import { addr, createSpec, HOME, makeWorld, NORTH } from './helpers';

const alice = addr('alice');
const bob = addr('bob');
const P = PROJECT_TAG;

async function codeOf(p: Promise<unknown>): Promise<BhaiyaPleaseErrorCode | 'ok'> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof BhaiyaPleaseError) return e.code;
    throw e;
  }
}

const runSpec = (cap = 2) =>
  createSpec(encode.run(P, { destZone: HOME, fromZone: NORTH, eta: 1_790_001_000, capacityLeft: cap, claimedTier: 0 }));
const shopSpec = () => createSpec(encode.shop(P, { zone: NORTH, category: 'grocery', nameTag: 'X' }));
const receiptSpec = () =>
  createSpec(encode.receipt(P, { rider: bob, delivery: `0x${'11'.repeat(32)}`, zone: HOME, at: 1, tags: [] }));

describe('mock engine enforcement', () => {
  it('only the owner may patch', async () => {
    const w = makeWorld();
    const { key } = await w.raw(alice, (x) => x.create(runSpec()));
    expect(await codeOf(w.raw(bob, (x) => x.patch(key, { capacity_left: attr('capacity_left', 0) })))).toBe('NOT_OWNER');
    await w.raw(alice, (x) => x.patch(key, { capacity_left: attr('capacity_left', 1) }));
    const e = w.chain.get(key);
    expect(e?.attributes.capacity_left?.value).toBe(1);
    expect(e?.attributes.dest_zone?.value).toBe(HOME); // partial patch keeps the rest
  });

  it('readonly entities cannot be patched, even by the owner', async () => {
    const w = makeWorld();
    const { key } = await w.raw(alice, (x) => x.create(receiptSpec()));
    expect(await codeOf(w.raw(alice, (x) => x.patch(key, { zone: attr('zone', NORTH) })))).toBe('NOT_OWNER');
  });

  it('permissionlessExtension lets a stranger extend; otherwise only the owner', async () => {
    const w = makeWorld();
    const shop = await w.raw(alice, (x) => x.create(shopSpec()));
    const before = w.chain.get(shop.key)!.expiresAt;
    w.chain.advance(100);
    await w.raw(bob, (x) => x.extend(shop.key, 30 * 86400));
    expect(w.chain.get(shop.key)!.expiresAt).toBeGreaterThan(before);
    expect(w.chain.get(shop.key)!.owner).toBe(alice);

    const run = await w.raw(alice, (x) => x.create(runSpec()));
    expect(await codeOf(w.raw(bob, (x) => x.extend(run.key, 7200)))).toBe('NOT_OWNER');
  });

  it('readonly entities can still be extended and transferred by the owner', async () => {
    const w = makeWorld();
    const { key } = await w.raw(alice, (x) => x.create(receiptSpec()));
    await w.raw(alice, (x) => x.extend(key, 7200));
    await w.raw(alice, (x) => x.transfer(key, bob));
    const e = w.chain.get(key)!;
    expect(e.owner).toBe(bob);
    expect(e.creator).toBe(alice);
    expect(await codeOf(w.raw(alice, (x) => x.transfer(key, alice)))).toBe('NOT_OWNER');
  });

  it('extend must move expiry later', async () => {
    const w = makeWorld();
    const { key } = await w.raw(alice, (x) => x.create(createSpec(encode.shop(P, { zone: NORTH, category: 'grocery', nameTag: 'X' }), 7200)));
    expect(await codeOf(w.raw(alice, (x) => x.extend(key, 60)))).toBe('INVALID_INPUT');
  });

  it('batch is atomic: a failing op rolls back earlier creates and the nonce', async () => {
    const w = makeWorld();
    const foreign = await w.raw(bob, (x) => x.create(runSpec()));
    const [predicted] = await w.raw(alice, (x) => x.predictKeys(1));
    const res = codeOf(
      w.raw(alice, (x) =>
        x.batch({ creates: [{ ...shopSpec(), salt: predicted!.salt }], patches: [{ key: foreign.key, set: { capacity_left: attr('capacity_left', 0) } }] }),
      ),
    );
    expect(await res).toBe('NOT_OWNER');
    expect(w.chain.get(predicted!.key)).toBeNull();
    // Nonce unchanged → the same prediction still mints the same key.
    const created = await w.raw(alice, (x) => x.create({ ...shopSpec(), salt: predicted!.salt }));
    expect(created.key).toBe(predicted!.key);
  });

  it('batch order allows create + transfer of the same new entity', async () => {
    const w = makeWorld();
    const res = await w.raw(alice, async (x) => {
      const [p] = await x.predictKeys(1);
      return x.batch({ creates: [{ ...receiptSpec(), salt: p!.salt }], transfers: [{ key: p!.key, to: bob }] });
    });
    expect(w.chain.get(res.created[0]!)?.owner).toBe(bob);
  });

  it('predicted keys need the matching salt', async () => {
    const w = makeWorld();
    const [p] = await w.raw(alice, (x) => x.predictKeys(1));
    const created = await w.raw(alice, (x) => x.create(shopSpec()));
    expect(created.key).not.toBe(p!.key);
  });

  it('expiry hides entities from get and query', async () => {
    const w = makeWorld();
    const { key } = await w.raw(alice, (x) => x.create(createSpec(encode.shop(P, { zone: NORTH, category: 'grocery', nameTag: 'X' }), 60)));
    expect(await w.as(alice).getShop(key)).not.toBeNull();
    expect(await w.as(alice).getShops(NORTH.slice(0, 5))).toHaveLength(1);
    w.chain.advance(61);
    expect(await w.as(alice).getShop(key)).toBeNull();
    expect(await w.as(alice).getShops(NORTH.slice(0, 5))).toHaveLength(0);
    expect(await codeOf(w.raw(alice, (x) => x.extend(key, 7200)))).toBe('EXPIRED');
  });

  it('typed queries never match a differently-typed attribute', async () => {
    const w = makeWorld();
    await w.raw(alice, (x) => x.create(runSpec()));
    const q = (t: 'i32' | 'u64') =>
      w.chain.query({ where: [{ op: 'gt', name: 'capacity_left', value: t === 'i32' ? { type: 'i32', value: 0 } : { type: 'u64', value: 0n } }] });
    expect(q('i32')).toHaveLength(1);
    expect(q('u64')).toHaveLength(0);
  });

  it('read-only port rejects writes with NO_SIGNER', async () => {
    const chain = new MockChain();
    const port = chain.port(() => null);
    expect(await codeOf(port.write((x) => x.create(shopSpec())))).toBe('NO_SIGNER');
  });
});

describe('createMockBhaiyaPlease', () => {
  it('seed:false starts empty; dev.setAddress switches wallet; dev.advance moves the clock', async () => {
    const m = createMockBhaiyaPlease({ latencyMs: 0, seed: false, address: alice, now: () => 1_790_000_000 });
    expect(m.address).toBe(alice);
    expect(await m.getShops(NORTH.slice(0, 5))).toEqual([]);
    const { key } = await m.listShop({ zone: NORTH, category: 'bakery', nameTag: 'Kesar Bakehouse' });
    m.dev.setAddress(bob);
    expect(m.address).toBe(bob);
    expect((await m.inspect(key))?.creator).toBe(alice);
    m.dev.advance(31 * 86400);
    expect(await m.getShop(key)).toBeNull();
    m.close();
  });

  it('dev.reset(false) clears, dev.reset() reseeds', async () => {
    const m = createMockBhaiyaPlease({ latencyMs: 0 });
    expect((await m.getLiveRuns(HOME)).length).toBeGreaterThan(0);
    m.dev.reset(false);
    expect(await m.getLiveRuns(HOME)).toEqual([]);
    m.dev.reset();
    expect((await m.getLiveRuns(HOME)).length).toBeGreaterThan(0);
    m.close();
  });

  it("store:'localStorage' syncs two instances like two tabs (storage events)", async () => {
    // Minimal Web Storage + storage-event bus, as a browser would provide.
    const data = new Map<string, string>();
    type L = (e: { key: string | null; newValue: string | null }) => void;
    const tabs: { listeners: Set<L> }[] = [];
    let current: { listeners: Set<L> } | null = null;
    const storage: KVStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
        for (const t of tabs) if (t !== current) for (const l of t.listeners) l({ key: k, newValue: v });
      },
      removeItem: (k) => void data.delete(k),
    };
    const g = globalThis as Record<string, unknown>;
    const saved = { localStorage: g.localStorage, add: g.addEventListener, remove: g.removeEventListener };
    const makeTab = () => {
      const tab = { listeners: new Set<L>() };
      tabs.push(tab);
      g.localStorage = storage;
      g.addEventListener = (_t: string, l: L) => tab.listeners.add(l);
      g.removeEventListener = (_t: string, l: L) => tab.listeners.delete(l);
      return tab;
    };
    try {
      const tabA = makeTab();
      current = tabA;
      const a = createMockBhaiyaPlease({ latencyMs: 0, seed: false, store: 'localStorage', address: alice });
      await a.getShops(NORTH.slice(0, 5));
      const tabB = makeTab();
      current = tabB;
      const b = createMockBhaiyaPlease({ latencyMs: 0, seed: false, store: 'localStorage', address: bob });

      const seen: ChangeEvent[] = [];
      b.subscribe({ types: ['shop'] }, (e) => seen.push(e));
      current = tabA;
      const { key } = await a.listShop({ zone: NORTH, category: 'grocery', nameTag: 'Shared Shop' });
      await new Promise((r) => setTimeout(r, 0));
      current = tabB;
      expect((await b.getShop(key))?.nameTag).toBe('Shared Shop');
      expect(seen.map((e) => [e.kind, e.key])).toEqual([['created', key]]);
      a.close();
      b.close();
    } finally {
      g.localStorage = saved.localStorage;
      g.addEventListener = saved.add;
      g.removeEventListener = saved.remove;
    }
  });

  it('falls back to memory when localStorage is unavailable (React Native)', async () => {
    const m = createMockBhaiyaPlease({ latencyMs: 0, seed: false, store: 'localStorage', address: alice });
    await m.listShop({ zone: NORTH, category: 'grocery', nameTag: 'Memory Shop' });
    expect(await m.getShops(NORTH.slice(0, 5))).toHaveLength(1);
    m.close();
  });
});

describe('watchOwners (live hint, no reads)', () => {
  it('fires only for events whose owner matches, and stops after unsubscribe', async () => {
    const alice = '0x00000000000000000000000000000000000000a1' as Address;
    const bob = '0x00000000000000000000000000000000000000b2' as Address;
    const a = createMockBhaiyaPlease({ latencyMs: 0, seed: false, address: alice });
    let hits = 0;
    const off = a.watchOwners((o) => o.toLowerCase() === bob, () => hits++);
    await a.listShop({ zone: NORTH, category: 'grocery', nameTag: 'Alice shop' });
    await new Promise((r) => setTimeout(r, 0));
    expect(hits).toBe(0);
    const matchAlice = a.watchOwners((o) => o.toLowerCase() === alice, () => hits++);
    await a.listShop({ zone: NORTH, category: 'grocery', nameTag: 'Alice shop 2' });
    await new Promise((r) => setTimeout(r, 0));
    expect(hits).toBeGreaterThan(0);
    const before = hits;
    off();
    matchAlice();
    await a.listShop({ zone: NORTH, category: 'grocery', nameTag: 'Alice shop 3' });
    await new Promise((r) => setTimeout(r, 0));
    expect(hits).toBe(before);
    a.close();
  });
});
