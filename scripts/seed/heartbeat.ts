/**
 * Heartbeat: keeps the live board non-empty for judges. Every invocation announces 2-3 synthetic
 * runs (ETA 10-20 min, so they live ~20-30 min incl. the 10-min grace) from the seeded demo runners
 * in the demo zones, and confirms one shop "still open" from a different wallet (the
 * permissionlessExtension flag in action). Run by cron every 15 minutes
 * (.github/workflows/heartbeat.yml). A convenience for judges: the app works without it.
 *
 *   pnpm heartbeat
 *
 * Needs the same .env as the seed (SEED_PRIVATE_KEY). Runners must already be seeded; wallets are
 * topped up from the seed wallet when low. Synthetic data only; prints addresses/keys of nothing.
 */
import { coarsenToGh7, DEMO_ZONES, PING_RULES, simulatedPosition } from '@bhaiya-please/core';
import type { BhaiyaPlease, EntityKey, Zone } from '@bhaiya-please/core';
import {
  BhaiyaPleaseError,
  errorText,
  fundWallets,
  loadEnvOrExit,
  makeRedactor,
  openPersona,
  PERSONA_IDS,
  personaAddress,
} from './common';

const env = loadEnvOrExit('heartbeat');
const redact = makeRedactor(env);
const log = (s: string) => console.log(redact(`[heartbeat ${new Date().toISOString()}] ${s}`));

const RUNNERS = [PERSONA_IDS.runnerTrusted, PERSONA_IDS.runnerVerified, PERSONA_IDS.runnerNew];
const NOTES = ['Heading back from the market', 'Passing the main road shops', 'Return trip, can pick up 1-2 items', undefined];
/** Skip a runner that already has this many live runs (cron overlap). */
const MAX_LIVE_PER_RUNNER = 2;
/** Live-location pings per announced run per invocation (gas budget: tiny 2-min entities). */
const PINGS_PER_RUN = 6;

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

async function main(): Promise<void> {
  const home = DEMO_ZONES[0] as Zone;
  const north = DEMO_ZONES[1] as Zone;

  // Keep wallets alive: top up the 3 runners + the confirming resident from the seed wallet.
  const ids = [...RUNNERS, PERSONA_IDS.residentDemo];
  const fund = await fundWallets(env, ids.map((id) => ({ id, address: personaAddress(env, id) })), log);
  for (const s of fund.skipped) log(`funding skipped: ${s}`);

  const howMany = between(2, 3);
  const chosen = [...RUNNERS].sort(() => Math.random() - 0.5).slice(0, howMany);
  let announced = 0;
  let skipped = 0;
  const moving: { id: string; d: BhaiyaPlease; key: EntityKey }[] = [];
  for (const id of chosen) {
    const d = await openPersona(env, id);
    let keep = false;
    try {
      // Only runs still open on the board count (full or departed runs linger until ETA + 10 min).
      const now = Date.now() / 1000;
      const mine = (await d.getMyRuns()).filter((r) => r.eta > now && r.capacityLeft > 0);
      if (mine.length >= MAX_LIVE_PER_RUNNER) {
        // Busy runner: no new run, but keep its newest run moving on the map.
        log(`${id}: already has ${mine.length} live runs, pinging the newest instead`);
        moving.push({ id, d, key: mine[0]!.key });
        keep = true;
        skipped++;
        continue;
      }
      const toHome = Math.random() < 0.6;
      const note = pick(NOTES);
      const r = await d.announceRun({
        destZone: (toHome ? home : north).zone6,
        fromZone: (toHome ? north : home).zone6,
        etaMinutes: between(10, 20),
        capacity: 3, // core clamps to the runner's computed tier
        ...(note ? { note } : {}),
      });
      announced++;
      log(`${id}: announced run ${r.key} (tx ${r.txHash})`);
      moving.push({ id, d, key: r.key });
      keep = true;
    } catch (e) {
      log(`${id}: announce failed: ${errorText(e)}`);
    } finally {
      if (!keep) d.close();
    }
  }

  // Permissionless extension: a wallet that does not own the shop confirms it is still open.
  const resident: BhaiyaPlease = await openPersona(env, PERSONA_IDS.residentDemo);
  try {
    const shops = await resident.getShops(home.zone5);
    if (shops.length === 0) {
      log('no shops found in the demo zone: run `pnpm seed` first');
    } else {
      const shop = pick(shops);
      const r = await resident.confirmShopOpen(shop.key);
      log(`confirmed "${shop.nameTag}" still open (tx ${r.txHash}); creator and extender differ: ${shop.creator !== resident.address}`);
    }
  } catch (e) {
    log(`shop confirm failed: ${errorText(e)}`);
  } finally {
    resident.close();
  }

  // Live location: a short burst of coarse pings along each run's synthetic route (see core geo.ts).
  // Each ping deletes itself after 2 min, so judges see riders move for a few minutes per cron tick.
  let pinged = 0;
  const runs = await Promise.all(moving.map(async (m) => ({ ...m, run: await m.d.getRun(m.key).catch(() => null) })));
  for (let i = 0; i < PINGS_PER_RUN && runs.length > 0; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PING_RULES.intervalSeconds * 1000));
    for (const { id, d, run } of runs) {
      if (!run) continue;
      const s = simulatedPosition(run, Math.floor(Date.now() / 1000));
      try {
        await d.publishPing(run.key, coarsenToGh7(s.pos.lat, s.pos.lng), { seq: i, heading: Math.round(s.heading) % 360, speedKmh: Math.round(s.speedKmh) });
        pinged++;
      } catch (e) {
        log(`${id}: ping ${i} failed: ${errorText(e)}`);
      }
    }
  }
  for (const m of moving) m.d.close();

  log(`done: ${announced} run(s) announced, ${pinged} ping(s) sent`);
  // Fail only when nothing useful happened (every runner errored), not when all were busy.
  if (announced === 0 && skipped === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(redact(`heartbeat failed: ${errorText(e)}`));
  if (e instanceof BhaiyaPleaseError && e.code === 'INSUFFICIENT_FUNDS') console.error('Fund the seed wallet at https://hub.arkiv.network/faucet');
  process.exit(1);
});
