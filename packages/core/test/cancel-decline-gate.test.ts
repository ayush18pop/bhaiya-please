import { describe, expect, it } from 'vitest';
import { BhaiyaPleaseError, PROJECT_TAG } from '../src/types';
import type { BhaiyaPleaseErrorCode } from '../src/types';
import { addr, createSpec, encode, HOME, listShop, makeWorld, NORTH } from './helpers';
import type { World } from './helpers';

const runner = addr('runner');
const resident = addr('resident');
const stranger = addr('stranger');
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

async function errOf(p: Promise<unknown>): Promise<BhaiyaPleaseError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof BhaiyaPleaseError) return e;
    throw e;
  }
  throw new Error('expected a BhaiyaPleaseError');
}

async function setup(w: World, capacity = 1) {
  const shop = await listShop(w, stranger);
  const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity });
  const req = await w.as(resident).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 100, tip: 10 });
  return { shop, run: run.key, request: req.key };
}

describe('cancelRequest', () => {
  it('owner cancels a pending request and it is gone', async () => {
    const w = makeWorld();
    const { request } = await setup(w);
    const res = await w.as(resident).cancelRequest(request);
    expect(res.key).toBe(request);
    expect(res.txHash).toMatch(/^0x/);
    expect(await w.as(resident).getRequest(request)).toBeNull();
    expect(w.chain.get(request)).toBeNull(); // deleted, not just hidden (readonly does not block owner delete)
  });

  it('non-owner cannot cancel', async () => {
    const w = makeWorld();
    const { request } = await setup(w);
    expect(await codeOf(w.as(runner).cancelRequest(request))).toBe('NOT_OWNER');
    expect(await codeOf(w.as(stranger).cancelRequest(request))).toBe('NOT_OWNER');
    expect(await w.as(resident).getRequest(request)).not.toBeNull();
  });

  it('cannot cancel after accept', async () => {
    const w = makeWorld();
    const { request } = await setup(w);
    await w.as(runner).acceptRequest(request);
    const e = await errOf(w.as(resident).cancelRequest(request));
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toBe('Already accepted');
    expect(await w.as(resident).getRequest(request)).not.toBeNull();
  });
});

describe('declineRequest', () => {
  it('runner declines; getDeclineForRequest returns it; accept afterwards throws', async () => {
    const w = makeWorld();
    const { run, request } = await setup(w);
    const res = await w.as(runner).declineRequest(request);
    const d = await w.as(resident).getDeclineForRequest(request);
    expect(d).not.toBeNull();
    expect(d!.key).toBe(res.key);
    expect(d!.request).toBe(request);
    expect(d!.run).toBe(run);
    expect(d!.rider).toBe(runner);
    expect(d!.readonly).toBe(true);
    // Dies with the run.
    expect(d!.expiresAt).toBeLessThanOrEqual((await w.as(runner).getRun(run))!.expiresAt);

    const e = await errOf(w.as(runner).acceptRequest(request));
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toBe('Declined');

    const again = await errOf(w.as(runner).declineRequest(request));
    expect(again.code).toBe('INVALID_INPUT');
    expect(again.message).toBe('Already declined');
  });

  it('cannot decline an accepted request', async () => {
    const w = makeWorld();
    const { request } = await setup(w);
    await w.as(runner).acceptRequest(request);
    const e = await errOf(w.as(runner).declineRequest(request));
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toBe('Already accepted');
  });

  it('ignores declines not written by the runner for itself', async () => {
    const w = makeWorld();
    const { run, request } = await setup(w);
    // A stranger forges a decline naming the runner as rider.
    await w.raw(stranger, (x) => x.create(createSpec(encode.decline(P, { request, run, rider: runner }))));
    // The runner writes one naming someone else as rider.
    await w.raw(runner, (x) => x.create(createSpec(encode.decline(P, { request, run, rider: stranger }))));
    expect(await w.as(resident).getDeclineForRequest(request)).toBeNull();
    // Still acceptable.
    expect(await codeOf(w.as(runner).acceptRequest(request))).toBe('ok');
  });

  it('only the runner may decline', async () => {
    const w = makeWorld();
    const { request } = await setup(w);
    expect(await codeOf(w.as(stranger).declineRequest(request))).toBe('NOT_OWNER');
    expect(await codeOf(w.as(resident).declineRequest(request))).toBe('NOT_OWNER');
    expect(await w.as(resident).getDeclineForRequest(request)).toBeNull();
  });

  it('cannot decline after ETA', async () => {
    const w = makeWorld();
    const { request } = await setup(w);
    w.chain.advance(31 * 60);
    expect(await codeOf(w.as(runner).declineRequest(request))).toBe('EXPIRED');
  });
});

describe('markAtGate', () => {
  it('owner marks the run; capacity and expiry are preserved', async () => {
    const w = makeWorld();
    const { run } = await setup(w, 1);
    const before = (await w.as(runner).getRun(run))!;
    expect(before.atGateAt).toBeUndefined();
    w.chain.advance(60);
    const res = await w.as(runner).markAtGate(run);
    expect(res.key).toBe(run);
    const after = (await w.as(runner).getRun(run))!;
    expect(after.atGateAt).toBe(w.chain.now());
    expect(after.capacityLeft).toBe(before.capacityLeft);
    expect(after.expiresAt).toBe(before.expiresAt);
    expect(after.eta).toBe(before.eta);
    expect(after.destZone).toBe(before.destZone);

    // Second call just updates the time.
    w.chain.advance(30);
    await w.as(runner).markAtGate(run);
    expect((await w.as(runner).getRun(run))!.atGateAt).toBe(w.chain.now());
  });

  it('non-owner cannot mark', async () => {
    const w = makeWorld();
    const { run } = await setup(w);
    expect(await codeOf(w.as(stranger).markAtGate(run))).toBe('NOT_OWNER');
    expect(await codeOf(w.as(resident).markAtGate(run))).toBe('NOT_OWNER');
    expect((await w.as(runner).getRun(run))!.atGateAt).toBeUndefined();
  });

  it('marked run is still trusted and listed in getLiveRuns', async () => {
    const w = makeWorld();
    const { run } = await setup(w, 2);
    await w.as(runner).markAtGate(run);
    const live = await w.as(resident).getLiveRuns(HOME);
    const found = live.find((r) => r.key === run);
    expect(found).toBeDefined();
    expect(found!.atGateAt).toBe(w.chain.now());
    expect((await w.as(runner).getMyRuns()).map((r) => r.key)).toContain(run);
  });

  it('allowed after ETA, refused once the run expired', async () => {
    const w = makeWorld();
    const { run } = await setup(w);
    w.chain.advance(31 * 60); // past ETA, within the 10 min tail
    expect(await codeOf(w.as(runner).markAtGate(run))).toBe('ok');
    w.chain.advance(15 * 60); // past expiry
    expect(await codeOf(w.as(runner).markAtGate(run))).toBe('NOT_FOUND');
  });
});
