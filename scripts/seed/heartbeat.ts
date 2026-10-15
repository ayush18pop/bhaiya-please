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
import { DEMO_ZONES } from '@bhaiya-please/core';
import type { BhaiyaPlease, Zone } from '@bhaiya-please/core';
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
  for (const id of chosen) {
    const d = await openPersona(env, id);
    try {
      const mine = await d.getMyRuns();
      if (mine.length >= MAX_LIVE_PER_RUNNER) {
        log(`${id}: already has ${mine.length} live runs, skipping`);
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
    } catch (e) {
      log(`${id}: announce failed: ${errorText(e)}`);
    } finally {
      d.close();
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

  log(`done: ${announced} run(s) announced`);
  if (announced === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(redact(`heartbeat failed: ${errorText(e)}`));
  if (e instanceof BhaiyaPleaseError && e.code === 'INSUFFICIENT_FUNDS') console.error('Fund the seed wallet at https://hub.arkiv.network/faucet');
  process.exit(1);
});
