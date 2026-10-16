import { describe, expect, it } from 'vitest';
import type { RawEntity } from '../src/arkiv/port';
import { decodePing, encodePing } from '../src/codec/ping';
import type { EntitySpec } from '../src/codec/entities';
import { coarsenToGh7, distanceMeters, geohashCenter, pingFreshness, simulatedPosition, simulatedRoute } from '../src/geo';
import { createMockBhaiyaPlease, mockAddressOf, PERSONA } from '../src/mock';
import { BhaiyaPleaseError, PING_RULES, PROJECT_TAG } from '../src/types';
import type { EntityKey } from '../src/types';
import { addr, createSpec, HOME, makeWorld, NORTH, T0 } from './helpers';

const P = PROJECT_TAG;
const runner = addr('runner');
const stranger = addr('stranger');
const K = `0x${'aa'.repeat(32)}` as EntityKey;
const GH = 'tdr3c4k';

function raw(s: EntitySpec, over: Partial<RawEntity> = {}): RawEntity {
  return {
    key: `0x${'01'.repeat(32)}` as EntityKey,
    owner: runner,
    creator: runner,
    createdAt: T0,
    expiresAt: T0 + 120,
    readonly: s.readonly,
    permissionlessExtension: s.permissionlessExtension,
    attributes: s.attributes,
    payload: s.payload,
    contentType: 'application/json',
    ...over,
  };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof BhaiyaPleaseError) return e.code;
    throw e;
  }
}

async function liveRun(w: ReturnType<typeof makeWorld>) {
  return (await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 20, capacity: 1 })).key;
}

describe('ping codec', () => {
  it('round-trips and is readonly with only a geohash-7 cell', () => {
    const s = encodePing(P, { run: K, rider: runner, gh7: GH, at: T0, seq: 3, heading: 181.6, speedKmh: 17.94 });
    expect(s.readonly).toBe(true);
    expect(s.attributes.zone5?.value).toBe('tdr3c');
    expect(Object.keys(s.attributes).sort()).toEqual(['at', 'gh7', 'project', 'rider', 'run', 'seq', 'type', 'zone5']);
    expect(s.payload).not.toMatch(/lat|lng/);
    const p = decodePing(raw(s), P)!;
    expect(p).toMatchObject({ run: K, rider: runner, gh7: GH, zone5: 'tdr3c', at: T0, seq: 3, heading: 182, speedKmh: 17.9 });
  });

  it('drops malformed pings', () => {
    const good = encodePing(P, { run: K, rider: runner, gh7: GH, at: T0 });
    const zoneMismatch = { ...good, attributes: { ...good.attributes, zone5: { type: 'str' as const, value: 'tdr3d' } } };
    const shortCell = encodePing(P, { run: K, rider: runner, gh7: 'tdr3c4', at: T0 });
    const badPayload = { ...good, payload: '{"heading": 999}' };
    for (const s of [zoneMismatch, shortCell, badPayload]) expect(decodePing(raw(s), P)).toBeNull();
    expect(decodePing(raw(good), 'otherproject')).toBeNull();
  });

  it('coarsens on device to ~150 m', () => {
    const gh = coarsenToGh7(12.97761, 77.74481);
    expect(gh).toHaveLength(7);
    expect(distanceMeters(geohashCenter(gh), { lat: 12.97761, lng: 77.74481 })).toBeLessThan(110);
  });
});

describe('ping trust + expiry (mock chain)', () => {
  it('runner publishes; latest per run wins; queries by zone5 and by run keys', async () => {
    const w = makeWorld();
    const run = await liveRun(w);
    await w.as(runner).publishPing(run, 'tdr3c4k', { seq: 0 });
    w.chain.advance(20);
    await w.as(runner).publishPing(run, 'tdr3c4h', { seq: 1, heading: 180 });
    for (const scope of ['tdr3c', [run]] as const) {
      const pings = await w.as(stranger).getLatestPings(scope);
      expect(pings).toHaveLength(1);
      expect(pings[0]).toMatchObject({ run, gh7: 'tdr3c4h', seq: 1, heading: 180 });
    }
    expect((await w.as(stranger).getRunTrail(run)).map((p) => p.seq)).toEqual([0, 1]);
  });

  it('ignores forged pings from anyone but the run creator', async () => {
    const w = makeWorld();
    const run = await liveRun(w);
    await w.as(runner).publishPing(run, 'tdr3c4k', { seq: 0 });
    w.chain.advance(10);
    // Stranger claims to be the rider, and a stranger writes as itself: both newer, both ignored.
    await w.raw(stranger, (x) => x.create(createSpec(encodePing(P, { run, rider: runner, gh7: 'tdr3c1b', at: T0 + 10 }), 120)));
    await w.raw(stranger, (x) => x.create(createSpec(encodePing(P, { run, rider: stranger, gh7: 'tdr3c1c', at: T0 + 10 }), 120)));
    // The runner writing a ping that names someone else as rider is also ignored.
    await w.raw(runner, (x) => x.create(createSpec(encodePing(P, { run, rider: stranger, gh7: 'tdr3c1d', at: T0 + 10 }), 120)));
    const [p] = await w.as(stranger).getLatestPings('tdr3c');
    expect(p?.gh7).toBe('tdr3c4k');
    expect(await w.as(stranger).getRunTrail(run)).toHaveLength(1);
    expect(await codeOf(w.as(stranger).publishPing(run, 'tdr3c1b'))).toBe('NOT_OWNER');
    expect(await codeOf(w.as(runner).publishPing(run, 'tdr3c'))).toBe('INVALID_INPUT');
  });

  it('goes stale after 60 s, disappears at 120 s, and never outlives the run', async () => {
    const w = makeWorld();
    const run = await liveRun(w);
    await w.as(runner).publishPing(run, 'tdr3c4k');
    w.chain.advance(PING_RULES.staleAfterSeconds + 1);
    const [p] = await w.as(stranger).getLatestPings([run]);
    expect(p && pingFreshness(p, w.chain.now())).toBe('stale');
    w.chain.advance(PING_RULES.ttlSeconds - PING_RULES.staleAfterSeconds);
    expect(await w.as(stranger).getLatestPings([run])).toEqual([]);

    // 30 s before the run expires: the ping's expiry is clamped to the run's.
    const r = (await w.as(runner).getRun(run))!;
    w.chain.advance(r.expiresAt - w.chain.now() - 30);
    await w.as(runner).publishPing(run, 'tdr3c1b');
    const [q] = await w.as(stranger).getLatestPings([run]);
    expect(q!.expiresAt).toBeLessThanOrEqual(r.expiresAt);
    w.chain.advance(31);
    expect(await codeOf(w.as(runner).publishPing(run, 'tdr3c1b'))).toBe('EXPIRED');
    expect(await w.as(stranger).getLatestPings('tdr3c')).toEqual([]);
  });
});

describe('synthetic movement', () => {
  it('route starts beyond from_zone and ends at the dest gate; position advances with time', () => {
    const run = { key: K, fromZone: NORTH, destZone: HOME, createdAt: T0, eta: T0 + 25 * 60 };
    const route = simulatedRoute(run);
    expect(distanceMeters(route.at(-1)!, geohashCenter(HOME))).toBeLessThan(1);
    const a = simulatedPosition(run, T0 + 60, route);
    const b = simulatedPosition(run, T0 + 120, route);
    expect(distanceMeters(a.pos, b.pos)).toBeGreaterThan(200); // ~18 km/h
    expect(simulatedPosition(run, run.eta + 5, route)).toMatchObject({ arrived: true, speedKmh: 0 });
  });

  it('mock seeded runners publish pings on the mock clock and move', async () => {
    let clock = T0;
    const core = createMockBhaiyaPlease({ latencyMs: 0, now: () => clock });
    const runs = await core.getLiveRuns(HOME);
    expect(runs.length).toBeGreaterThan(0);
    expect(await core.dev.pingTick()).toBe(3); // three seeded live runs
    expect(await core.dev.pingTick()).toBe(0); // not due yet
    const first = await core.getLatestPings(runs.map((r) => r.key));
    expect(first).toHaveLength(runs.length);
    clock += 180;
    expect(await core.dev.pingTick()).toBe(3);
    const second = await core.getLatestPings(runs.map((r) => r.key));
    const trusted = mockAddressOf(PERSONA.runnerTrusted);
    const a = first.find((p) => p.creator === trusted)!;
    const b = second.find((p) => p.creator === trusted)!;
    expect(b.seq).toBe((a.seq ?? 0) + 1);
    expect(distanceMeters(geohashCenter(a.gh7), geohashCenter(b.gh7))).toBeGreaterThan(400);
    core.close();
  });
});
