/**
 * Worker HTTP API (docs/TRIGGERS.md §2), plain node:http:
 *
 *   GET    /health                       { ok, worker, triggers, watches, uptime, ... }
 *   GET    /vapid                        { publicKey }
 *   POST   /channels                     { kind, target, owner, issuedAt, signature } → { channel }
 *   DELETE /channels/:id                 { owner, issuedAt, signature } → { ok: true }
 *   GET    /firings?owner=0x…&since=unix { firings: WorkerFiring[] }
 *
 * Channel writes are authenticated by an EIP-191 signature of the owner over
 * channelMessage(kind | 'delete', target | id, issuedAt), with issuedAt within ±10 minutes.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { CHANNEL_KINDS, channelMessage, randomBytes32, targetHash } from '@arkiv-triggers/core';
import type { Address, Hex } from '@arkiv-triggers/core';
import { verifyMessage } from 'viem';
import { z } from 'zod';
import type { Logger } from './log';
import { errorText } from './log';
import { isExpoToken, parseWebPushTarget, webhookUrlError } from './push';
import { MAX_CHANNELS_PER_OWNER } from './store';
import type { WorkerStore } from './store';

export const ISSUED_AT_WINDOW = 600;
const MAX_BODY = 16 * 1024;

export interface HealthInfo {
  triggers: number;
  watches: number;
  pendingReceipts: number;
  lastTickAt: number | null;
  firedTotal: number;
  /** Worker balance in GLM (decimal string), refreshed periodically; null if unknown. */
  balance: string | null;
}

export interface ServerOptions {
  store: WorkerStore;
  workerAddress: Address;
  vapidPublicKey: string | null;
  allowedOrigins: '*' | string[];
  allowInsecureWebhooks: boolean;
  health: () => HealthInfo;
  log: Logger;
  /** Unix seconds (tests). */
  now?: () => number;
}

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((s) => s.toLowerCase() as Address);
const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130,}$/).transform((s) => s as Hex);
const registerSchema = z.object({
  kind: z.enum(CHANNEL_KINDS),
  target: z.string().min(1).max(4096),
  owner: addressSchema,
  issuedAt: z.number().int().nonnegative(),
  signature: signatureSchema,
});
const deleteSchema = z.object({ owner: addressSchema, issuedAt: z.number().int().nonnegative(), signature: signatureSchema });

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Per-IP token bucket for the mutating endpoints (30 per minute). */
function rateLimiter(perMinute = 30) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (ip: string): boolean => {
    const now = Date.now();
    const b = buckets.get(ip) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    if (buckets.size > 10_000) buckets.clear();
    buckets.set(ip, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = chunk as Buffer;
    size += b.length;
    if (size > MAX_BODY) throw new HttpError(413, 'body too large');
    chunks.push(b);
  }
  if (!size) throw new HttpError(400, 'JSON body required');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

const zodMessage = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ').slice(0, 300);

export function createWorkerServer(o: ServerOptions): Server {
  const started = Date.now();
  const now = o.now ?? (() => Math.floor(Date.now() / 1000));
  const allow = rateLimiter();

  function cors(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (o.allowedOrigins === '*') res.setHeader('access-control-allow-origin', '*');
    else if (origin && o.allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
    }
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, ngrok-skip-browser-warning');
    res.setHeader('access-control-max-age', '600');
  }

  function send(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.end(JSON.stringify(body));
  }

  async function verify(owner: Address, message: string, signature: Hex, issuedAt: number) {
    if (Math.abs(now() - issuedAt) > ISSUED_AT_WINDOW) throw new HttpError(401, 'issuedAt outside the ±10 min window');
    let ok = false;
    try {
      ok = await verifyMessage({ address: owner, message, signature });
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError(401, 'bad signature');
  }

  async function register(req: IncomingMessage) {
    const parsed = registerSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const { kind, target, owner, issuedAt, signature } = parsed.data;
    if (kind === 'webpush' && !parseWebPushTarget(target)) throw new HttpError(400, 'target must be a PushSubscription JSON (https endpoint, keys.p256dh, keys.auth)');
    if (kind === 'expo' && !isExpoToken(target)) throw new HttpError(400, 'target must be an Expo push token');
    if (kind === 'webhook') {
      const bad = webhookUrlError(target, o.allowInsecureWebhooks);
      if (bad) throw new HttpError(400, bad);
    }
    await verify(owner, channelMessage(kind, target, issuedAt), signature, issuedAt);
    const hash = targetHash(target);
    const existing = o.store.findChannel(owner, hash);
    if (existing) return { channel: existing.id };
    if (o.store.countChannels(owner) >= MAX_CHANNELS_PER_OWNER) throw new HttpError(429, `at most ${MAX_CHANNELS_PER_OWNER} channels per owner`);
    const id = randomBytes32();
    o.store.putChannel({ id, kind, owner, target, targetHash: hash, createdAt: now() });
    o.log('info', 'channel registered', { channel: id, kind, owner });
    return { channel: id };
  }

  async function unregister(req: IncomingMessage, id: string) {
    const parsed = deleteSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const { owner, issuedAt, signature } = parsed.data;
    await verify(owner, channelMessage('delete', id, issuedAt), signature, issuedAt);
    const c = o.store.getChannel(id);
    // Same answer for "missing" and "not yours": ids are not an oracle.
    if (!c || c.owner !== owner) throw new HttpError(404, 'no such channel');
    o.store.removeChannel(id);
    o.log('info', 'channel removed', { channel: c.id, owner });
    return { ok: true };
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    cors(req, res);
    const url = new URL(req.url ?? '/', 'http://worker.local');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    const ip = (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');

    if (method === 'GET' && (path === '/health' || path === '/')) {
      return send(res, 200, { ok: true, worker: o.workerAddress, uptime: Math.round((Date.now() - started) / 1000), channels: o.store.channelCount, ...o.health() });
    }
    if (method === 'GET' && path === '/vapid') {
      if (!o.vapidPublicKey) return send(res, 503, { error: 'web push not configured on this worker' });
      return send(res, 200, { publicKey: o.vapidPublicKey });
    }
    if (method === 'GET' && path === '/firings') {
      const owner = addressSchema.safeParse(url.searchParams.get('owner') ?? '');
      if (!owner.success) return send(res, 400, { error: 'owner must be an address' });
      const sinceRaw = Number(url.searchParams.get('since') ?? '');
      const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : now() - 24 * 3600;
      return send(res, 200, { firings: o.store.firingsFor(owner.data, since) });
    }
    if (path === '/channels' && method === 'POST') {
      if (!allow(ip)) return send(res, 429, { error: 'slow down' });
      return send(res, 200, await register(req));
    }
    const m = /^\/channels\/(0x[0-9a-fA-F]{64})$/.exec(path);
    if (m && method === 'DELETE') {
      if (!allow(ip)) return send(res, 429, { error: 'slow down' });
      return send(res, 200, await unregister(req, (m[1] as string).toLowerCase()));
    }
    return send(res, 404, { error: 'not found' });
  }

  return createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      o.log('error', 'request failed', { method: req.method, path: (req.url ?? '').split('?')[0], error: errorText(e) });
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
      else res.end();
    });
  });
}
