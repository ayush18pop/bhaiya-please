import { describe, expect, it } from 'vitest';
import { attr } from '../src/codec/attrs';
import { decode, encode } from '../src/codec/entities';
import { createMockBhaiyaPlease, createMockPort } from '../src/mock';
import { buildNoShowEvidence, verifyNoShowEvidence } from '../src/services/noshow';
import { PROJECT_TAG } from '../src/types';
import type { Address, EntityKey, NoShow } from '../src/types';
import { addr, createSpec, HOME, listShop, makeWorld, NORTH } from './helpers';
import type { World } from './helpers';

const P = PROJECT_TAG;
const DAY = 86_400;
const runner = addr('ns-runner');
const resident = addr('ns-resident');
const stranger = addr('ns-stranger');
const worker = addr('ns-worker');

/** Run (ETA +30 min) + request + accept. */
async function accepted(w: World) {
  const shop = await listShop(w, resident);
  const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
  const req = await w.as(resident).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 100, tip: 0 });
  const acc = await w.as(runner).acceptRequest(req.key);
  return { run: run.key, request: req.key, secret: req.secret, accept: acc.key };
}

const port = (w: World) => w.as(worker).arkivPort();

/** What the Arkiv Triggers attester does: build at head, write as the worker. */
async function attest(w: World, request: EntityKey): Promise<NoShow> {
  const ev = await buildNoShowEvidence(port(w), P, request);
  if (!ev) throw new Error('expected evidence');
  const { key } = await w.raw(worker, (x) => x.create(ev.spec));
  return decode.noshow(w.chain.get(key)!, P)!;
}

/** Write arbitrary (possibly forged) evidence as `by`. */
async function forge(w: World, by: Address, i: Parameters<typeof encode.noshow>[1]): Promise<NoShow> {
  const { key } = await w.raw(by, (x) => x.create(createSpec(encode.noshow(P, i), 180 * DAY)));
  return decode.noshow(w.chain.get(key)!, P)!;
}

describe('buildNoShowEvidence', () => {
  it('is null before ETA, non-null after ETA with an accept and no delivery', async () => {
    const w = makeWorld();
    const h = await accepted(w);
    expect(await buildNoShowEvidence(port(w), P, h.request)).toBeNull();
    w.chain.advance(31 * 60);
    const ev = await buildNoShowEvidence(port(w), P, h.request);
    expect(ev).not.toBeNull();
    expect(ev!.block).toBe(await port(w).blockNumber());
    expect(ev!.spec).toMatchObject({ readonly: true, permissionlessExtension: false, expiresInSeconds: 180 * DAY, payload: '{}' });
    expect(ev!.spec.attributes).toMatchObject({
      type: { type: 'str', value: 'noshow' },
      request: attr('request', h.request),
      run: attr('run', h.run),
      rider: attr('rider', runner),
      accept: attr('accept', h.accept),
      block: { type: 'u64', value: ev!.block },
    });
  });

  it('is null when the runner delivered, and when nothing was accepted', async () => {
    const w = makeWorld();
    const h = await accepted(w);
    await w.as(runner).recordDelivery({ secret: h.secret });
    w.chain.advance(31 * 60);
    expect(await buildNoShowEvidence(port(w), P, h.request)).toBeNull();

    const shop = await listShop(w, resident);
    const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 5, capacity: 1 });
    const req = await w.as(resident).postRequest({ runKey: run.key, shopKey: shop, items: ['Eggs'], maxPrice: 50, tip: 0 });
    w.chain.advance(6 * 60);
    expect(await buildNoShowEvidence(port(w), P, req.key)).toBeNull();
  });
});

describe('verifyNoShow', () => {
  it('evidence written by a worker verifies (any $creator)', async () => {
    const w = makeWorld();
    const h = await accepted(w);
    w.chain.advance(31 * 60);
    const ns = await attest(w, h.request);
    expect(ns.creator).toBe(worker);
    expect(await w.as(stranger).verifyNoShow(ns)).toEqual({ valid: true });
    // Still verifiable after the run, accept and request have expired (re-read at the block).
    w.chain.advance(2 * 3600);
    expect(await w.as(stranger).getRun(h.run)).toBeNull();
    expect(await verifyNoShowEvidence(port(w), P, ns)).toEqual({ valid: true });
    const list = await w.as(stranger).getNoShowsFor(runner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ valid: true, noshow: { key: ns.key } });
  });

  it('forged evidence fails: wrong rider, block before ETA, delivery at that block, wrong accept', async () => {
    const w = makeWorld();
    const h = await accepted(w);
    const beforeEta = await port(w).blockNumber();
    w.chain.advance(31 * 60);
    const after = await port(w).blockNumber();
    const base = { request: h.request, run: h.run, rider: runner, accept: h.accept, at: w.chain.now() };

    const wrongRider = await forge(w, stranger, { ...base, rider: stranger, block: after });
    expect(await w.as(stranger).verifyNoShow(wrongRider)).toEqual({ valid: false, reason: 'rider_mismatch' });

    const early = await forge(w, stranger, { ...base, block: beforeEta });
    expect(await w.as(stranger).verifyNoShow(early)).toEqual({ valid: false, reason: 'before_eta' });

    const fakeAccept = await forge(w, stranger, { ...base, accept: h.run, block: after });
    expect(await w.as(stranger).verifyNoShow(fakeAccept)).toEqual({ valid: false, reason: 'accept_missing' });

    const future = await forge(w, stranger, { ...base, block: after + 10_000n });
    expect(await w.as(stranger).verifyNoShow(future)).toEqual({ valid: false, reason: 'history_unavailable' });

    // The runner hands over (late, still before the run expires); evidence claimed at a later block fails.
    w.chain.advance(2);
    await w.as(runner).recordDelivery({ secret: h.secret });
    w.chain.advance(2);
    const atDelivery = await port(w).blockNumber();
    const delivered = await forge(w, stranger, { ...base, block: atDelivery });
    expect(await w.as(stranger).verifyNoShow(delivered)).toEqual({ valid: false, reason: 'delivered' });

    // Evidence that was true at its block is cancelled by the later handoff.
    const stale = await forge(w, stranger, { ...base, block: after });
    expect(await w.as(stranger).verifyNoShow(stale)).toEqual({ valid: false, reason: 'delivered_later' });
    expect(await buildNoShowEvidence(port(w), P, h.request)).toBeNull();
  });

  it('duplicates (two workers racing) count once', async () => {
    const w = makeWorld();
    const h = await accepted(w);
    w.chain.advance(31 * 60);
    const a = await attest(w, h.request);
    w.chain.advance(4);
    const b = await attest(w, h.request);
    const list = await w.as(stranger).getNoShowsFor(runner);
    expect(list.find((v) => v.noshow.key === a.key)).toMatchObject({ valid: true });
    expect(list.find((v) => v.noshow.key === b.key)).toMatchObject({ valid: false, reason: 'duplicate' });
    expect(await w.as(resident).getNoShowForRequest(h.request)).toMatchObject({ valid: true, noshow: { key: a.key } });
    const p = await w.as(stranger).getProfile(runner);
    expect(p.noShows.map((n) => n.key)).toEqual([a.key]);
    expect(p.noShows30d).toBe(1);
  });
});

describe('no_show complaints', () => {
  it('are refused and not counted without evidence; counted with verified evidence', async () => {
    const w = makeWorld();
    const h = await accepted(w);
    w.chain.advance(31 * 60);
    await expect(w.as(resident).fileComplaint({ requestKey: h.request, rider: runner, reason: 'no_show' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringMatching(/no-show evidence/),
    });
    // A raw no_show complaint without evidence is ignored by every viewer.
    await w.raw(resident, (x) =>
      x.create(createSpec(encode.complaint(P, { rider: runner, request: h.request, reason: 'no_show', at: w.chain.now() }), 180 * DAY)),
    );
    expect(await w.as(stranger).getComplaintsAgainst(runner)).toHaveLength(0);
    expect((await w.as(stranger).getProfile(runner)).complaints30d).toBe(0);
    expect(await w.as(resident).getNoShowForRequest(h.request)).toBeNull();

    await attest(w, h.request);
    // Now the existing raw complaint counts (its evidence exists), and a service filing is refused as a duplicate.
    expect(await w.as(stranger).getComplaintsAgainst(runner)).toHaveLength(1);
    await expect(w.as(resident).fileComplaint({ requestKey: h.request, rider: runner, reason: 'no_show' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringMatching(/already filed/),
    });
    const p = await w.as(stranger).getProfile(runner);
    expect(p).toMatchObject({ complaints30d: 1, noShows30d: 1 });
    expect(p.noShows).toHaveLength(1);
  });

  it('fileComplaint(no_show) succeeds with evidence and survives past the run', async () => {
    const w = makeWorld();
    const h = await accepted(w);
    w.chain.advance(31 * 60);
    await attest(w, h.request);
    await w.as(resident).fileComplaint({ requestKey: h.request, rider: runner, reason: 'no_show' });
    w.chain.advance(10 * DAY);
    const list = await w.as(stranger).getComplaintsAgainst(runner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'no_show', creator: resident });
    // Evidence for another rider does not back a complaint against this one.
    const other = addr('ns-other');
    await expect(w.as(resident).fileComplaint({ requestKey: h.request, rider: other, reason: 'no_show' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const p = await w.as(stranger).getProfile(runner);
    expect(p.complaints30d).toBe(1);
    expect(p.noShows30d).toBe(1);
    w.chain.advance(25 * DAY);
    expect((await w.as(stranger).getProfile(runner)).noShows30d).toBe(0);
  });
});

describe('mock historical reads and companion ports', () => {
  it('port.at(block) returns the state at that block', async () => {
    const w = makeWorld();
    const run = await w.raw(runner, (x) =>
      x.create(createSpec(encode.run(P, { destZone: HOME, fromZone: NORTH, eta: w.chain.now() + 600, capacityLeft: 2, claimedTier: 0 }))),
    );
    const p = port(w);
    const b0 = await p.blockNumber();
    w.chain.advance(10);
    await w.raw(runner, (x) => x.patch(run.key, { capacity_left: attr('capacity_left', 1) }));
    w.chain.advance(10);
    await w.raw(runner, (x) => x.remove(run.key));
    expect(await p.get(run.key)).toBeNull();
    const then = await p.at(b0);
    expect(then.now()).toBe(Number(b0) * 2);
    expect((await then.get(run.key))?.attributes.capacity_left?.value).toBe(2);
    expect((await (await p.at(b0 + 5n)).get(run.key))?.attributes.capacity_left?.value).toBe(1);
    expect(await (await p.at(b0 - 1n)).get(run.key)).toBeNull();
    await expect(p.at((await p.blockNumber()) + 1n)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    // getProfileAt now works on the mock too.
    expect((await w.as(stranger).getProfileAt(runner, b0)).atBlock).toBe(b0);
  });

  it('createMockPort: fresh chain, and sharing a mock client chain', async () => {
    const fresh = createMockPort({ address: worker, now: () => 1_790_000_000 });
    const { key } = await fresh.write((x) => x.create(createSpec(encode.shop(P, { zone: NORTH, category: 'grocery', nameTag: 'X' }))));
    expect((await fresh.get(key))?.creator).toBe(worker);
    expect(fresh.mock.portFor(stranger).address).toBe(stranger);
    expect(await fresh.mock.portFor(stranger).get(key)).not.toBeNull();

    const app = createMockBhaiyaPlease({ seed: false, latencyMs: 0, address: resident });
    try {
      expect(app.arkivPort().address).toBe(resident);
      const shared = createMockPort({ address: worker, shareWith: app });
      const shop = await app.listShop({ zone: NORTH, category: 'bakery', nameTag: 'Shared' });
      const seen = await shared.get(shop.key);
      expect(seen?.creator).toBe(resident);
      const written = await shared.write((x) => x.create(createSpec(encode.shop(P, { zone: NORTH, category: 'grocery', nameTag: 'Y' }))));
      expect((await app.getShop(written.key))?.creator).toBe(worker);
      expect(app.dev.port(worker)).toBe(app.dev.port(worker));
    } finally {
      app.close();
    }
  });
});
