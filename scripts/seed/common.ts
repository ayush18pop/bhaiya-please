/**
 * Shared helpers for seed.ts and heartbeat.ts: env loading, deterministic persona wallets,
 * funding, and a BhaiyaPlease instance per wallet. Keys are never printed or written anywhere.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { BhaiyaPleaseError, createBhaiyaPlease, DEFAULT_RPC_URL } from '@bhaiya-please/core';
import type { Address, BhaiyaPlease } from '@bhaiya-please/core';
import { concat, createPublicClient, createWalletClient, formatEther, http, keccak256, parseEther, stringToHex } from 'viem';
import type { Hex } from 'viem';
import { nonceManager, privateKeyToAccount } from 'viem/accounts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_PATH = resolve(ROOT, '.env');
const ENV_KEYS = ['SEED_PRIVATE_KEY', 'VERIFIER_PRIVATE_KEY', 'ARKIV_RPC_URL', 'ARKIV_ACCESS_KEY', 'SEED_FUND_GLM'];

export const PERSONA_IDS = {
  verifier: 'verifier',
  runnerTrusted: 'runner-trusted',
  runnerVerified: 'runner-verified',
  runnerNew: 'runner-new',
  residentDemo: 'resident-demo',
} as const;

const isKey = (k: string | undefined): k is Hex => !!k && /^0x[0-9a-fA-F]{64}$/.test(k);

function readDotEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export interface Env {
  seedKey: Hex;
  verifierKey: Hex | null;
  rpcUrl: string;
  accessKey: string;
  /** GLM sent to each persona wallet that needs funding. */
  fundGlm: string;
}

/** Process env wins over .env (CI passes secrets as env vars). Exits with a helpful message if unusable. */
export function loadEnvOrExit(script: string): Env {
  const file = readDotEnv();
  const get = (k: string) => process.env[k] || file[k] || '';
  const seedKey = get('SEED_PRIVATE_KEY');
  if (!isKey(seedKey)) {
    console.error(
      [
        '',
        `${script}: no usable SEED_PRIVATE_KEY, so there is nothing to sign with. Nothing was sent.`,
        existsSync(ENV_PATH) ? '(.env exists, but SEED_PRIVATE_KEY is missing or not 0x + 64 hex)' : `(no .env found at ${ENV_PATH})`,
        '',
        '  1. cp .env.example .env',
        '  2. Generate a test key:  node -e "console.log(require(\'viem/accounts\').generatePrivateKey())"',
        '  3. Put it in .env as SEED_PRIVATE_KEY=0x...  (test key only, never reuse a real wallet)',
        '  4. Fund its address at https://hub.arkiv.network/faucet',
        '  5. Optional: ARKIV_ACCESS_KEY from https://hub.arkiv.network (higher rate limits)',
        `  6. pnpm ${script}`,
        '',
        'In CI the same names are read from environment variables (GitHub Actions secrets).',
        '',
      ].join('\n'),
    );
    // Locally a missing key is a setup step, not a failure; in CI it must fail the job loudly.
    process.exit(process.env.CI ? 1 : 0);
  }
  const verifierKey = get('VERIFIER_PRIVATE_KEY');
  return {
    seedKey,
    verifierKey: isKey(verifierKey) ? verifierKey : null,
    rpcUrl: (get('ARKIV_RPC_URL') || DEFAULT_RPC_URL).replace(/\/+$/, ''),
    accessKey: get('ARKIV_ACCESS_KEY'),
    fundGlm: get('SEED_FUND_GLM') || '0.02',
  };
}

/** Scrub secrets from anything we print (SDK/viem errors can echo request URLs). */
export function makeRedactor(env: Env): (text: string) => string {
  const secrets = [env.seedKey, env.verifierKey, env.accessKey].filter((s): s is string => !!s && s.length > 4);
  return (text) => {
    let t = text;
    for (const s of secrets) t = t.split(s).join('***').split(s.toLowerCase()).join('***');
    return t;
  };
}

export function errorText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 3 && cur && typeof cur === 'object'; i++) {
    const x = cur as { name?: string; code?: string; shortMessage?: string; message?: string; cause?: unknown };
    parts.push(`${x.name ?? 'Error'}${x.code ? `[${x.code}]` : ''}: ${(x.shortMessage ?? x.message ?? '').split('\n')[0]}`);
    cur = x.cause;
  }
  return parts.join(' <- ').slice(0, 400);
}

/** keccak256(seedKey ‖ utf8(personaId)) → persona private key. Deterministic, never printed. */
export function personaKey(env: Env, personaId: string): Hex {
  if (personaId === PERSONA_IDS.verifier && env.verifierKey) return env.verifierKey;
  return keccak256(concat([env.seedKey, stringToHex(`bhaiyaplease:persona:${personaId}`)]));
}

export const personaAddress = (env: Env, personaId: string): Address =>
  privateKeyToAccount(personaKey(env, personaId)).address.toLowerCase() as Address;

export const seedAddress = (env: Env): Address => privateKeyToAccount(env.seedKey).address.toLowerCase() as Address;

export function rpcUrl(env: Env): string {
  return env.accessKey ? `${env.rpcUrl}/${encodeURIComponent(env.accessKey)}` : env.rpcUrl;
}

/** Real core instance acting as `personaId`; the verifier is the only trusted verifier. */
export function openPersona(env: Env, personaId: string): Promise<BhaiyaPlease> {
  return createBhaiyaPlease({
    rpcUrl: env.rpcUrl,
    ...(env.accessKey ? { accessKey: env.accessKey } : {}),
    signer: { kind: 'privateKey', privateKey: personaKey(env, personaId) },
    trustedVerifiers: [personaAddress(env, PERSONA_IDS.verifier)],
  });
}

// ------------------------------------------------------------------ funding

export function chainClients(env: Env) {
  const transport = http(rpcUrl(env));
  const account = privateKeyToAccount(env.seedKey, { nonceManager });
  return {
    pub: createPublicClient({ chain: tiramisu, transport }),
    wallet: createWalletClient({ chain: tiramisu, transport, account }),
    account,
  };
}

export interface FundResult {
  funded: number;
  alreadyOk: number;
  skipped: string[];
  seedBalance: bigint;
}

/**
 * Tops each target up to `fundGlm` if below half of it. Transfers are broadcast back-to-back with
 * a nonce manager and confirmed together. Skips (with reasons) rather than failing when the seed
 * wallet cannot cover everything.
 */
export async function fundWallets(env: Env, targets: { id: string; address: Address }[], log: (s: string) => void): Promise<FundResult> {
  const { pub, wallet, account } = chainClients(env);
  const amount = parseEther(env.fundGlm);
  const threshold = amount / 2n;
  const gasReserve = parseEther('0.002');
  let seedBalance = await pub.getBalance({ address: account.address });
  const result: FundResult = { funded: 0, alreadyOk: 0, skipped: [], seedBalance };
  const sent: Hex[] = [];
  for (const t of targets) {
    const bal = await pub.getBalance({ address: t.address });
    if (bal >= threshold) {
      result.alreadyOk++;
      continue;
    }
    const need = amount - bal;
    if (seedBalance < need + gasReserve) {
      result.skipped.push(`${t.id} (${t.address}): seed wallet has ${formatEther(seedBalance)} GLM, needs ${formatEther(need)}`);
      continue;
    }
    try {
      sent.push(await wallet.sendTransaction({ to: t.address, value: need }));
      seedBalance -= need + gasReserve;
      result.funded++;
    } catch (e) {
      result.skipped.push(`${t.id} (${t.address}): transfer failed (${errorText(e)})`);
    }
  }
  for (const hash of sent) await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (sent.length) log(`funded ${sent.length} wallet(s) with up to ${env.fundGlm} GLM each`);
  result.seedBalance = await pub.getBalance({ address: account.address });
  return result;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export { BhaiyaPleaseError };
export const isFundingError = (e: unknown) => e instanceof BhaiyaPleaseError && e.code === 'INSUFFICIENT_FUNDS';
