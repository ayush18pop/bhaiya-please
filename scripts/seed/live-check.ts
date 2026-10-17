/**
 * Live-chain check of the full handoff loop plus the newer writes (cancel, decline, at the gate),
 * using two deterministic test wallets derived from SEED_PRIVATE_KEY and funded from it.
 *
 *   pnpm live-check
 *
 * Prints step results and addresses only, never keys. Writes real (cheap) entities on Tiramisu.
 */
import { createBhaiyaPlease } from '@bhaiya-please/core';
import type { BhaiyaPlease, EntityKey } from '@bhaiya-please/core';
import { DEMO_ZONES } from '@bhaiya-please/core/mock';
import { errorText, fundWallets, loadEnvOrExit, makeRedactor, PERSONA_IDS, personaAddress, personaKey, sleep } from './common';

const env = loadEnvOrExit('live-check');
const redact = makeRedactor(env);
const log = (s: string) => console.log(redact(s));

const RUNNER = 'livecheck-runner';
const RESIDENT = 'livecheck-resident';
const [HOME, NORTH] = [DEMO_ZONES[0]!, DEMO_ZONES[1]!];

function open(id: string): Promise<BhaiyaPlease> {
  return createBhaiyaPlease({
    rpcUrl: env.rpcUrl,
    // LIVECHECK_ANON=1 skips the access key (e.g. when its query quota is exhausted).
    ...(env.accessKey && process.env.LIVECHECK_ANON !== '1' ? { accessKey: env.accessKey } : {}),
    signer: { kind: 'privateKey', privateKey: personaKey(env, id) },
    trustedVerifiers: [personaAddress(env, PERSONA_IDS.verifier)],
  });
}

let failures = 0;
async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const r = await fn();
    log(`PASS  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    return r;
  } catch (e) {
    failures++;
    log(`FAIL  ${name}: ${errorText(e)}`);
    return undefined;
  }
}
function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === code) return;
    throw new Error(`expected ${code}, got ${c}: ${errorText(e)}`);
  }
  throw new Error(`expected ${code}, but it succeeded`);
}
/** Reads can lag a block behind writes: poll briefly. */
async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  let v = await read();
  while (!ok(v) && Date.now() < end) {
    await sleep(1500);
    v = await read();
  }
  return v;
}

async function main() {
  log(`runner ${personaAddress(env, RUNNER)} · resident ${personaAddress(env, RESIDENT)}`);
  const f = await fundWallets(
    env,
    [RUNNER, RESIDENT].map((id) => ({ id, address: personaAddress(env, id) })),
    log,
  );
  if (f.skipped.length) throw new Error(`funding skipped: ${f.skipped.join('; ')}`);

  const runner = await open(RUNNER);
  const resident = await open(RESIDENT);

  const shops = (await step('shops on route (zone5)', () => resident.getShops(NORTH.zone5))) ?? [];
  const shop = shops[0];
  if (!shop) throw new Error('no shop listed on the route; run pnpm seed first');

  const run = await step('runner announces a run', () =>
    runner.announceRun({ destZone: HOME.zone6, fromZone: NORTH.zone6, etaMinutes: 20, capacity: 1 }),
  );
  if (!run) throw new Error('cannot continue without a run');
  const runKey = run.key;

  await step('resident sees the run in live runs', async () => {
    const runs = await eventually(() => resident.getLiveRuns(HOME.zone6), (rs) => rs.some((r) => r.key === runKey));
    expect(runs.some((r) => r.key === runKey), 'run not listed');
  });

  const post = (items: string[]) => resident.postRequest({ runKey, shopKey: shop.key, items, maxPrice: 120, tip: 20 });

  // cancel
  const r1 = await step('resident posts request #1', () => post(['Milk 500 ml']));
  if (r1) {
    await step('runner cannot cancel the resident request (NOT_OWNER)', () => expectError(runner.cancelRequest(r1.key), 'NOT_OWNER'));
    await step('resident cancels request #1', () => resident.cancelRequest(r1.key));
    await step('cancelled request is gone', async () => {
      const r = await eventually(() => resident.getRequest(r1.key), (x) => x === null);
      expect(r === null, 'still readable');
    });
  }

  // decline
  const r2 = await step('resident posts request #2', () => post(['Bread, brown']));
  if (r2) {
    await step('resident cannot decline (NOT_OWNER)', () => expectError(resident.declineRequest(r2.key), 'NOT_OWNER'));
    await step('runner declines request #2', () => runner.declineRequest(r2.key));
    await step('resident sees the decline', async () => {
      const d = await eventually(() => resident.getDeclineForRequest(r2.key), (x) => !!x);
      expect(d, 'no decline found');
    });
    await step('accepting a declined request is refused', () => expectError(runner.acceptRequest(r2.key), 'INVALID_INPUT'));
  }

  // full handoff with at-the-gate
  const r3 = await step('resident posts request #3', () => post(['Eggs, 6']));
  if (r3) {
    await step('runner accepts request #3', () => runner.acceptRequest(r3.key));
    await step('resident sees the accept', async () => {
      const a = await eventually(() => resident.getAcceptForRequest(r3.key), (x) => !!x);
      expect(a, 'no accept');
    });
    await step('cancel after accept is refused', () => expectError(resident.cancelRequest(r3.key), 'INVALID_INPUT'));
    await step('runner marks "at the gate"', () => runner.markAtGate(runKey as EntityKey));
    await step('resident sees atGateAt; capacity preserved', async () => {
      const r = await eventually(() => resident.getRun(runKey), (x) => !!x?.atGateAt);
      expect(r?.atGateAt, 'atGateAt missing');
      expect(r?.capacityLeft === 0, `capacityLeft ${r?.capacityLeft}`);
    });
    const del = await step('runner records the delivery with the revealed code', () => runner.recordDelivery({ secret: r3.secret }));
    if (del) {
      await step('delivery verifies against the commit', async () => {
        const v = await runner.verifyDelivery(del.key);
        expect(v.valid, `invalid: ${(v as { reason?: string }).reason}`);
      });
      await step('resident issues a receipt (owned by the runner)', () => resident.issueReceipt({ deliveryKey: del.key, tags: ['on_time', 'exact_item'] }));
      await step('runner profile counts the receipt', async () => {
        const rs = await eventually(() => runner.getReceiptsFor(personaAddress(env, RUNNER)), (x) => x.some((r) => r.valid && r.receipt.delivery === del.key));
        expect(rs.some((r) => r.valid && r.receipt.delivery === del.key), 'receipt not counted');
      });
    }
  }

  await step('runner ends the run', () => runner.cancelRun(runKey));
  runner.close();
  resident.close();
  log(failures ? `\n${failures} step(s) FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(redact(`live-check failed: ${errorText(e)}`));
  process.exit(1);
});
