/**
 * Seeds Tiramisu with the synthetic demo data set by running the SAME fixture plan the mock uses
 * (core: buildFixturePlan / runFixturePlan) through the REAL createBhaiyaPlease. On-chain history
 * therefore equals mock history and every commit/reveal hash verifies with the production codec.
 *
 *   pnpm seed            seed (skips if already seeded)
 *   pnpm seed -- --force run the plan even if seed data is detected (counts will exceed the plan)
 *   pnpm seed -- --resume continue an interrupted seed: skips shops/attestations that exist and,
 *                        per runner, the handoffs already on chain (receipts + complaints owned/
 *                        filed so far form a prefix of that runner's handoffs, which run in order)
 *   pnpm seed -- --dry   derive and print addresses only; no chain access
 *
 * Needs .env (repo root): SEED_PRIVATE_KEY funded on Tiramisu. Prints addresses only, never keys.
 * Time cannot be travelled on a real chain: all history is written "now", so "last 30 days"
 * windows include everything. Counts and tiers match the mock; timestamps do not.
 */
import { buildFixturePlan, runFixturePlan, TRUSTED_RULE } from '@bhaiya-please/core';
import type { BhaiyaPlease, EntityKey, FixtureEnv } from '@bhaiya-please/core';
import {
  BhaiyaPleaseError,
  errorText,
  fundWallets,
  loadEnvOrExit,
  makeRedactor,
  openPersona,
  PERSONA_IDS,
  personaAddress,
  seedAddress,
  sleep,
} from './common';

const MUTATIONS = new Set([
  'listShop',
  'confirmShopOpen',
  'announceRun',
  'postRequest',
  'acceptRequest',
  'recordDelivery',
  'issueReceipt',
  'fileComplaint',
  'issueAttestation',
]);
/** Pre-write reads can lag the previous block; these codes are thrown before any write happens. */
const LAG_CODES = new Set(['NOT_FOUND', 'INVALID_INPUT', 'RATE_LIMITED', 'NETWORK']);
const SETTLE_MS = 2500;
const RETRIES = 4;

const force = process.argv.includes('--force');
const resume = process.argv.includes('--resume');
/** Placeholder key returned for a skipped (already seeded) handoff; every later step of it is a no-op. */
const SKIP = `0x${'00'.repeat(31)}5e` as EntityKey;

interface ResumeState {
  /** Remaining handoffs to skip, per runner address. */
  skip: Map<string, number>;
  shops: Map<string, EntityKey>; // `${lister}|${nameTag}` -> key
  attested: Set<string>; // `${verifier}|${subject}`
}

/** Resume: short-circuits work that is already on chain (see header). */
function resumable(base: BhaiyaPlease, st: ResumeState): BhaiyaPlease {
  const me = (base.address ?? '').toLowerCase();
  return new Proxy(base, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (typeof v !== 'function') return v;
      const call = (...a: unknown[]) => (v as (...x: unknown[]) => unknown).apply(target, a);
      switch (prop) {
        case 'listShop':
          return async (i: { nameTag: string }) => {
            const k = st.shops.get(`${me}|${i.nameTag}`);
            return k ? { key: k, txHash: SKIP } : call(i);
          };
        case 'issueAttestation':
          return async (i: { subject: string }) =>
            st.attested.has(`${me}|${i.subject.toLowerCase()}`) ? { key: SKIP, txHash: SKIP } : call(i);
        case 'announceRun':
          return async (i: unknown) => {
            const n = st.skip.get(me) ?? 0;
            // Live runs (capacity > 1) are never skipped; history runs use capacity 1.
            if (n > 0 && (i as { capacity: number }).capacity === 1) {
              st.skip.set(me, n - 1);
              return { key: SKIP, txHash: SKIP };
            }
            return call(i);
          };
        case 'postRequest':
          return async (i: { runKey: string }) =>
            i.runKey === SKIP ? { key: SKIP, txHash: SKIP, secret: { requestKey: SKIP, code: '0000', salt: `0x${'00'.repeat(16)}` } } : call(i);
        case 'acceptRequest':
          return async (k: string) => (k === SKIP ? { key: SKIP, txHash: SKIP } : call(k));
        case 'recordDelivery':
          return async (i: { secret: { requestKey: string } }) => (i.secret.requestKey === SKIP ? { key: SKIP, txHash: SKIP } : call(i));
        case 'issueReceipt':
          return async (i: { deliveryKey: string }) => (i.deliveryKey === SKIP ? { key: SKIP, txHash: SKIP, path: 'batch' } : call(i));
        case 'fileComplaint':
          return async (i: { requestKey: string }) => (i.requestKey === SKIP ? { key: SKIP, txHash: SKIP } : call(i));
        default:
          return (v as (...x: unknown[]) => unknown).bind(target);
      }
    },
  });
}
const dry = process.argv.includes('--dry');
const env = loadEnvOrExit('seed');
const redact = makeRedactor(env);
const log = (s: string) => console.log(redact(s));

/**
 * Wraps a domain so each mutation (a) waits one block after success so the next read sees it and
 * (b) retries a few times when a pre-write read lagged. confirmShopOpen is sent once per shop:
 * the plan repeats it to simulate history, which would only burn gas on a real chain.
 */
function settled(base: BhaiyaPlease, confirmed: Map<string, unknown>): BhaiyaPlease {
  return new Proxy(base, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (typeof prop !== 'string' || !MUTATIONS.has(prop) || typeof v !== 'function') {
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      }
      return async (...args: unknown[]) => {
        if (prop === 'confirmShopOpen') {
          const k = String(args[0]);
          if (confirmed.has(k)) return confirmed.get(k);
        }
        for (let attempt = 1; ; attempt++) {
          try {
            const r = await (v as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            if (prop === 'confirmShopOpen') confirmed.set(String(args[0]), r);
            await sleep(SETTLE_MS);
            return r;
          } catch (e) {
            const lag = e instanceof BhaiyaPleaseError && LAG_CODES.has(e.code);
            if (!lag || attempt >= RETRIES) throw e;
            await sleep(SETTLE_MS * attempt);
          }
        }
      };
    },
  });
}

async function main(): Promise<void> {
  const plan = buildFixturePlan();
  const rows = plan.personas.map((p) => ({ ...p, address: personaAddress(env, p.id) }));
  const printTable = () => {
    log('\nPersona wallets (Tiramisu, addresses only):\n');
    log('| Persona id | Role | Address |');
    log('|---|---|---|');
    for (const r of rows) log(`| ${r.id} | ${r.role} | \`${r.address}\` |`);
    log(`\nSeed/funding wallet: \`${seedAddress(env)}\` (funds personas; creates no entities)`);
    log(`Set EXPO_PUBLIC_TRUSTED_VERIFIERS=${personaAddress(env, PERSONA_IDS.verifier)}  (the demo verifier)`);
  };
  if (dry) {
    log('--dry: derived addresses only, no chain access.');
    printTable();
    return;
  }

  log(`Funding ${rows.length} persona wallets from ${seedAddress(env)} ...`);
  const fund = await fundWallets(env, rows.map((r) => ({ id: r.id, address: r.address })), log);
  log(`funding: ${fund.funded} topped up, ${fund.alreadyOk} already funded, ${fund.skipped.length} skipped; seed balance ${fund.seedBalance} wei`);
  if (fund.skipped.length) {
    for (const s of fund.skipped) log(`  skipped: ${s}`);
    log('\nThe seed wallet cannot fund every persona, so seeding would fail half-way. Top it up at');
    log('https://hub.arkiv.network/faucet (or lower SEED_FUND_GLM in .env), then re-run. Nothing was written.');
    printTable();
    process.exit(1);
  }

  // One domain instance per persona; addresses come from the signer, exactly as in production.
  const domains = new Map<string, BhaiyaPlease>();
  for (const p of plan.personas) domains.set(p.id, await openPersona(env, p.id));
  const confirmed = new Map<string, unknown>();
  const wrapped = new Map<string, BhaiyaPlease>();
  let resumeState: ResumeState | null = null;
  const as = (id: string): BhaiyaPlease => {
    const d = domains.get(id);
    if (!d) throw new Error(`unknown persona ${id}`);
    let w = wrapped.get(id);
    if (!w) wrapped.set(id, (w = settled(resumeState ? resumable(d, resumeState) : d, confirmed)));
    return w;
  };

  try {
    // Idempotency: chain state is the source of truth.
    const verifier = as(PERSONA_IDS.verifier);
    const trusted = as(PERSONA_IDS.runnerTrusted);
    const [issued, profile] = await Promise.all([
      verifier.getMyIssuedAttestations(),
      trusted.getProfile(personaAddress(env, PERSONA_IDS.runnerTrusted)),
    ]);
    const expectedTrusted = plan.handoffs.filter((h) => h.runner === PERSONA_IDS.runnerTrusted && h.outcome.kind === 'receipt').length;
    if (!force && profile.receiptsTotal >= expectedTrusted && issued.length > 0) {
      log(`\nAlready seeded: ${PERSONA_IDS.runnerTrusted} has ${profile.receiptsTotal} valid receipts (tier ${profile.tier.name}). Nothing to do. Use --force to run the plan again.`);
      printTable();
      return;
    }
    if (resume) {
      resumeState = await buildResumeState(plan, domains);
      wrapped.clear();
      log(`\nResuming: skipping ${[...resumeState.skip.entries()].map(([a, n]) => `${a.slice(0, 8)}…:${n}`).join(', ')} handoffs, ${resumeState.shops.size} shops, ${resumeState.attested.size} attestations already on chain.`);
    } else if (!force && (issued.length > 0 || profile.receiptsTotal > 0)) {
      log(`\nPartial seed detected (${issued.length} attestations, ${profile.receiptsTotal}/${expectedTrusted} trusted-runner receipts).`);
      log('Re-running the plan would add duplicates. Re-run with --resume to continue where it stopped, or --force to replay everything (counts will exceed the plan),');
      log('or leave it: the heartbeat and the app work with whatever exists.');
      printTable();
      process.exit(1);
    }

    log('\nRunning fixture plan against Tiramisu (sequential, ~5 transactions per handoff; expect 15-30 minutes) ...');
    const t0 = Date.now();
    const fixtureEnv: FixtureEnv = {
      as,
      travelTo: () => {}, // a real chain has no time travel
      now: () => Math.floor(Date.now() / 1000),
    };
    const keys: Record<string, EntityKey> = await runFixturePlan(plan, fixtureEnv);
    log(`plan complete in ${Math.round((Date.now() - t0) / 1000)} s; ${Object.keys(keys).length} named entities (shops, live runs)`);

    // Verification: reputation is recomputed from chain; every receipt must verify.
    log('\nVerifying reputation from chain ...');
    log('| Runner | Valid receipts | Distinct residents | Invalid | Complaints | Verified | Tier |');
    log('|---|---|---|---|---|---|---|');
    let bad = 0;
    for (const id of [PERSONA_IDS.runnerTrusted, PERSONA_IDS.runnerVerified, PERSONA_IDS.runnerNew]) {
      const p = await as(id).getProfile(personaAddress(env, id));
      bad += p.invalidReceipts;
      log(`| ${id} | ${p.receiptsTotal} | ${p.distinctResidents} | ${p.invalidReceipts} | ${p.complaints.length} | ${p.verified} | ${p.tier.name} |`);
    }
    const tp = await trusted.getProfile(personaAddress(env, PERSONA_IDS.runnerTrusted));
    if (tp.tier.name !== 'trusted') {
      log(`WARNING: ${PERSONA_IDS.runnerTrusted} is '${tp.tier.name}', expected 'trusted' (needs >= ${TRUSTED_RULE.minReceipts} receipts from >= ${TRUSTED_RULE.minDistinctResidents} residents).`);
    }
    if (bad > 0) log(`WARNING: ${bad} receipt(s) failed verification; inspect before recording the demo.`);
    printTable();
  } finally {
    for (const d of domains.values()) d.close();
  }
}

main().catch((e) => {
  console.error(`\nseed failed: ${redact(errorText(e))}`);
  if (e instanceof BhaiyaPleaseError && e.code === 'INSUFFICIENT_FUNDS') {
    console.error('A persona ran out of gas. Fund the seed wallet at https://hub.arkiv.network/faucet and re-run (--force if partially seeded).');
  }
  process.exit(1);
});

async function buildResumeState(plan: ReturnType<typeof buildFixturePlan>, domains: Map<string, BhaiyaPlease>): Promise<ResumeState> {
  const st: ResumeState = { skip: new Map(), shops: new Map(), attested: new Set() };
  const d = (id: string) => domains.get(id) as BhaiyaPlease;
  const zones5 = [...new Set(plan.shops.map((x) => x.zone.slice(0, 5)))];
  for (const z of zones5) {
    for (const shop of await d(PERSONA_IDS.residentDemo).getShops(z)) st.shops.set(`${shop.creator}|${shop.nameTag}`, shop.key);
  }
  for (const a of await d(PERSONA_IDS.verifier).getMyIssuedAttestations()) st.attested.add(`${a.creator}|${a.subject}`);
  const residents = new Set(plan.personas.filter((p) => p.role === 'resident').map((p) => personaAddress(env, p.id)));
  for (const id of [PERSONA_IDS.runnerTrusted, PERSONA_IDS.runnerVerified, PERSONA_IDS.runnerNew]) {
    const a = personaAddress(env, id);
    const [receipts, complaints] = await Promise.all([d(id).getReceiptsFor(a), d(id).getComplaintsAgainst(a)]);
    const done = receipts.filter((r) => residents.has(r.receipt.creator)).length + complaints.filter((c) => residents.has(c.creator)).length;
    st.skip.set(a, done);
  }
  return st;
}
