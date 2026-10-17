/**
 * Subscriber-side helpers: build trigger entities, list / delete them, read firing receipts, and
 * register delivery channels with a worker over HTTP. Pure TS (fetch + viem hashing), safe in the
 * browser, React Native and Node.
 */
import { keccak256, sha256, stringToHex } from 'viem';
import type { ChannelKind } from './actions';
import {
  baseWhere,
  decodeFiring,
  decodeTrigger,
  encodeTrigger,
  FIRING_TYPE,
  LIMITS,
  pred,
  rawString,
  TRIGGER_TYPE,
  TriggerInputError,
  TRIGGERS_PROJECT,
} from './codec';
import type { DropSink, Firing, Trigger, TriggerEvent, TriggerFields } from './codec';
import type { Address, ArkivPort, CreateSpec, EntityKey, Hex, RawAttr, ReadPort } from './port';

// ------------------------------------------------------------------ triggers

export interface TriggerInput extends TriggerFields {
  /**
   * Lifetime in seconds. Set it to the watched subject's lifetime so the subscription cleans
   * itself up through Arkiv expiry (no unsubscribe job).
   */
  expiresInSeconds: number;
}

/**
 * Validated CreateSpec for a `trigger` entity. The subscriber writes it with their own wallet,
 * typically batched with the action that needs it:
 *
 *   await port.write((w) => w.batch({ creates: [buildTriggerSpec({...}), ...] }))
 *
 * Throws TriggerInputError on invalid input.
 */
export function buildTriggerSpec(input: TriggerInput): CreateSpec {
  const { expiresInSeconds, ...fields } = input;
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > LIMITS.maxTriggerLifetime) {
    throw new TriggerInputError(`expiresInSeconds must be in 1..${LIMITS.maxTriggerLifetime}`);
  }
  const { attributes, payload } = encodeTrigger(fields);
  return { attributes, payload, readonly: false, permissionlessExtension: false, expiresInSeconds: Math.ceil(expiresInSeconds) };
}

/** Live, well-formed triggers owned by `owner` (newest first). Malformed ones are skipped. */
export async function listMyTriggers(port: ReadPort, owner: Address, drop?: DropSink): Promise<Trigger[]> {
  const rows = await port.query({ where: baseWhere(TRIGGERS_PROJECT, TRIGGER_TYPE), owner: owner.toLowerCase() as Address });
  const now = port.now();
  return rows
    .map((r) => decodeTrigger(r, drop))
    .filter((t): t is Trigger => t !== null && t.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Deletes triggers (unsubscribe) in batches of 50. Only the owner can delete. Returns tx hashes. */
export async function deleteTriggers(port: ArkivPort, keys: readonly EntityKey[]): Promise<Hex[]> {
  const unique = [...new Set(keys.map((k) => k.toLowerCase() as EntityKey))];
  const out: Hex[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const r = await port.write((w) => w.batch({ deletes: chunk }));
    out.push(r.txHash);
  }
  return out;
}

/** Firing receipts for these triggers (or every trigger `owner` owns), newest first. */
export async function listFiringsFor(
  port: ReadPort,
  target: readonly EntityKey[] | Address,
  opts: { since?: number; drop?: DropSink } = {},
): Promise<Firing[]> {
  const keys = typeof target === 'string' ? (await listMyTriggers(port, target, opts.drop)).map((t) => t.key) : [...target];
  const unique = [...new Set(keys.map((k) => k.toLowerCase() as EntityKey))];
  const out: Firing[] = [];
  // One query per chunk of trigger keys (an `or` of key equalities), not one per trigger.
  for (let i = 0; i < unique.length; i += 12) {
    const chunk = unique.slice(i, i + 12);
    const byTrigger = chunk.length === 1 ? pred.key('trigger', chunk[0] as EntityKey) : pred.or(...chunk.map((k) => pred.key('trigger', k)));
    const rows = await port.query({ where: [...baseWhere(TRIGGERS_PROJECT, FIRING_TYPE), byTrigger] });
    for (const r of rows) {
      const f = decodeFiring(r, opts.drop);
      if (f && (opts.since === undefined || f.at >= opts.since)) out.push(f);
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Stable firing id keccak256("trigger|entity|event") (the push dedupe id). */
export function firingId(trigger: EntityKey, entity: EntityKey, event: TriggerEvent): Hex {
  return keccak256(stringToHex(`${trigger.toLowerCase()}|${entity.toLowerCase()}|${event}`));
}

// ------------------------------------------------------------------ templates

const PLACEHOLDER = /\{([$a-z0-9_.-]{1,32})\}/gi;

/**
 * Fills `{name}` placeholders from an entity's attributes (RawAttr cells or plain values).
 * Unknown placeholders become empty. Each value is capped at 64 chars, the result at LIMITS.body.
 */
export function fillTemplate(
  body: string,
  attrs: Readonly<Record<string, RawAttr | string | number | bigint | boolean | undefined>>,
): string {
  const filled = body.replace(PLACEHOLDER, (_m, name: string) => {
    const v = attrs[name];
    if (v === undefined) return '';
    const s = typeof v === 'object' ? (rawString(v) ?? '') : String(v);
    return s.slice(0, 64);
  });
  return filled.slice(0, LIMITS.body);
}

// ------------------------------------------------------------------ channels (worker HTTP API)

/** Verb in a signed channel message: a channel kind (register) or 'delete' (unregister). */
export type ChannelVerb = ChannelKind | 'delete';

/** sha256 of the UTF-8 target string, 0x-prefixed lowercase hex. */
export function targetHash(target: string): Hex {
  return sha256(stringToHex(target));
}

/**
 * The exact EIP-191 message the owner signs (personal_sign / viem signMessage):
 *
 *   arkiv-triggers channel\n<kind>\n<sha256(target)>\n<issuedAt>
 *
 * For unregistering, kind = 'delete' and target = the channel id. `issuedAt` is unix seconds and
 * must be within ±10 minutes of the worker's clock.
 */
export function channelMessage(kind: ChannelVerb, target: string, issuedAt: number): string {
  return `arkiv-triggers channel\n${kind}\n${targetHash(target)}\n${Math.floor(issuedAt)}`;
}

/**
 * Canonical `target` string for a Web Push subscription. Pass the same string to channelMessage
 * and registerChannel (the worker hashes exactly what it receives).
 */
export function webPushTarget(subscription: { toJSON?: () => unknown } | Record<string, unknown>): string {
  const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  const s = json as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys?.p256dh, auth: s.keys?.auth } });
}

export interface ChannelRegistration {
  kind: ChannelKind;
  /** PushSubscription JSON (webPushTarget), Expo push token, or https URL. */
  target: string;
  owner: Address;
  issuedAt: number;
  /** owner's signature over channelMessage(kind, target, issuedAt). */
  signature: Hex;
}

export interface ChannelUnregistration {
  channel: Hex;
  owner: Address;
  issuedAt: number;
  /** owner's signature over channelMessage('delete', channel, issuedAt). */
  signature: Hex;
}

export class WorkerHttpError extends Error {
  override readonly name = 'WorkerHttpError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const base = (url: string) => url.replace(/\/+$/, '');

async function call<T>(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = undefined;
    try {
      body = text ? (JSON.parse(text) as unknown) : undefined;
    } catch {
      body = undefined;
    }
    if (!res.ok) {
      const msg = (body as { error?: unknown } | undefined)?.error;
      throw new WorkerHttpError(res.status, typeof msg === 'string' ? msg : `HTTP ${res.status}`);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** POST /channels → channel id. Re-registering the same (owner, target) returns the same id. */
export async function registerChannel(workerUrl: string, reg: ChannelRegistration): Promise<{ channel: Hex }> {
  return call<{ channel: Hex }>(`${base(workerUrl)}/channels`, json('POST', reg));
}

/** DELETE /channels/:id (signed with channelMessage('delete', id, issuedAt)). */
export async function unregisterChannel(workerUrl: string, req: ChannelUnregistration): Promise<{ ok: true }> {
  const { channel, ...body } = req;
  return call<{ ok: true }>(`${base(workerUrl)}/channels/${channel}`, json('DELETE', body));
}

export interface WorkerHealth {
  ok: boolean;
  worker: Address;
  triggers: number;
  watches?: number;
  uptime: number;
}

export const fetchWorkerHealth = (workerUrl: string) => call<WorkerHealth>(`${base(workerUrl)}/health`);

/** The worker's VAPID public key (applicationServerKey for PushManager.subscribe). */
export const fetchVapidKey = (workerUrl: string) => call<{ publicKey: string }>(`${base(workerUrl)}/vapid`);

/** One entry of GET /firings (worker convenience log; the chain is the source of truth). */
export interface WorkerFiring {
  firing: Hex;
  receipt?: EntityKey;
  trigger: EntityKey;
  entity: EntityKey;
  event: TriggerEvent;
  outcome: string;
  at: number;
  block: string;
  label?: string;
  body?: string;
  href?: string;
  attestation?: EntityKey;
}

export async function fetchWorkerFirings(workerUrl: string, owner: Address, since = 0): Promise<WorkerFiring[]> {
  const q = new URLSearchParams({ owner, since: String(Math.floor(since)) });
  const r = await call<{ firings: WorkerFiring[] }>(`${base(workerUrl)}/firings?${q.toString()}`);
  return r.firings;
}
