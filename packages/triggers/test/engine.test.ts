import { createMockPort } from '@bhaiya-please/core/mock';
import type { MockArkivPort } from '@bhaiya-please/core/mock';
import { keccak256, stringToHex } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildTriggerSpec,
  createCallbackPushSender,
  createMemoryChannelDirectory,
  createMemoryStore,
  createTriggerEngine,
  decodeFiring,
  listFiringsFor,
  pred,
  val,
  TRIGGERS_PROJECT,
} from '../src';
import type {
  AttestPlugin,
  EngineLog,
  EngineStore,
  FiringEvent,
  MemoryChannelDirectory,
  PushMessage,
  TriggerInput,
} from '../src';
import type { Address, ArkivPort, AttrMap, CreateSpec, EntityKey } from '../src/port';

const T0 = 1_790_000_000;
const addr = (name: string) => `0x${keccak256(stringToHex(`triggers-test:${name}`)).slice(-40)}` as Address;
const WORKER = addr('worker');
const ALICE = addr('alice');
const BOB = addr('bob');
const MALLORY = addr('mallory');
const ZONE = 'tdr1y4';
const OTHER = 'tdr1v9';

interface World {
  port: MockArkivPort;
  as(a: Address): ArkivPort;
  channels: MemoryChannelDirectory;
  pushes: PushMessage[];
  firings: FiringEvent[];
  logs: EngineLog[];
  store: ReturnType<typeof createMemoryStore>;
  engine(extra?: { store?: EngineStore; plugins?: Record<string, AttestPlugin> }): ReturnType<typeof createTriggerEngine>;
}

function world(): World {
  const port = createMockPort({ address: WORKER, now: () => T0 });
  const channels = createMemoryChannelDirectory();
  const pushes: PushMessage[] = [];
  const firings: FiringEvent[] = [];
  const logs: EngineLog[] = [];
  const store = createMemoryStore();
  return {
    port,
    as: (a) => port.mock.portFor(a),
    channels,
    pushes,
    firings,
    logs,
    store,
    engine: (extra = {}) =>
      createTriggerEngine({
        port,
        workerAddress: WORKER,
        actions: { channels, push: createCallbackPushSender((_c, m) => pushes.push(m)) },
        plugins: extra.plugins ?? {},
        store: extra.store ?? store,
        triggerRefreshMs: 0,
        flushMs: 0,
        onLog: (e) => logs.push(e),
        onFiring: (f) => firings.push(f),
      }),
  };
}

const attrs = (type: string, extra: AttrMap = {}): AttrMap => ({ project: val.str('bhaiyaplease'), type: val.str(type), ...extra });

async function create(p: ArkivPort, attributes: AttrMap, expiresInSeconds = 3600): Promise<EntityKey> {
  const spec: CreateSpec = { attributes, payload: '{}', readonly: false, permissionlessExtension: false, expiresInSeconds };
  return p.write(async (w) => (await w.create(spec)).key);
}

async function subscribe(p: ArkivPort, input: Omit<TriggerInput, 'expiresInSeconds'> & { expiresInSeconds?: number }): Promise<EntityKey> {
  const spec = buildTriggerSpec({ expiresInSeconds: 24 * 3600, ...input });
  return p.write(async (w) => (await w.batch({ creates: [spec] })).created[0] as EntityKey);
}

/** A port delegating to `p` with some methods replaced (test doubles). */
function wrapPort(p: ArkivPort, over: Partial<ArkivPort>): ArkivPort {
  return {
    get address() {
      return p.address;
    },
    now: () => p.now(),
    query: (q) => p.query(q),
    get: (k) => p.get(k),
    at: (b) => p.at(b),
    write: (fn) => p.write(fn),
    watch: (cb) => p.watch(cb),
    balance: (a) => p.balance(a),
    blockNumber: () => p.blockNumber(),
    ...over,
  };
}

const runAttrs = (zone: string) => attrs('run', { dest_zone: val.str(zone), capacity_left: val.i32(3) });

describe('Arkiv Triggers engine (mock chain)', () => {
  let w: World;
  let alicePush: `0x${string}`;
  beforeEach(() => {
    w = world();
    alicePush = w.channels.register('webpush', ALICE).id;
  });

  it('created: fires once for a new run in the zone, never for pre-existing ones; receipt is correct', async () => {
    const bob = w.as(BOB);
    await create(bob, runAttrs(ZONE)); // pre-existing
    w.port.mock.advance(2);
    const trig = await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'created',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.str('dest_zone', ZONE)] },
      label: 'Someone is heading here',
      body: 'Run to {dest_zone}, {capacity_left} slots',
      href: '/board',
    });
    const engine = w.engine();
    await engine.tick();
    expect(w.pushes).toHaveLength(0);

    w.port.mock.advance(4);
    const run = await create(bob, runAttrs(ZONE));
    await create(bob, runAttrs(OTHER));
    const r = await engine.tick();
    expect(r.fired).toBe(1);
    expect(w.pushes).toHaveLength(1);
    expect(w.pushes[0]).toMatchObject({ title: 'Someone is heading here', body: `Run to ${ZONE}, 3 slots`, href: '/board', entity: run, event: 'created', trigger: trig });

    await engine.tick();
    w.port.mock.advance(10);
    await engine.tick();
    expect(w.pushes).toHaveLength(1);

    const receipts = await listFiringsFor(w.port, [trig]);
    expect(receipts).toHaveLength(1);
    const f = receipts[0]!;
    expect(f).toMatchObject({ trigger: trig, entity: run, event: 'created', outcome: 'delivered', creator: WORKER, at: T0 + 6 });
    expect(f.block).toBe(BigInt(Math.floor((T0 + 6) / 2)));
    // Raw attributes are exactly the spec's.
    const raw = await w.port.get(f.key);
    expect(raw?.readonly).toBe(true);
    expect(raw?.attributes).toMatchObject({
      project: { type: 'str', value: TRIGGERS_PROJECT },
      type: { type: 'str', value: 'firing' },
      trigger: { type: 'key', value: trig },
      entity: { type: 'key', value: run },
      event: { type: 'str', value: 'created' },
      outcome: { type: 'str', value: 'delivered' },
    });
    expect(raw!.expiresAt - raw!.createdAt).toBe(30 * 24 * 3600);
  });

  it('created: a trigger picked up late still fires for entities created after it', async () => {
    const engine = w.engine();
    await engine.tick(); // nothing yet
    const trig = await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'created',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.str('dest_zone', ZONE)] },
    });
    w.port.mock.advance(2);
    const run = await create(w.as(BOB), runAttrs(ZONE));
    await engine.tick(); // first time the engine sees the trigger AND the run
    expect(w.pushes.map((p) => [p.trigger, p.entity])).toEqual([[trig, run]]);
  });

  it('patched: fires when the run gets at_gate (not on unrelated patches), once', async () => {
    const bob = w.as(BOB);
    const run = await create(bob, runAttrs(ZONE));
    w.port.mock.advance(2);
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'patched',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.key('$key', run), pred.gte('at_gate', val.u64(1))] },
      label: 'At the gate',
    });
    const engine = w.engine();
    await engine.tick();
    w.port.mock.advance(30);
    await bob.write((wr) => wr.patch(run, { capacity_left: val.i32(2) }));
    await engine.tick();
    expect(w.pushes).toHaveLength(0);

    w.port.mock.advance(30);
    await bob.write((wr) => wr.patch(run, { at_gate: val.u64(T0 + 62) }));
    await engine.tick();
    expect(w.pushes).toHaveLength(1);
    expect(w.pushes[0]).toMatchObject({ title: 'At the gate', event: 'patched', entity: run });

    await bob.write((wr) => wr.patch(run, { capacity_left: val.i32(1) }));
    await engine.tick();
    expect(w.pushes).toHaveLength(1); // at most once per (trigger, entity, event)
  });

  it('patched: attribute change of a watched entity fires', async () => {
    const bob = w.as(BOB);
    const run = await create(bob, runAttrs(ZONE));
    w.port.mock.advance(2);
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'patched',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.key('$key', run)] },
    });
    const engine = w.engine();
    await engine.tick();
    await engine.tick();
    expect(w.pushes).toHaveLength(0);
    await bob.write((wr) => wr.patch(run, { capacity_left: val.i32(2) }));
    await engine.tick();
    expect(w.pushes).toHaveLength(1);
  });

  it('expiring: fires once within the lead window', async () => {
    const run = await create(w.as(BOB), runAttrs(ZONE), 600);
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'expiring',
      lead: 120,
      action: 'push',
      channel: alicePush,
      match: { where: [pred.key('$key', run)] },
    });
    const engine = w.engine();
    await engine.tick();
    w.port.mock.advance(400); // 200 s left
    await engine.tick();
    expect(w.pushes).toHaveLength(0);
    w.port.mock.advance(90); // 110 s left
    await engine.tick();
    expect(w.pushes).toHaveLength(1);
    w.port.mock.advance(20);
    await engine.tick();
    expect(w.pushes).toHaveLength(1);
  });

  it('expired: fires after expiry', async () => {
    const run = await create(w.as(BOB), runAttrs(ZONE), 300);
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'expired',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.str('dest_zone', ZONE)] },
    });
    const engine = w.engine();
    await engine.tick();
    w.port.mock.advance(200);
    await engine.tick();
    expect(w.pushes).toHaveLength(0);
    w.port.mock.advance(200);
    await engine.tick();
    expect(w.pushes.map((p) => [p.event, p.entity])).toEqual([['expired', run]]);
    await engine.tick();
    expect(w.pushes).toHaveLength(1);
  });

  it('deleted: fires when the owner deletes (cancels) the entity, not on expiry', async () => {
    const bob = w.as(BOB);
    const a = await create(bob, runAttrs(ZONE), 3600);
    const b = await create(bob, runAttrs(ZONE), 100);
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'deleted',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.str('dest_zone', ZONE)] },
    });
    const engine = w.engine();
    await engine.tick();
    await bob.write((wr) => wr.remove(a));
    w.port.mock.advance(200); // b expires
    await engine.tick();
    expect(w.pushes.map((p) => [p.event, p.entity])).toEqual([['deleted', a]]);
    expect(b).toBeTruthy();
  });

  it('deleted: an entity that merely stops matching is not "deleted"', async () => {
    const bob = w.as(BOB);
    const run = await create(bob, runAttrs(ZONE));
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'deleted',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.gt('capacity_left', val.i32(0))] },
    });
    const engine = w.engine();
    await engine.tick();
    await bob.write((wr) => wr.patch(run, { capacity_left: val.i32(0) }));
    await engine.tick();
    expect(w.pushes).toHaveLength(0);
  });

  it('unless: a matching guard suppresses the firing (no action, no receipt)', async () => {
    const bob = w.as(BOB);
    const request = await create(w.as(ALICE), attrs('request', { dest_zone: val.str(ZONE) }));
    const accept = await create(bob, attrs('accept', { request: val.key(request) }), 600);
    const accept2 = await create(bob, attrs('accept', { request: val.key(keccak256(stringToHex('other'))) }), 600);
    const guard = (r: EntityKey) => ({ project: 'bhaiyaplease', type: 'delivery', where: [pred.key('request', r)], creator: BOB });
    const t1 = await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'accept',
      on: 'expiring',
      lead: 90,
      action: 'push',
      channel: alicePush,
      match: { where: [pred.key('$key', accept)], creator: BOB },
      unless: guard(request),
    });
    const t2 = await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'accept',
      on: 'expiring',
      lead: 90,
      action: 'push',
      channel: alicePush,
      match: { where: [pred.key('$key', accept2)], creator: BOB },
      unless: guard(keccak256(stringToHex('other'))),
    });
    await create(bob, attrs('delivery', { request: val.key(request) }));
    const engine = w.engine();
    w.port.mock.advance(530);
    const r = await engine.tick();
    expect(r.suppressed).toBe(1);
    expect(w.pushes.map((p) => p.trigger)).toEqual([t2]);
    await engine.tick();
    expect(w.pushes).toHaveLength(1);
    expect(await listFiringsFor(w.port, [t1])).toHaveLength(0);
    expect(await listFiringsFor(w.port, [t2])).toHaveLength(1);
  });

  it('idempotent across restarts: persisted seen set, and the on-chain receipt lookup with a fresh store', async () => {
    const run = await create(w.as(BOB), runAttrs(ZONE), 600);
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'expiring',
      lead: 120,
      action: 'push',
      channel: alicePush,
      match: { where: [pred.key('$key', run)] },
    });
    w.port.mock.advance(500);
    const e1 = w.engine();
    await e1.tick();
    await e1.stop();
    expect(w.pushes).toHaveLength(1);

    const e2 = w.engine(); // same persisted store
    await e2.tick();
    expect(w.pushes).toHaveLength(1);
    expect(w.store.state?.seen).toBeTruthy();

    const e3 = w.engine({ store: createMemoryStore() }); // state lost: the chain receipt still prevents a refire
    const r = await e3.tick();
    expect(r.fired).toBe(0);
    expect(w.pushes).toHaveLength(1);
  });

  it('attest: runs the plugin, writes its entity in the same batch and links it from the receipt', async () => {
    const accept = await create(w.as(BOB), attrs('accept', { request: val.key(keccak256(stringToHex('req'))) }), 600);
    const seen: { block: bigint; params: Record<string, string> }[] = [];
    const plugin: AttestPlugin = async (_port, ctx) => {
      seen.push({ block: ctx.block, params: ctx.params });
      return {
        attributes: attrs('evidence', { accept: val.key(ctx.entity.key), block: val.u64(ctx.block) }),
        payload: '{}',
        readonly: true,
        permissionlessExtension: false,
        expiresInSeconds: 180 * 24 * 3600,
      };
    };
    const trig = await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'accept',
      on: 'expiring',
      lead: 90,
      action: 'attest',
      attester: 'test.evidence',
      params: { reason: 'no_show' },
      match: { where: [pred.key('$key', accept)] },
    });
    const engine = w.engine({ plugins: { 'test.evidence': plugin } });
    w.port.mock.advance(520);
    await engine.tick();
    expect(seen).toEqual([{ block: BigInt(Math.floor((T0 + 520) / 2)), params: { reason: 'no_show' } }]);
    const [f] = await listFiringsFor(w.port, [trig]);
    expect(f?.outcome).toBe('attested');
    expect(f?.attestation).toMatch(/^0x[0-9a-f]{64}$/);
    const ev = await w.port.get(f!.attestation!);
    expect(ev?.creator).toBe(WORKER);
    expect(ev?.attributes.type?.value).toBe('evidence');
    expect(ev?.attributes.accept?.value).toBe(accept);
  });

  it('push: skipped (with a receipt) when the trigger creator does not own the channel', async () => {
    const run = await create(w.as(BOB), runAttrs(ZONE), 600);
    const trig = await subscribe(w.as(MALLORY), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'expiring',
      lead: 120,
      action: 'push',
      channel: alicePush, // Alice's channel id
      worker: WORKER,
      match: { where: [pred.key('$key', run)] },
    });
    w.port.mock.advance(500);
    await w.engine().tick();
    expect(w.pushes).toHaveLength(0);
    const [f] = await listFiringsFor(w.port, [trig]);
    expect(f).toMatchObject({ outcome: 'skipped', detail: 'channel owner mismatch' });
  });

  it('a malformed trigger is ignored without breaking the others', async () => {
    const bob = w.as(BOB);
    const run = await create(bob, runAttrs(ZONE), 600);
    const mallory = w.as(MALLORY);
    const trigBase = { project: val.str(TRIGGERS_PROJECT), type: val.str('trigger') };
    // Garbage payload, push without channel, unknown event, bad match predicate.
    await create(mallory, { ...trigBase, watch_project: val.str('bhaiyaplease'), watch_type: val.str('run'), on: val.str('expiring'), action: val.str('push'), channel: val.bytes32(alicePush), worker: val.addr('0x0000000000000000000000000000000000000000') });
    await mallory.write((wr) =>
      wr.create({
        attributes: { ...trigBase, watch_project: val.str('bhaiyaplease'), watch_type: val.str('run'), on: val.str('explode'), action: val.str('push'), channel: val.bytes32(alicePush), worker: val.addr('0x0000000000000000000000000000000000000000') },
        payload: JSON.stringify({ match: { where: [] } }),
        readonly: false,
        permissionlessExtension: false,
        expiresInSeconds: 3600,
      }),
    );
    await mallory.write((wr) =>
      wr.create({
        attributes: { ...trigBase, watch_project: val.str('bhaiyaplease'), watch_type: val.str('run'), on: val.str('expiring'), action: val.str('push'), channel: val.bytes32(alicePush), worker: val.addr('0x0000000000000000000000000000000000000000') },
        payload: JSON.stringify({ match: { where: [{ op: 'eq', name: 'Bad Name', value: { type: 'str', value: 'x' } }] } }),
        readonly: false,
        permissionlessExtension: false,
        expiresInSeconds: 3600,
      }),
    );
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'expiring',
      lead: 120,
      action: 'push',
      channel: alicePush,
      match: { where: [pred.key('$key', run)] },
    });
    const engine = w.engine();
    w.port.mock.advance(500);
    const r = await engine.tick();
    expect(r.triggers).toBe(1);
    expect(r.errors).toBe(0);
    expect(w.pushes).toHaveLength(1);
  });

  it('a failing watch query or action does not stop other triggers', async () => {
    const run = await create(w.as(BOB), runAttrs(ZONE), 600);
    const base = {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'expiring' as const,
      lead: 120,
      action: 'push' as const,
      channel: alicePush,
    };
    await subscribe(w.as(ALICE), { ...base, match: { where: [pred.key('$key', run)] } });
    await subscribe(w.as(ALICE), { ...base, match: { where: [pred.str('dest_zone', 'boom')] } });
    let calls = 0;
    const flaky = wrapPort(w.port, {
      query: async (q) => {
        if (q.where.some((p) => p.op === 'eq' && p.value.type === 'str' && p.value.value === 'boom')) {
          calls++;
          throw Object.assign(new Error('rpc down'), { code: 'NETWORK', retryable: true });
        }
        return w.port.query(q);
      },
    });
    const engine = createTriggerEngine({
      port: flaky,
      workerAddress: WORKER,
      actions: {
        channels: w.channels,
        push: { send: async () => { throw new Error('push service exploded'); } },
      },
      triggerRefreshMs: 0,
      flushMs: 0,
    });
    w.port.mock.advance(500);
    const r = await engine.tick();
    expect(calls).toBe(1);
    expect(r.errors).toBe(1);
    expect(r.fired).toBe(1);
    const fs = await w.port.query({ where: [pred.str('project', TRIGGERS_PROJECT), pred.str('type', 'firing')] });
    expect(fs.map((x) => decodeFiring(x)?.outcome)).toEqual(['failed']);
  });

  it('batches receipts: at most 20 creates per tx', async () => {
    const bob = w.as(BOB);
    await subscribe(w.as(ALICE), {
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'created',
      action: 'push',
      channel: alicePush,
      match: { where: [pred.str('dest_zone', ZONE)] },
    });
    const engine = w.engine();
    await engine.tick();
    w.port.mock.advance(2);
    for (let i = 0; i < 25; i++) await create(bob, runAttrs(ZONE));
    let batches = 0;
    let maxCreates = 0;
    const counting = wrapPort(w.port, {
      write: (fn) =>
        w.port.write((wr) =>
          fn({
            ...wr,
            address: wr.address,
            batch: async (ops) => {
              batches++;
              maxCreates = Math.max(maxCreates, ops.creates?.length ?? 0);
              return wr.batch(ops);
            },
          }),
        ),
    });
    const e2 = createTriggerEngine({
      port: counting,
      workerAddress: WORKER,
      actions: { channels: w.channels, push: createCallbackPushSender(() => undefined) },
      store: w.store,
      triggerRefreshMs: 0,
      flushMs: 0,
    });
    void engine;
    const r = await e2.tick();
    expect(r.fired).toBe(25);
    expect(batches).toBe(2);
    expect(maxCreates).toBe(20);
  });
});
