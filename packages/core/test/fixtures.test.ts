import { describe, expect, it } from 'vitest';
import { buildFixturePlan, createMockBhaiyaPlease, MOCK_PERSONAS, PERSONA } from '../src/mock';
import { DEMO_ZONES } from '../src/zones';

const at = (id: string) => MOCK_PERSONAS[id]!.address;

describe('fixtures', () => {
  it('seeded runners land in the intended tiers with verifiable history', async () => {
    const m = createMockBhaiyaPlease({ latencyMs: 0 });
    const trusted = await m.getProfile(at(PERSONA.runnerTrusted));
    expect(trusted.tier.name).toBe('trusted');
    expect(trusted.receiptsTotal).toBeGreaterThanOrEqual(25);
    expect(trusted.distinctResidents).toBeGreaterThanOrEqual(15);
    expect(trusted.invalidReceipts).toBe(0);
    expect(trusted.receipts30d).toBeGreaterThan(0);
    expect(trusted.receipts30d).toBeLessThan(trusted.receiptsTotal);

    const verified = await m.getProfile(at(PERSONA.runnerVerified));
    expect(verified.tier.name).toBe('verified');
    expect(verified.complaints).toHaveLength(1);

    expect((await m.getProfile(at(PERSONA.runnerNew))).tier.name).toBe('new');
    expect((await m.getProfile(at(PERSONA.residentDemo))).tier.name).toBe('new');

    const receipts = await m.getReceiptsFor(at(PERSONA.runnerTrusted));
    const first = receipts[0]!;
    expect((await m.verifyDelivery(first.receipt.delivery)).valid).toBe(true);
    m.close();
  });

  it('seeds live runs, shops on route, and the default wallet is the demo resident', async () => {
    const m = createMockBhaiyaPlease({ latencyMs: 0 });
    expect(m.address).toBe(at(PERSONA.residentDemo));
    const runs = await m.getLiveRuns(DEMO_ZONES[0]!.zone6);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.every((r) => r.eta > Math.floor(Date.now() / 1000))).toBe(true);
    const shops = await m.getShops(DEMO_ZONES[0]!.zone5);
    expect(shops.length).toBe(5);
    expect(await m.getMyIssuedAttestations()).toEqual([]);
    m.dev.setAddress(at(PERSONA.verifier));
    expect(await m.getMyIssuedAttestations()).toHaveLength(2);
    m.close();
  });

  it('plan is synthetic: unique personas, no digit runs that look like phone numbers', () => {
    const plan = buildFixturePlan();
    const ids = plan.personas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(Object.values(MOCK_PERSONAS).map((p) => p.address)).size).toBe(ids.length);
    expect(JSON.stringify(plan)).not.toMatch(/\d{6,}/);
  });
});
