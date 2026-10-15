/**
 * Demo data set, shared by the mock and (later) scripts/seed. SYNTHETIC ONLY: fictional shop names,
 * persona ids instead of people, generic item lines. Labels are device-local and never written
 * to Arkiv. The plan is executed through the public BhaiyaPlease interface (runFixturePlan), so
 * every hash, key and trust check is produced by the same codec/services as live use.
 */
import type { BhaiyaPlease } from '../interface';
import type {
  AttestationLevel,
  ComplaintReason,
  EntityKey,
  HandoffSecret,
  ReceiptTag,
  ShopCategory,
  UnixSeconds,
  Zone6,
} from '../types';
import { DEMO_ZONES } from '../zones';

export type PersonaRole = 'verifier' | 'runner' | 'resident';

export interface FixturePersona {
  id: string;
  role: PersonaRole;
  /** Device-local display label. Never on chain. */
  label: string;
}

export interface FixtureShop {
  id: string;
  lister: string;
  zone: Zone6;
  category: ShopCategory;
  nameTag: string;
}

export interface FixtureAttestation {
  verifier: string;
  subject: string;
  level: AttestationLevel;
  daysAgo: number;
}

export interface FixtureHandoff {
  runner: string;
  resident: string;
  shop: string;
  items: string[];
  maxPrice: number;
  tip: number;
  daysAgo: number;
  /** 'receipt' = happy path; 'complaint' = delivered but resident complains instead. */
  outcome: { kind: 'receipt'; tags: ReceiptTag[] } | { kind: 'complaint'; reason: ComplaintReason };
}

export interface FixtureLiveRun {
  id: string;
  runner: string;
  fromZone: Zone6;
  destZone: Zone6;
  etaMinutes: number;
  capacity: number;
  note?: string;
}

export interface FixtureLiveRequest {
  run: string;
  resident: string;
  shop: string;
  items: string[];
  maxPrice: number;
  tip: number;
  accepted: boolean;
}

export interface FixturePlan {
  personas: FixturePersona[];
  shops: FixtureShop[];
  attestations: FixtureAttestation[];
  handoffs: FixtureHandoff[];
  liveRuns: FixtureLiveRun[];
  liveRequests: FixtureLiveRequest[];
}

export const PERSONA = {
  verifier: 'verifier',
  runnerTrusted: 'runner-trusted',
  runnerVerified: 'runner-verified',
  runnerNew: 'runner-new',
  residentDemo: 'resident-demo',
} as const;

const HISTORY_RESIDENTS = 18;
const residentId = (n: number) => `resident-${String(n).padStart(2, '0')}`;

const HOME = DEMO_ZONES[0]!;
const NORTH = DEMO_ZONES[1]!;

const ITEMS: string[][] = [
  ['1 L toned milk', 'Bread loaf'],
  ['6 eggs'],
  ['Curd 400 g', 'Bananas (6)'],
  ['Glucose biscuits x2'],
  ['Instant noodles 4-pack', 'Tomato ketchup'],
  ['A4 notebook', 'Blue pens x3'],
  ['Dish soap bar'],
  ['Paneer 200 g', 'Coriander bunch'],
  ['Pav (6)', 'Butter 100 g'],
  ['ORS sachets x4'],
];
const TAGS: ReceiptTag[][] = [
  ['on_time', 'exact_item'],
  ['polite'],
  ['exact_item', 'careful_packing'],
  ['good_price', 'on_time'],
  ['on_time'],
];
const SHOP_IDS = ['shop-provisions', 'shop-bakehouse', 'shop-otc', 'shop-stationers', 'shop-household'];

export function buildFixturePlan(): FixturePlan {
  const personas: FixturePersona[] = [
    { id: PERSONA.verifier, role: 'verifier', label: 'Whitefield Residents Union (demo verifier)' },
    { id: PERSONA.runnerTrusted, role: 'runner', label: 'Runner A (demo, trusted)' },
    { id: PERSONA.runnerVerified, role: 'runner', label: 'Runner B (demo, verified)' },
    { id: PERSONA.runnerNew, role: 'runner', label: 'Runner C (demo, new)' },
    { id: PERSONA.residentDemo, role: 'resident', label: 'You (demo resident)' },
    ...Array.from({ length: HISTORY_RESIDENTS }, (_, i) => ({
      id: residentId(i + 1),
      role: 'resident' as const,
      label: `Resident ${String(i + 1).padStart(2, '0')} (demo)`,
    })),
  ];

  const shops: FixtureShop[] = [
    { id: SHOP_IDS[0]!, lister: residentId(1), zone: NORTH.zone6, category: 'grocery', nameTag: 'Chai Patti Provisions' },
    { id: SHOP_IDS[1]!, lister: residentId(2), zone: NORTH.zone6, category: 'bakery', nameTag: 'Kesar Bakehouse' },
    { id: SHOP_IDS[2]!, lister: residentId(3), zone: NORTH.zone6, category: 'pharmacy_otc', nameTag: 'Tulsi OTC Corner' },
    { id: SHOP_IDS[3]!, lister: residentId(4), zone: HOME.zone6, category: 'stationery', nameTag: 'Pencil Box Stationers' },
    { id: SHOP_IDS[4]!, lister: residentId(5), zone: HOME.zone6, category: 'household', nameTag: 'Ghar Ka Saaman' },
  ];

  const attestations: FixtureAttestation[] = [
    { verifier: PERSONA.verifier, subject: PERSONA.runnerTrusted, level: 'id_checked', daysAgo: 60 },
    { verifier: PERSONA.verifier, subject: PERSONA.runnerVerified, level: 'id_checked', daysAgo: 20 },
  ];

  const handoffs: FixtureHandoff[] = [];
  const pick = <T>(xs: T[], i: number): T => xs[i % xs.length] as T;
  // Trusted runner: 30 receipts from all 18 history residents over ~4 months, 8 in the last 30 days.
  for (let i = 0; i < 30; i++) {
    handoffs.push({
      runner: PERSONA.runnerTrusted,
      resident: residentId((i % HISTORY_RESIDENTS) + 1),
      shop: pick(SHOP_IDS, i),
      items: pick(ITEMS, i),
      maxPrice: 120 + (i % 5) * 15,
      tip: 20 + (i % 3) * 10,
      daysAgo: 118 - i * 4,
      outcome: { kind: 'receipt', tags: pick(TAGS, i) },
    });
  }
  // Verified runner: 6 receipts from 5 residents + 1 complaint.
  for (let i = 0; i < 6; i++) {
    handoffs.push({
      runner: PERSONA.runnerVerified,
      resident: residentId((i % 5) + 1),
      shop: pick(SHOP_IDS, i + 1),
      items: pick(ITEMS, i + 3),
      maxPrice: 150,
      tip: 25,
      daysAgo: 40 - i * 6,
      outcome: { kind: 'receipt', tags: pick(TAGS, i + 2) },
    });
  }
  handoffs.push({
    runner: PERSONA.runnerVerified,
    resident: residentId(7),
    shop: SHOP_IDS[0]!,
    items: ['Atta 1 kg'],
    maxPrice: 90,
    tip: 15,
    daysAgo: 9,
    outcome: { kind: 'complaint', reason: 'wrong_item' },
  });
  // New runner: 2 receipts, no attestation.
  for (let i = 0; i < 2; i++) {
    handoffs.push({
      runner: PERSONA.runnerNew,
      resident: residentId(10 + i),
      shop: SHOP_IDS[1]!,
      items: pick(ITEMS, i + 6),
      maxPrice: 80,
      tip: 10,
      daysAgo: 5 - i * 3,
      outcome: { kind: 'receipt', tags: ['on_time'] },
    });
  }

  const liveRuns: FixtureLiveRun[] = [
    { id: 'live-trusted', runner: PERSONA.runnerTrusted, fromZone: NORTH.zone6, destZone: HOME.zone6, etaMinutes: 25, capacity: 3, note: 'Heading back via the market road' },
    { id: 'live-verified', runner: PERSONA.runnerVerified, fromZone: NORTH.zone6, destZone: HOME.zone6, etaMinutes: 40, capacity: 2 },
    { id: 'live-new', runner: PERSONA.runnerNew, fromZone: HOME.zone6, destZone: NORTH.zone6, etaMinutes: 18, capacity: 1 },
  ];

  const liveRequests: FixtureLiveRequest[] = [
    { run: 'live-trusted', resident: residentId(2), shop: SHOP_IDS[0]!, items: ['1 L toned milk'], maxPrice: 80, tip: 20, accepted: true },
  ];

  return { personas, shops, attestations, handoffs, liveRuns, liveRequests };
}

export interface FixtureEnv {
  /** The interface acting as `personaId`. */
  as(personaId: string): BhaiyaPlease;
  /** Move the clock to `unix`, or back to the present with null. Real chain: no-op (all "now"). */
  travelTo(unix: UnixSeconds | null): void;
  /** Present time (not travelled). */
  now(): UnixSeconds;
}

const DAY = 86_400;
/** Shops need a "still open" tap at least every 30 d; the seeder taps every ~20 d of history. */
const SHOP_REFRESH = 20 * DAY;

/** Executes the plan in chronological order. Returns created keys by fixture id. */
export async function runFixturePlan(plan: FixturePlan, env: FixtureEnv): Promise<Record<string, EntityKey>> {
  const keys: Record<string, EntityKey> = {};
  const present = env.now();
  const handoffs = [...plan.handoffs].sort((a, b) => b.daysAgo - a.daysAgo);
  const start = present - Math.max(0, ...handoffs.map((h) => h.daysAgo), ...plan.attestations.map((a) => a.daysAgo)) * DAY - DAY;

  // Resolved through the interface, so this works for mock personas and real wallets alike.
  const addresses: Record<string, `0x${string}`> = {};
  for (const p of plan.personas) {
    const a = env.as(p.id).address;
    if (a) addresses[p.id] = a;
  }

  type Step = { at: UnixSeconds; run: () => Promise<void> };
  const steps: Step[] = [];

  steps.push({
    at: start,
    run: async () => {
      for (const s of plan.shops) {
        keys[s.id] = (await env.as(s.lister).listShop({ zone: s.zone, category: s.category, nameTag: s.nameTag })).key;
      }
    },
  });
  const confirmTimes: UnixSeconds[] = [];
  for (let t = start + SHOP_REFRESH; t < present - 2 * DAY; t += SHOP_REFRESH) confirmTimes.push(t);
  confirmTimes.push(present - 2 * DAY);
  for (const t of confirmTimes) {
    steps.push({
      at: t,
      run: async () => {
        for (const s of plan.shops) await env.as(PERSONA.residentDemo).confirmShopOpen(must(keys, s.id));
      },
    });
  }
  for (const a of plan.attestations) {
    steps.push({
      at: present - a.daysAgo * DAY,
      run: async () => {
        await env.as(a.verifier).issueAttestation({ subject: must(addresses, a.subject), level: a.level });
      },
    });
  }
  handoffs.forEach((h, i) => {
    // Spread same-day handoffs over the day so ordering is stable.
    steps.push({ at: present - h.daysAgo * DAY + (i % 12) * 3600, run: () => runHandoff(env, keys, h) });
  });

  steps.sort((a, b) => a.at - b.at);
  for (const s of steps) {
    env.travelTo(s.at);
    await s.run();
  }
  env.travelTo(null);

  for (const r of plan.liveRuns) {
    const input = { destZone: r.destZone, fromZone: r.fromZone, etaMinutes: r.etaMinutes, capacity: r.capacity, ...(r.note ? { note: r.note } : {}) };
    keys[r.id] = (await env.as(r.runner).announceRun(input)).key;
  }
  for (const q of plan.liveRequests) {
    const runKey = must(keys, q.run);
    const res = await env.as(q.resident).postRequest({
      runKey,
      shopKey: must(keys, q.shop),
      items: q.items,
      maxPrice: q.maxPrice,
      tip: q.tip,
    });
    const run = plan.liveRuns.find((r) => r.id === q.run);
    if (q.accepted && run) await env.as(run.runner).acceptRequest(res.key);
  }
  return keys;
}

async function runHandoff(env: FixtureEnv, keys: Record<string, EntityKey>, h: FixtureHandoff): Promise<void> {
  const runner = env.as(h.runner);
  const run = await runner.announceRun({ destZone: HOME.zone6, fromZone: NORTH.zone6, etaMinutes: 30, capacity: 1 });
  const resident = env.as(h.resident);
  const posted = await resident.postRequest({
    runKey: run.key,
    shopKey: must(keys, h.shop),
    items: h.items,
    maxPrice: h.maxPrice,
    tip: h.tip,
  });
  const secret: HandoffSecret = posted.secret;
  await env.as(h.runner).acceptRequest(posted.key);
  const delivery = await env.as(h.runner).recordDelivery({ secret });
  if (h.outcome.kind === 'receipt') {
    await env.as(h.resident).issueReceipt({ deliveryKey: delivery.key, tags: h.outcome.tags });
  } else {
    const rider = env.as(h.runner).address;
    if (rider) await env.as(h.resident).fileComplaint({ requestKey: posted.key, rider, reason: h.outcome.reason });
  }
}

function must<T>(m: Record<string, T>, id: string): T {
  const v = m[id];
  if (v === undefined) throw new Error(`fixture: unknown id ${id}`);
  return v;
}
