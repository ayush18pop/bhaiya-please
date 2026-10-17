import { buildTriggerSpec, createMemoryStore, createTriggerEngine, listFiringsFor, pred } from '@arkiv-triggers/core';
import type { Address, EntityKey } from '@arkiv-triggers/core';
import { createMockBhaiyaPlease, DEMO_ZONES } from '@bhaiya-please/core/mock';
import { keccak256, stringToHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { defaultPlugins, NOSHOW_ATTESTER } from '../src/plugins';

const T0 = 1_790_000_000;
const a = (n: string) => `0x${keccak256(stringToHex(`worker-test:${n}`)).slice(-40)}` as Address;
const RUNNER = a('runner');
const RESIDENT = a('resident');
const WORKER = a('worker');
const HOME = DEMO_ZONES[0]!.zone6;
const NORTH = DEMO_ZONES[1]!.zone6;

async function scenario(deliver: boolean) {
  const core = createMockBhaiyaPlease({ seed: false, latencyMs: 0, now: () => T0, address: RESIDENT });
  const as = (x: Address) => (core.dev.setAddress(x), core);
  const shop = (await as(RESIDENT).listShop({ zone: NORTH, category: 'grocery', nameTag: 'Test Provisions' })).key;
  const run = await as(RUNNER).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
  const req = await as(RESIDENT).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 100, tip: 0 });
  const acc = await as(RUNNER).acceptRequest(req.key);
  if (deliver) await as(RUNNER).recordDelivery({ secret: req.secret });

  // The resident subscribes (docs/TRIGGERS.md §4).
  const spec = buildTriggerSpec({
    watchProject: 'bhaiyaplease',
    watchType: 'accept',
    on: 'expiring',
    lead: 90,
    action: 'attest',
    attester: NOSHOW_ATTESTER,
    params: { request: req.key },
    worker: WORKER,
    match: { where: [pred.key('request', req.key)], creator: RUNNER },
    unless: { project: 'bhaiyaplease', type: 'delivery', where: [pred.key('request', req.key)], creator: RUNNER },
    expiresInSeconds: 6 * 3600,
  });
  const residentPort = core.dev.port(RESIDENT);
  const trig = await residentPort.write(async (w) => (await w.batch({ creates: [spec] })).created[0] as EntityKey);

  const port = core.dev.port(WORKER);
  const engine = createTriggerEngine({ port, workerAddress: WORKER, plugins: defaultPlugins(), store: createMemoryStore(), triggerRefreshMs: 0, flushMs: 0 });
  await engine.tick();
  const accept = await port.get(acc.key);
  core.dev.advance(accept!.expiresAt - core.dev.now() - 60);
  const report = await engine.tick();
  return { core, port, trig, report, request: req.key };
}

describe('bhaiyaplease.noshow attester', () => {
  it('writes verifiable noshow evidence and links it from the receipt', async () => {
    const { core, port, trig, request } = await scenario(false);
    const [f] = await listFiringsFor(port, [trig]);
    expect(f).toMatchObject({ outcome: 'attested', creator: WORKER, event: 'expiring' });
    const ns = await core.getNoShowForRequest(request);
    expect(ns?.valid).toBe(true);
    expect(ns?.noshow.key).toBe(f!.attestation);
    expect(ns?.noshow.creator).toBe(WORKER);
    expect(await core.verifyNoShow(ns!.noshow)).toEqual({ valid: true });
  });

  it('a delivery suppresses it (unless guard): no evidence, no receipt', async () => {
    const { core, port, trig, report, request } = await scenario(true);
    expect(report.suppressed).toBe(1);
    expect(await listFiringsFor(port, [trig])).toHaveLength(0);
    expect(await core.getNoShowForRequest(request)).toBeNull();
  });
});
