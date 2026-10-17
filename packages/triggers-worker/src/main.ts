/**
 * Arkiv Triggers worker entry point (`pnpm triggers:worker`).
 *
 *   env (process env wins over the repo-root .env):
 *     TRIGGERS_WORKER_PRIVATE_KEY   worker wallet (else derived from SEED_PRIVATE_KEY, persona "triggers-worker")
 *     ARKIV_RPC_URL, ARKIV_ACCESS_KEY
 *     TRIGGERS_PORT (8787; PORT also honored), TRIGGERS_POLL_MS (10000, min 5000), TRIGGERS_REFRESH_MS (30000)
 *     TRIGGERS_DATA_DIR (./.triggers-data), TRIGGERS_ALLOWED_ORIGINS (* or comma list)
 *     TRIGGERS_VAPID_PUBLIC / TRIGGERS_VAPID_PRIVATE / TRIGGERS_VAPID_SUBJECT (pnpm triggers:vapid)
 *     TRIGGERS_LOG_LEVEL (info), TRIGGERS_ALLOW_INSECURE_WEBHOOKS=1 (dev only)
 *
 * The worker pays gas for firing receipts (and attestations): fund it with `pnpm fund <address>`.
 */
import { createTriggerEngine } from '@arkiv-triggers/core';
import { createArkivAdapter } from '@bhaiya-please/core/port';
import { formatEther } from 'viem';
import { ConfigError, envGetter, loadConfig, makeRedactor } from './config';
import { createLogger, errorText } from './log';
import type { Level } from './log';
import { defaultPlugins } from './plugins';
import { createSenders } from './push';
import { createWorkerServer } from './server';
import { WorkerStore } from './store';

const BALANCE_REFRESH_MS = 5 * 60_000;

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`\ntriggers-worker: ${e.message}\n`);
      process.exit(process.env.CI ? 1 : 0);
    }
    throw e;
  }
  const redact = makeRedactor(cfg.secrets);
  const level = (envGetter()('TRIGGERS_LOG_LEVEL') || 'info') as Level;
  const log = createLogger(redact, ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info');

  let lastSdkError = 0;
  const port = await createArkivAdapter({
    rpcUrl: cfg.rpcUrl,
    ...(cfg.accessKey ? { accessKey: cfg.accessKey } : {}),
    signer: { kind: 'privateKey', privateKey: cfg.privateKey },
    trustedVerifiers: [],
    onSdkError: (op, err) => {
      // The adapter reports every failed attempt; keep logs readable (at most one per 10 s).
      if (Date.now() - lastSdkError < 10_000) return;
      lastSdkError = Date.now();
      log('debug', 'sdk error', { op, error: errorText(err) });
    },
  });

  const store = await WorkerStore.open(cfg.dataDir);
  const senders = createSenders({ store, vapid: cfg.vapid, log, allowInsecureWebhooks: cfg.allowInsecureWebhooks });
  const engine = createTriggerEngine({
    port,
    workerAddress: cfg.address,
    actions: { channels: store.directory(), push: senders.push, webhook: senders.webhook },
    plugins: defaultPlugins(),
    store: store.engineStore(),
    pollMs: cfg.pollMs,
    triggerRefreshMs: cfg.triggerRefreshMs,
    onLog: (e) => log(e.level, e.msg, e.data),
    onFiring: (f) => store.logFiring(f),
    onReceipt: (r) => store.recordReceipt(r),
  });

  let balance: string | null = null;
  const refreshBalance = async () => {
    try {
      const wei = await port.balance(cfg.address);
      balance = formatEther(wei);
      if (wei === 0n) log('warn', `worker wallet is empty: receipts cannot be written. Fund it: pnpm fund ${cfg.address}`, { worker: cfg.address });
    } catch (e) {
      log('warn', 'balance check failed', { error: errorText(e) });
    }
  };
  await refreshBalance();
  const balanceTimer = setInterval(() => void refreshBalance(), BALANCE_REFRESH_MS);

  const server = createWorkerServer({
    store,
    workerAddress: cfg.address,
    vapidPublicKey: cfg.vapid?.publicKey ?? null,
    allowedOrigins: cfg.allowedOrigins,
    allowInsecureWebhooks: cfg.allowInsecureWebhooks,
    log,
    health: () => {
      const s = engine.stats();
      return { triggers: s.triggers, watches: s.watches, pendingReceipts: s.pendingReceipts, lastTickAt: s.lastTickAt, firedTotal: s.firedTotal, balance };
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, () => resolve());
  });

  log('info', 'arkiv triggers worker up', {
    worker: cfg.address,
    keySource: cfg.keySource,
    balance,
    rpc: cfg.rpcUrl,
    accessKey: cfg.accessKey ? 'set' : 'none',
    http: `:${cfg.port}`,
    pollMs: cfg.pollMs,
    triggerRefreshMs: cfg.triggerRefreshMs,
    dataDir: cfg.dataDir,
    webPush: cfg.vapid ? 'on' : 'off (run pnpm triggers:vapid)',
    origins: cfg.allowedOrigins,
    fund: `pnpm fund ${cfg.address}`,
  });
  engine.start();

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log('info', 'shutting down', { signal });
    clearInterval(balanceTimer);
    const hard = setTimeout(() => process.exit(1), 20_000);
    hard.unref();
    server.close();
    try {
      await engine.stop();
      await store.saveNow();
    } catch (e) {
      log('error', 'shutdown error', { error: errorText(e) });
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (e) => log('error', 'unhandled rejection', { error: errorText(e) }));
}

main().catch((e: unknown) => {
  let secrets: string[] = [];
  try {
    secrets = loadConfig().secrets;
  } catch {
    secrets = [];
  }
  console.error(makeRedactor(secrets)(`triggers-worker failed: ${errorText(e)}`));
  process.exit(1);
});
