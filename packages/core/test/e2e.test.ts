import { describe, expect, it } from 'vitest';
import { decodeHandoffQR, encodeHandoffQR } from '../src/codec/handoff';
import { createMockBhaiyaPlease, mockAddressOf, PERSONA } from '../src/mock';
import type { ChangeEvent } from '../src/types';
import { addr, HOME, listShop, makeWorld, NORTH } from './helpers';

const runner = addr('runner');
const residents = [addr('res-a'), addr('res-b'), addr('res-c')] as const;

describe('end-to-end on the mock (shared services)', () => {
  it('attest → announce → request → accept (capacity) → delivery → receipt → profile +1', async () => {
    const w = makeWorld();
    const shop = await listShop(w, residents[0]);
    const events: ChangeEvent[] = [];
    const unsubscribe = w.as(residents[0]).subscribe({ destZone: HOME }, (e) => events.push(e));

    // Verifier attests → runner becomes Verified (2 per run, ₹500).
    await w.as(w.verifier).issueAttestation({ subject: runner, level: 'id_checked' });
    expect((await w.as(residents[0]).getProfile(runner)).tier.name).toBe('verified');

    // Runner announces; desired capacity 3 is clamped to 2.
    const { key: runKey } = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 3, note: 'via market' });
    const live = await w.as(residents[0]).getLiveRuns(HOME);
    expect(live.map((r) => [r.key, r.capacityLeft])).toEqual([[runKey, 2]]);
    expect(await w.as(runner).getMyRuns()).toHaveLength(1);

    // Three residents post (posting does not consume capacity).
    const posted = [];
    for (const r of residents) {
      posted.push(await w.as(r).postRequest({ runKey, shopKey: shop, items: ['1 L milk'], maxPrice: 400, tip: 20 }));
    }
    expect(await w.as(runner).getRequestsForRun(runKey)).toHaveLength(3);
    expect((await w.as(residents[0]).getMyRequests()).map((q) => q.key)).toEqual([posted[0]!.key]);

    // Accept two: capacity 2 → 1 → 0; the run leaves the live board; the third is rejected.
    await w.as(runner).acceptRequest(posted[0]!.key);
    expect((await w.as(runner).getRun(runKey))?.capacityLeft).toBe(1);
    await expect(w.as(runner).acceptRequest(posted[0]!.key)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await w.as(runner).acceptRequest(posted[1]!.key);
    expect((await w.as(runner).getRun(runKey))?.capacityLeft).toBe(0);
    expect(await w.as(residents[2]).getLiveRuns(HOME)).toEqual([]);
    await expect(w.as(runner).acceptRequest(posted[2]!.key)).rejects.toMatchObject({ code: 'CAPACITY_EXHAUSTED' });
    await expect(
      w.as(addr('late')).postRequest({ runKey, shopKey: shop, items: ['Eggs'], maxPrice: 50, tip: 0 }),
    ).rejects.toMatchObject({ code: 'CAPACITY_EXHAUSTED' });
    expect((await w.as(residents[0]).getAcceptForRequest(posted[0]!.key))?.rider).toBe(runner);
    expect(await w.as(residents[2]).getAcceptForRequest(posted[2]!.key)).toBeNull();

    // Only the accepted runner may deliver; the QR round-trips the secret.
    const scanned = decodeHandoffQR(encodeHandoffQR(posted[0]!.secret));
    await expect(w.as(addr('thief')).recordDelivery({ secret: scanned })).rejects.toMatchObject({ code: 'NOT_OWNER' });
    const { key: deliveryKey } = await w.as(runner).recordDelivery({ secret: scanned });
    await expect(w.as(runner).recordDelivery({ secret: scanned })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect((await w.as(addr('anyone')).verifyDelivery(deliveryKey)).valid).toBe(true);
    expect((await w.as(residents[0]).getDeliveryForRequest(posted[0]!.key))?.key).toBe(deliveryKey);

    // Receipt: one atomic batch; owner = runner, creator = resident; request extended to ~1 y.
    const before = await w.as(addr('viewer')).getProfile(runner);
    await expect(w.as(residents[1]).issueReceipt({ deliveryKey, tags: [] })).rejects.toMatchObject({ code: 'NOT_OWNER' });
    const receipt = await w.as(residents[0]).issueReceipt({ deliveryKey, tags: ['on_time', 'exact_item'] });
    expect(receipt.path).toBe('batch');
    const inspected = await w.as(addr('viewer')).inspect(receipt.key);
    expect(inspected).toMatchObject({ type: 'receipt', owner: runner, creator: residents[0], readonly: true });
    const after = await w.as(addr('viewer')).getProfile(runner);
    expect(after.receiptsTotal).toBe(before.receiptsTotal + 1);
    expect(after.distinctResidents).toBe(before.distinctResidents + 1);
    expect(after.tagCounts).toEqual({ on_time: 1, exact_item: 1 });
    const req = await w.as(addr('viewer')).getRequest(posted[0]!.key);
    expect(req!.expiresAt - w.chain.now()).toBeGreaterThan(364 * 86400);

    // Runner renews the receipt it owns; the resident cannot.
    await expect(w.as(residents[0]).extendReceipt(receipt.key)).rejects.toMatchObject({ code: 'NOT_OWNER' });
    w.chain.advance(3600);
    await w.as(runner).extendReceipt(receipt.key);

    // Live events reached the resident's filtered subscription (run created + patched).
    await new Promise((r) => setTimeout(r, 0));
    expect(events.some((e) => e.kind === 'created' && e.type === 'run' && e.key === runKey)).toBe(true);
    expect(events.some((e) => e.kind === 'patched' && e.key === runKey)).toBe(true);
    unsubscribe();

    // Expiry: no event; the run vanishes from reads after eta + 10 min, the receipt stays verifiable.
    w.chain.advance(45 * 60);
    expect(await w.as(runner).getRun(runKey)).toBeNull();
    expect((await w.as(addr('viewer')).getProfile(runner)).receiptsTotal).toBe(1);
  });

  it("falls back to 'two_tx' when the chain rejects same-batch transfer", async () => {
    const w = makeWorld({ chain: { rejectSameBatchTransfer: true } });
    const shop = await listShop(w, residents[0]);
    const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(residents[0]).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 100, tip: 0 });
    await w.as(runner).acceptRequest(req.key);
    const d = await w.as(runner).recordDelivery({ secret: req.secret });
    const r = await w.as(residents[0]).issueReceipt({ deliveryKey: d.key, tags: ['polite'] });
    expect(r.path).toBe('two_tx');
    expect(r.txHashes).toHaveLength(2);
    expect(w.chain.get(r.key)).toMatchObject({ owner: runner, creator: residents[0] });
    expect((await w.as(addr('viewer')).getProfile(runner)).receiptsTotal).toBe(1);
  });

  it("receiptMode 'batch' surfaces the rejection instead of falling back", async () => {
    const w = makeWorld({ receiptMode: 'batch', chain: { rejectSameBatchTransfer: true } });
    const shop = await listShop(w, residents[0]);
    const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(residents[0]).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 100, tip: 0 });
    await w.as(runner).acceptRequest(req.key);
    const d = await w.as(runner).recordDelivery({ secret: req.secret });
    await expect(w.as(residents[0]).issueReceipt({ deliveryKey: d.key, tags: [] })).rejects.toMatchObject({ code: 'BATCH_FAILED' });
  });

  it('transferAllReceipts moves reputation to a new wallet', async () => {
    const w = makeWorld();
    const shop = await listShop(w, residents[0]);
    const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(residents[0]).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 100, tip: 0 });
    await w.as(runner).acceptRequest(req.key);
    const d = await w.as(runner).recordDelivery({ secret: req.secret });
    await w.as(residents[0]).issueReceipt({ deliveryKey: d.key, tags: [] });
    const fresh = addr('fresh');
    await w.as(runner).transferAllReceipts(fresh);
    expect((await w.as(addr('v')).getProfile(fresh)).receiptsTotal).toBe(1);
    expect((await w.as(addr('v')).getProfile(runner)).receiptsTotal).toBe(0);
  });

  it('mock latency defaults to ~1.2 s per write (UI pending states)', async () => {
    const m = createMockBhaiyaPlease({ seed: false, address: mockAddressOf(PERSONA.runnerNew) });
    const t0 = Date.now();
    await m.announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 10, capacity: 1 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1100);
    m.close();
  });
});
