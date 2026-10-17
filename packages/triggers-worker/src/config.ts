/**
 * Worker configuration from the environment, falling back to the repo-root `.env` (the same file
 * scripts/seed reads; process env wins, so a host like Render just sets env vars). Keys are never
 * printed: the logger redacts every secret listed in `secrets`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RPC_URL } from '@bhaiya-please/core/port';
import type { Address, Hex } from '@arkiv-triggers/core';
import { concat, keccak256, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ENV_PATH = resolve(REPO_ROOT, '.env');

/** Persona id used to derive the worker key from SEED_PRIVATE_KEY (same scheme as scripts/seed). */
export const WORKER_PERSONA_ID = 'triggers-worker';
export const DEFAULT_PORT = 8787;
export const DEFAULT_POLL_MS = 10_000;
/** Below this the worker refuses (protects the shared RPC quota). */
export const MIN_POLL_MS = 5_000;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface WorkerConfig {
  privateKey: Hex;
  keySource: 'TRIGGERS_WORKER_PRIVATE_KEY' | 'SEED_PRIVATE_KEY (derived)';
  address: Address;
  rpcUrl: string;
  accessKey: string;
  port: number;
  pollMs: number;
  triggerRefreshMs: number;
  dataDir: string;
  /** '*' or an explicit origin list. */
  allowedOrigins: '*' | string[];
  vapid: VapidConfig | null;
  /** Dev only: allow http:// and private-network webhook targets. */
  allowInsecureWebhooks: boolean;
  /** Every secret value, for log redaction. */
  secrets: string[];
}

const isKey = (k: string | undefined): k is Hex => !!k && /^0x[0-9a-fA-F]{64}$/.test(k);

export function readDotEnv(path = ENV_PATH): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export function envGetter(): (k: string) => string {
  const file = readDotEnv();
  return (k) => process.env[k] || file[k] || '';
}

/** keccak256(seedKey ‖ utf8("bhaiyaplease:persona:triggers-worker")), like scripts/seed personaKey. */
export function deriveWorkerKey(seedKey: Hex): Hex {
  return keccak256(concat([seedKey, stringToHex(`bhaiyaplease:persona:${WORKER_PERSONA_ID}`)]));
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(get = envGetter()): WorkerConfig {
  const own = get('TRIGGERS_WORKER_PRIVATE_KEY');
  const seed = get('SEED_PRIVATE_KEY');
  let privateKey: Hex;
  let keySource: WorkerConfig['keySource'];
  if (isKey(own)) {
    privateKey = own;
    keySource = 'TRIGGERS_WORKER_PRIVATE_KEY';
  } else if (isKey(seed)) {
    privateKey = deriveWorkerKey(seed);
    keySource = 'SEED_PRIVATE_KEY (derived)';
  } else {
    throw new ConfigError(
      [
        'No worker key: set TRIGGERS_WORKER_PRIVATE_KEY (0x + 64 hex, a dedicated test wallet), or SEED_PRIVATE_KEY',
        `to derive one (persona "${WORKER_PERSONA_ID}"). Either in the environment or in ${ENV_PATH}.`,
        'Generate a key: node -e "console.log(require(\'viem/accounts\').generatePrivateKey())"',
      ].join('\n'),
    );
  }
  const num = (k: string, d: number) => {
    const v = get(k);
    if (!v) return d;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new ConfigError(`${k} must be a positive number`);
    return Math.floor(n);
  };
  const pollMs = num('TRIGGERS_POLL_MS', DEFAULT_POLL_MS);
  if (pollMs < MIN_POLL_MS) throw new ConfigError(`TRIGGERS_POLL_MS must be >= ${MIN_POLL_MS} (one query per watch per tick)`);
  const origins = get('TRIGGERS_ALLOWED_ORIGINS').trim();
  const vapidPublic = get('TRIGGERS_VAPID_PUBLIC');
  const vapidPrivate = get('TRIGGERS_VAPID_PRIVATE');
  const dataDir = get('TRIGGERS_DATA_DIR') || './.triggers-data';
  const accessKey = get('ARKIV_ACCESS_KEY');
  return {
    privateKey,
    keySource,
    address: privateKeyToAccount(privateKey).address.toLowerCase() as Address,
    rpcUrl: (get('ARKIV_RPC_URL') || DEFAULT_RPC_URL).replace(/\/+$/, ''),
    accessKey,
    port: num('TRIGGERS_PORT', 0) || num('PORT', DEFAULT_PORT),
    pollMs,
    triggerRefreshMs: Math.max(num('TRIGGERS_REFRESH_MS', 30_000), pollMs),
    dataDir: isAbsolute(dataDir) ? dataDir : resolve(process.cwd(), dataDir),
    allowedOrigins: !origins || origins === '*' ? '*' : origins.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
    vapid:
      vapidPublic && vapidPrivate
        ? { publicKey: vapidPublic, privateKey: vapidPrivate, subject: get('TRIGGERS_VAPID_SUBJECT') || 'mailto:triggers@example.invalid' }
        : null,
    allowInsecureWebhooks: get('TRIGGERS_ALLOW_INSECURE_WEBHOOKS') === '1',
    secrets: [privateKey, own, seed, accessKey, vapidPrivate].filter((s) => !!s && s.length > 4),
  };
}

/** Scrubs secrets from any text (SDK/viem errors can echo request details). */
export function makeRedactor(secrets: readonly string[]): (text: string) => string {
  const list = [...new Set(secrets.flatMap((s) => [s, s.toLowerCase(), s.replace(/^0x/, '')]))].filter((s) => s.length > 4);
  return (text) => {
    let t = text;
    for (const s of list) t = t.split(s).join('***');
    return t;
  };
}
