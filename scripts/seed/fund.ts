/**
 * Funds arbitrary Tiramisu addresses (e.g. a judge's or tester's in-browser burner wallet) from the
 * SEED wallet, so the real-chain app can be used without the public faucet. Operator tooling: the
 * app never holds a funding key.
 *
 *   pnpm fund 0xabc... 0xdef...          tops each up to SEED_FUND_GLM (default 0.02 GLM)
 *   SEED_FUND_GLM=0.05 pnpm fund 0xabc...
 *
 * Needs .env SEED_PRIVATE_KEY. Prints addresses and amounts only, never keys.
 */
import { formatEther } from 'viem';
import { errorText, fundWallets, loadEnvOrExit, makeRedactor, seedAddress } from './common';
import type { Address } from '@bhaiya-please/core';

const env = loadEnvOrExit('fund');
const redact = makeRedactor(env);
const log = (s: string) => console.log(redact(s));

async function main(): Promise<void> {
  const addrs = process.argv.slice(2).filter((a) => a !== '--');
  const bad = addrs.filter((a) => !/^0x[0-9a-fA-F]{40}$/.test(a));
  if (addrs.length === 0 || bad.length) {
    console.error(`usage: pnpm fund <0xaddress> [...]${bad.length ? `  (invalid: ${bad.join(', ')})` : ''}`);
    process.exit(1);
  }
  log(`Funding ${addrs.length} address(es) from ${seedAddress(env)} up to ${env.fundGlm} GLM each ...`);
  const r = await fundWallets(
    env,
    addrs.map((a, i) => ({ id: `addr-${i + 1}`, address: a.toLowerCase() as Address })),
    log,
  );
  log(`${r.funded} funded, ${r.alreadyOk} already had >= half, ${r.skipped.length} skipped; seed balance ${formatEther(r.seedBalance)} GLM`);
  for (const s of r.skipped) log(`  skipped: ${s}`);
  if (r.skipped.length) process.exit(1);
}

main().catch((e) => {
  console.error(redact(`fund failed: ${errorText(e)}`));
  process.exit(1);
});
