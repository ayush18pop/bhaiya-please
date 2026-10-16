import { describe, expect, it } from 'vitest';
import { encode } from '../src/codec/entities';
import { computeCodeCommit } from '../src/codec/handoff';
import { computeProfile, tierFor } from '../src/services/reputation';
import { BhaiyaPleaseError, PROJECT_TAG, TIERS } from '../src/types';
import type { Address, Complaint, EntityKey, Hex, Receipt, VerifiedReceipt } from '../src/types';
import { addr, createSpec, handoff, HOME, listShop, makeWorld, NORTH } from './helpers';
import type { World } from './helpers';

const P = PROJECT_TAG;
const DAY = 86_400;
const runner = addr('runner');
const resident = addr('resident');
const stranger = addr('stranger');

async function attest(w: World, subject: Address, by: Address = w.verifier) {
  return w.as(by).issueAttestation({ subject, level: 'id_checked' });
}

/** Forge a receipt for `delivery` as `creator`, transferred to `to`. */
async function forgeReceipt(w: World, creator: Address, delivery: EntityKey, rider: Address, to: Address = rider) {
  return w.raw(creator, async (x) => {
    const [p] = await x.predictKeys(1);
    const spec = createSpec(encode.receipt(P, { rider, delivery, zone: HOME, at: w.chain.now(), tags: ['on_time'] }), 365 * DAY);
    const r = await x.batch({ creates: [{ ...spec, salt: p!.salt }], ...(to !== creator ? { transfers: [{ key: p!.key, to }] } : {}) });
    return r.created[0]!;
  });
}

describe('receipt verification', () => {
  it('a legit handoff counts once, with distinct resident and tags', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    await handoff(w, runner, resident, shop, ['polite']);
    const p = await w.as(stranger).getProfile(runner);
    expect(p).toMatchObject({ receiptsTotal: 1, distinctResidents: 1, receipts30d: 1, invalidReceipts: 0, tagCounts: { polite: 1 } });
  });

  it('receipt forged by a non-requester is invalid (creator_not_requester)', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const h = await handoff(w, runner, resident, shop);
    const forged = await forgeReceipt(w, stranger, h.delivery, runner);
    const list = await w.as(stranger).getReceiptsFor(runner);
    expect(list.find((r) => r.receipt.key === forged)).toMatchObject({ valid: false, reason: 'creator_not_requester' });
    const p = await w.as(stranger).getProfile(runner);
    expect(p.receiptsTotal).toBe(1);
    expect(p.invalidReceipts).toBe(1);
  });

  it('a second receipt for the same handoff is a duplicate and not counted', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const h = await handoff(w, runner, resident, shop);
    // The service refuses...
    await expect(w.as(resident).issueReceipt({ deliveryKey: h.delivery, tags: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    // ...and a raw duplicate is ignored by every viewer.
    w.chain.advance(10);
    const dup = await forgeReceipt(w, resident, h.delivery, runner);
    const list = await w.as(stranger).getReceiptsFor(runner);
    expect(list.find((r) => r.receipt.key === dup)).toMatchObject({ valid: false, reason: 'duplicate' });
    expect((await w.as(stranger).getProfile(runner)).receiptsTotal).toBe(1);
  });

  it('repeat customers count as one distinct resident', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    for (let i = 0; i < 3; i++) await handoff(w, runner, resident, shop);
    const p = await w.as(stranger).getProfile(runner);
    expect(p.receiptsTotal).toBe(3);
    expect(p.distinctResidents).toBe(1);
  });

  it('self-dealing: a runner faking the whole chain for itself is rejected', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const fakeRun = `0x${'99'.repeat(32)}` as EntityKey;
    const salt = `0x${'07'.repeat(16)}` as Hex;
    const requestKey = await w.raw(runner, async (x) => {
      const [p] = await x.predictKeys(1);
      const s = encode.request(P, { run: fakeRun, shop, destZone: HOME, maxPrice: 1, tip: 0, codeCommit: computeCodeCommit('1111', salt, p!.key), items: ['x'] });
      return (await x.create({ ...createSpec(s, 365 * DAY), salt: p!.salt })).key;
    });
    const delivery = await w.raw(runner, async (x) =>
      (await x.create(createSpec(encode.delivery(P, { request: requestKey, rider: runner, resident: runner, zone: HOME, code: '1111', salt }), 365 * DAY))).key,
    );
    const receipt = await forgeReceipt(w, runner, delivery, runner);
    const list = await w.as(stranger).getReceiptsFor(runner);
    expect(list.find((r) => r.receipt.key === receipt)).toMatchObject({ valid: false, reason: 'self_dealing' });
  });

  it('a delivery whose reveal does not hash to the commit is rejected (reveal_mismatch)', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(resident).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 50, tip: 0 });
    await w.as(runner).acceptRequest(req.key);
    const wrong = req.secret.code === '0000' ? '0001' : '0000';
    await expect(w.as(runner).recordDelivery({ secret: { ...req.secret, code: wrong } })).rejects.toMatchObject({ code: 'INVALID_REVEAL' });
    const fake = await w.raw(runner, async (x) =>
      (await x.create(createSpec(encode.delivery(P, { request: req.key, rider: runner, resident, zone: HOME, code: wrong, salt: req.secret.salt }), 365 * DAY))).key,
    );
    expect(await w.as(stranger).verifyDelivery(fake)).toMatchObject({ valid: false, reason: 'reveal_mismatch' });
    await expect(w.as(resident).issueReceipt({ deliveryKey: fake, tags: [] })).rejects.toMatchObject({ code: 'INVALID_REVEAL' });
    // Brute-force hint: same code with a different salt also fails.
    expect(computeCodeCommit(req.secret.code, `0x${'00'.repeat(16)}` as Hex, req.key)).not.toBe(
      (await w.as(stranger).getRequest(req.key))!.codeCommit,
    );
  });

  it('a delivery written by someone other than its declared rider is rejected (rider_mismatch)', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(resident).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 50, tip: 0 });
    const d = await w.raw(stranger, async (x) =>
      (await x.create(createSpec(encode.delivery(P, { request: req.key, rider: runner, resident, zone: HOME, ...req.secret }), 365 * DAY))).key,
    );
    expect(await w.as(resident).verifyDelivery(d)).toMatchObject({ valid: false, reason: 'rider_mismatch' });
    expect(await w.as(resident).getDeliveryForRequest(req.key)).toBeNull();
  });
});

describe('attestations', () => {
  it('only trusted verifiers count; expired attestations do not', async () => {
    const w = makeWorld();
    await attest(w, runner, stranger);
    let p = await w.as(resident).getProfile(runner);
    expect(p.attestations).toHaveLength(1);
    expect(p.attestations[0]!.trusted).toBe(false);
    expect(p.verified).toBe(false);
    expect(p.tier.name).toBe('new');

    await attest(w, runner);
    p = await w.as(resident).getProfile(runner);
    expect(p.verified).toBe(true);
    expect(p.tier).toEqual(TIERS[1]);

    w.chain.advance(181 * DAY);
    p = await w.as(resident).getProfile(runner);
    expect(p.attestations).toHaveLength(0);
    expect(p.verified).toBe(false);
  });

  it('revocation by the verifier removes verification; others cannot revoke', async () => {
    const w = makeWorld();
    const { key } = await attest(w, runner);
    await expect(w.as(stranger).revokeAttestation(key)).rejects.toMatchObject({ code: 'NOT_OWNER' });
    await w.as(w.verifier).revokeAttestation(key);
    expect((await w.as(resident).getProfile(runner)).verified).toBe(false);
    expect(await w.as(w.verifier).getMyIssuedAttestations()).toEqual([]);
  });

  it('successor attestation carries the old wallet receipts over', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    await handoff(w, runner, resident, shop);
    const fresh = addr('runner-new-key');
    await w.as(w.verifier).issueAttestation({ subject: fresh, level: 'successor', prev: runner });
    const p = await w.as(stranger).getProfile(fresh);
    expect(p.receiptsTotal).toBe(1);
    await expect(w.as(w.verifier).issueAttestation({ subject: fresh, level: 'successor' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('complaints', () => {
  it('drive-by complaints (not the requester) are ignored; requester complaints count', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const h = await handoff(w, runner, resident, shop);
    await expect(w.as(stranger).fileComplaint({ requestKey: h.request, rider: runner, reason: 'rude' })).rejects.toMatchObject({
      code: 'NOT_OWNER',
    });
    await w.raw(stranger, (x) => x.create(createSpec(encode.complaint(P, { rider: runner, request: h.request, reason: 'rude', at: 1 }), 180 * DAY)));
    expect(await w.as(resident).getComplaintsAgainst(runner)).toHaveLength(0);

    await w.as(resident).fileComplaint({ requestKey: h.request, rider: runner, reason: 'wrong_item' });
    const list = await w.as(stranger).getComplaintsAgainst(runner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'wrong_item', creator: resident });
    await expect(w.as(resident).fileComplaint({ requestKey: h.request, rider: runner, reason: 'rude' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect((await w.as(stranger).getProfile(runner)).complaints30d).toBe(1);
  });

  it('complaint keeps the request alive (180 d) and survives past the run', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(resident).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 50, tip: 0 });
    // No delivery yet: no on-chain evidence the runner served this request.
    await expect(w.as(resident).fileComplaint({ requestKey: req.key, rider: runner, reason: 'no_show' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await w.as(runner).acceptRequest(req.key);
    await w.as(runner).recordDelivery({ secret: req.secret });
    await w.as(resident).fileComplaint({ requestKey: req.key, rider: runner, reason: 'wrong_item' });
    w.chain.advance(100 * DAY);
    expect(await w.as(stranger).getComplaintsAgainst(runner)).toHaveLength(1);
    expect(await w.as(stranger).getComplaintsAgainst(runner, w.chain.now() - DAY)).toHaveLength(0);
  });

  it('a resident cannot complain about a rider who never delivered their request (drive-by with own request)', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    // The attacker's own request, on some other runner's run.
    const other = addr('other-runner');
    const run = await w.as(other).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(stranger).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 50, tip: 0 });
    await expect(w.as(stranger).fileComplaint({ requestKey: req.key, rider: runner, reason: 'rude' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    // Raw complaints (bypassing the service) are ignored by every viewer.
    for (const reason of ['rude', 'no_show', 'wrong_item'] as const) {
      await w.raw(stranger, (x) => x.create(createSpec(encode.complaint(P, { rider: runner, request: req.key, reason, at: 1 }), 180 * DAY)));
    }
    expect(await w.as(resident).getComplaintsAgainst(runner)).toHaveLength(0);
    expect((await w.as(resident).getProfile(runner)).complaints30d).toBe(0);
  });
});

describe('readonly enforcement', () => {
  it('a receipt created without the readonly flag is not counted', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const h = await handoff(w, runner, resident, shop);
    // Second request + delivery so the mutable receipt is not just a duplicate.
    const h2run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
    const req = await w.as(resident).postRequest({ runKey: h2run.key, shopKey: shop, items: ['Eggs'], maxPrice: 50, tip: 0 });
    await w.as(runner).acceptRequest(req.key);
    const d = await w.as(runner).recordDelivery({ secret: req.secret });
    const mutable = await w.raw(resident, async (x) => {
      const [p] = await x.predictKeys(1);
      const spec = { ...createSpec(encode.receipt(P, { rider: runner, delivery: d.key, zone: HOME, at: 1, tags: [] }), 365 * DAY), readonly: false };
      return (await x.batch({ creates: [{ ...spec, salt: p!.salt }], transfers: [{ key: p!.key, to: runner }] })).created[0]!;
    });
    const list = await w.as(stranger).getReceiptsFor(runner);
    expect(list.find((r) => r.receipt.key === mutable)).toMatchObject({ valid: false, reason: 'not_readonly' });
    expect(list.find((r) => r.receipt.key === h.receipt)).toMatchObject({ valid: true });
  });

  it('a mutable attestation from a trusted verifier does not verify', async () => {
    const w = makeWorld();
    await w.raw(w.verifier, (x) =>
      x.create({ ...createSpec(encode.attestation(P, { subject: runner, level: 'id_checked', at: 1 }), 180 * DAY), readonly: false }),
    );
    const p = await w.as(stranger).getProfile(runner);
    expect(p.attestations[0]!.trusted).toBe(false);
    expect(p.verified).toBe(false);
  });
});

describe('30-day window', () => {
  it('uses $createdAt and excludes older receipts from the window only', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    await handoff(w, runner, resident, shop);
    w.chain.advance(25 * DAY);
    await w.as(resident).confirmShopOpen(shop);
    w.chain.advance(6 * DAY);
    await handoff(w, runner, addr('resident-2'), shop);
    const p = await w.as(stranger).getProfile(runner);
    expect(p.receiptsTotal).toBe(2);
    expect(p.receipts30d).toBe(1);
    expect(p.distinctResidents).toBe(2);
    expect(p.distinctResidents30d).toBe(1);
  });
});

describe('tier rule (pure)', () => {
  const R = addr('r');
  const mkReceipt = (i: number, creator: Address, createdAt: number): VerifiedReceipt => ({
    valid: true,
    receipt: {
      key: `0x${i.toString(16).padStart(64, '0')}`,
      creator,
      owner: R,
      createdAt,
      expiresAt: createdAt + 365 * DAY,
      readonly: true,
      permissionlessExtension: false,
      rider: R,
      delivery: `0x${'d'.repeat(64)}`,
      zone: HOME,
      at: createdAt,
      tags: [],
    } satisfies Receipt,
  });
  const complaint = (createdAt: number): Complaint => ({
    key: `0x${'c'.repeat(63)}${createdAt % 10}`,
    creator: addr('x'),
    owner: addr('x'),
    createdAt,
    expiresAt: createdAt + 180 * DAY,
    readonly: true,
    permissionlessExtension: false,
    rider: R,
    request: `0x${'e'.repeat(64)}`,
    reason: 'rude',
    at: createdAt,
  });
  const now = 1_800_000_000;
  const att = {
    key: `0x${'a'.repeat(64)}` as EntityKey,
    creator: addr('v'),
    owner: addr('v'),
    createdAt: now - DAY,
    expiresAt: now + DAY,
    readonly: true,
    permissionlessExtension: false,
    subject: R,
    level: 'id_checked' as const,
    at: now,
    trusted: true,
  };
  const profile = (n: number, residents: number, complaints: number, trusted = true) =>
    computeProfile({
      address: R,
      receipts: Array.from({ length: n }, (_, i) => mkReceipt(i, addr(`res${i % residents}`), now - 40 * DAY)),
      complaints: Array.from({ length: complaints }, (_, i) => complaint(now - i)),
      attestations: [{ ...att, trusted }],
      now,
    });

  it('Trusted needs verified + ≥25 receipts + ≥15 residents + <3 complaints in 30 d', () => {
    expect(profile(25, 15, 2).tier.name).toBe('trusted');
    expect(profile(24, 15, 0).tier.name).toBe('verified');
    expect(profile(25, 14, 0).tier.name).toBe('verified');
    expect(profile(25, 15, 3).tier.name).toBe('verified');
    expect(profile(100, 50, 0, false).tier.name).toBe('new');
  });

  it('complaints older than 30 d do not block Trusted', () => {
    const p = computeProfile({
      address: R,
      receipts: Array.from({ length: 25 }, (_, i) => mkReceipt(i, addr(`res${i % 15}`), now - DAY)),
      complaints: [complaint(now - 31 * DAY), complaint(now - 32 * DAY), complaint(now - 33 * DAY)],
      attestations: [att],
      now,
    });
    expect(p.complaints30d).toBe(0);
    expect(p.complaints).toHaveLength(3);
    expect(p.tier.name).toBe('trusted');
  });

  it('caps match the brief exactly', () => {
    expect(tierFor({ verified: false, receiptsTotal: 0, distinctResidents: 0, complaints30d: 0 })).toEqual({ tier: 0, name: 'new', priceCap: 200, requestsPerRun: 1 });
    expect(TIERS[1]).toEqual({ tier: 1, name: 'verified', priceCap: 500, requestsPerRun: 2 });
    expect(TIERS[2]).toEqual({ tier: 2, name: 'trusted', priceCap: 1000, requestsPerRun: 3 });
  });
});

describe('tier caps are enforced from the viewer-computed tier, never claimedTier', () => {
  it('a New runner claiming tier 2 with capacity 3 is still capped at ₹200 and 1 accept', async () => {
    const w = makeWorld();
    const shop = await listShop(w, resident);
    const runKey = await w.raw(runner, async (x) =>
      (await x.create(createSpec(encode.run(P, { destZone: HOME, fromZone: NORTH, eta: w.chain.now() + 1800, capacityLeft: 3, claimedTier: 2 }), 2400))).key,
    );
    expect((await w.as(resident).getRun(runKey))?.claimedTier).toBe(2);
    await expect(
      w.as(resident).postRequest({ runKey, shopKey: shop, items: ['TV'], maxPrice: 300, tip: 0 }),
    ).rejects.toMatchObject({ code: 'TIER_LIMIT' });
    const a = await w.as(resident).postRequest({ runKey, shopKey: shop, items: ['Milk'], maxPrice: 200, tip: 0 });
    const b = await w.as(addr('resident-2')).postRequest({ runKey, shopKey: shop, items: ['Eggs'], maxPrice: 100, tip: 0 });
    await w.as(runner).acceptRequest(a.key);
    await expect(w.as(runner).acceptRequest(b.key)).rejects.toMatchObject({ code: 'TIER_LIMIT' });
    // Residents also see the run as full for this runner's tier.
    await expect(
      w.as(addr('resident-3')).postRequest({ runKey, shopKey: shop, items: ['Bread'], maxPrice: 50, tip: 0 }),
    ).rejects.toMatchObject({ code: 'CAPACITY_EXHAUSTED' });
  });

  it('announceRun clamps capacity to own tier', async () => {
    const w = makeWorld();
    const r = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 20, capacity: 3 });
    const run = await w.as(resident).getRun(r.key);
    expect(run).toMatchObject({ capacityLeft: 1, claimedTier: 0 });
  });

  it('errors are BhaiyaPleaseError', async () => {
    const w = makeWorld();
    const err = await w.as(resident).postRequest({ runKey: `0x${'0'.repeat(64)}`, shopKey: `0x${'0'.repeat(64)}`, items: ['x'], maxPrice: 1, tip: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BhaiyaPleaseError);
    expect((err as BhaiyaPleaseError).code).toBe('NOT_FOUND');
  });
});
