/**
 * The Arkiv Triggers engine (docs/TRIGGERS.md §3). Pure TS over core's ArkivPort, so the same code
 * runs in the Node worker and in-page (the sandbox) over the mock chain.
 *
 * Per tick:
 *   1. refresh the trigger set (every `triggerRefreshMs`): live `trigger`s for this worker or any;
 *   2. group triggers into distinct watches (project, type, match); ONE query per watch;
 *   3. diff each watch against its previous snapshot → created / patched / expiring / expired / deleted;
 *   4. per (trigger, entity, event): local seen set → existing on-chain `firing` → `unless` at head →
 *      channel ownership → action (push / webhook / attest plugin);
 *   5. queue a firing receipt; receipts are written in batches (≤ maxBatch creates per tx, at most
 *      every `flushMs`), an attest plugin's entity in the same batch as its receipt.
 *
 * One bad trigger, watch or action never stops the loop: every unit is isolated and logged.
 */
import { keccak256, stringToHex } from 'viem';
import { jsonAttributes } from './actions';
import type {
  AttestContext,
  ChannelInfo,
  DeliveryResult,
  EngineActions,
  PluginRegistry,
  PushMessage,
  WebhookBody,
} from './actions';
import { fillTemplate, firingId } from './client';
import {
  baseWhere,
  decodeFiring,
  decodeTrigger,
  FIRING_TYPE,
  firingSpec,
  pred,
  TRIGGER_TYPE,
  TRIGGERS_PROJECT,
  ZERO_ADDRESS,
} from './codec';
import type { FiringFields, FiringOutcome, Trigger, TriggerEvent } from './codec';
import type { Address, ArkivPort, CreateSpec, EntityKey, Hex, RawAttr, RawEntity, UnixSeconds } from './port';

// ------------------------------------------------------------------ public types

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/** Structured log line. `data` never contains channel targets (the engine never sees them). */
export interface EngineLog {
  level: LogLevel;
  msg: string;
  data?: Record<string, unknown>;
}

/** Persistence for engine state (seen set, watch snapshots). JSON-serializable values only. */
export interface EngineStore {
  load(): Promise<unknown> | unknown;
  save(state: EngineState): Promise<void> | void;
}

/** Emitted right after an action ran (before its receipt is on chain). */
export interface FiringEvent {
  /** keccak256(trigger|entity|event): stable dedupe id. */
  id: Hex;
  trigger: Trigger;
  entity: EntityKey;
  event: TriggerEvent;
  outcome: FiringOutcome;
  detail?: string;
  block: bigint;
  at: UnixSeconds;
  /** The push message that was sent (push triggers). */
  message?: PushMessage;
}

/** Emitted once a firing receipt is on chain. */
export interface ReceiptEvent {
  id: Hex;
  receipt: EntityKey;
  attestation?: EntityKey;
  trigger: EntityKey;
  entity: EntityKey;
  event: TriggerEvent;
  outcome: FiringOutcome;
  txHash: Hex;
}

export interface TriggerEngineOptions {
  /** Port with the worker's wallet (port.address must equal workerAddress to write receipts). */
  port: ArkivPort;
  workerAddress: Address;
  actions?: EngineActions;
  plugins?: PluginRegistry;
  store?: EngineStore;
  /** Chain time (unix seconds). Default port.now(). */
  clock?: () => UnixSeconds;
  /** Poll tick interval. Default 10 000 ms. */
  pollMs?: number;
  /** Trigger-set refresh interval. Default 30 000 ms. 0 = every tick. */
  triggerRefreshMs?: number;
  /** Max age of a queued receipt before a flush. Default 5 000 ms. 0 = flush at the end of every tick. */
  flushMs?: number;
  /** Max creates per receipt tx. Default 20. */
  maxBatch?: number;
  onLog?: (e: EngineLog) => void;
  onFiring?: (f: FiringEvent) => void;
  onReceipt?: (r: ReceiptEvent) => void;
}

export interface TickReport {
  triggers: number;
  watches: number;
  /** Arkiv reads issued this tick (watch queries + lookups + unless + gets). */
  queries: number;
  candidates: number;
  fired: number;
  suppressed: number;
  errors: number;
}

export interface EngineStats {
  triggers: number;
  watches: number;
  pendingReceipts: number;
  lastTickAt: number | null;
  ticks: number;
  firedTotal: number;
}

export interface TriggerEngine {
  /** Starts the poll loop (no-op if running). */
  start(): void;
  /** Stops the loop, waits for the running tick, flushes receipts and saves state. */
  stop(): Promise<void>;
  /** One poll tick. Exported for tests and the in-page sandbox. Ticks never overlap. */
  tick(opts?: { refreshTriggers?: boolean }): Promise<TickReport>;
  /** Writes every queued receipt now. */
  flush(): Promise<void>;
  /** The current trigger set (as of the last refresh). */
  readonly triggers: readonly Trigger[];
  stats(): EngineStats;
}

// ------------------------------------------------------------------ persisted state

type SnapAttr = [type: string, value: string | number | boolean, big?: 1];
interface SnapEntity {
  /** Fingerprint of attributes + payload + owner (patched detection). */
  fp: string;
  createdAt: number;
  expiresAt: number;
  owner: string;
  creator: string;
  attrs: Record<string, SnapAttr>;
}
interface WatchState {
  /** Chain time of the tick that produced this snapshot. */
  tickAt: number;
  entities: Record<string, SnapEntity>;
}
interface RetryItem {
  trigger: string;
  event: TriggerEvent;
  entity: SnapEntity & { key: string };
  attempts: number;
}

export interface EngineState {
  v: 1;
  watches: Record<string, WatchState>;
  /** Triggers that were in the set when their watch's snapshot was taken (eligible for diff events). */
  primed: Record<string, 1>;
  /** firing id → chain time handled (local idempotency). */
  seen: Record<string, number>;
  /** Candidates that hit a transient error, retried next tick. */
  retry: Record<string, RetryItem>;
}

const emptyState = (): EngineState => ({ v: 1, watches: {}, primed: {}, seen: {}, retry: {} });

function reviveState(raw: unknown): EngineState {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return emptyState();
  const s = raw as Partial<EngineState>;
  return {
    v: 1,
    watches: s.watches && typeof s.watches === 'object' ? s.watches : {},
    primed: s.primed && typeof s.primed === 'object' ? s.primed : {},
    seen: s.seen && typeof s.seen === 'object' ? s.seen : {},
    retry: s.retry && typeof s.retry === 'object' ? s.retry : {},
  };
}

/** In-memory EngineStore (tests, sandbox). `state` exposes what was last saved (deep-copied). */
export function createMemoryStore(initial?: EngineState): EngineStore & { readonly state: EngineState | null } {
  let saved: string | null = initial ? JSON.stringify(initial) : null;
  return {
    load: () => (saved ? (JSON.parse(saved) as unknown) : null),
    save: (state) => {
      saved = JSON.stringify(state);
    },
    get state() {
      return saved ? (JSON.parse(saved) as EngineState) : null;
    },
  };
}

// ------------------------------------------------------------------ helpers

const SEEN_TTL = 31 * 24 * 3600;
/** Clock skew tolerated between "gone because expired" and "gone because deleted". */
const EXPIRY_SLACK = 6;
const MAX_RETRY_ATTEMPTS = 5;
const MAX_RECEIPT_ATTEMPTS = 5;

/** Canonical JSON: sorted object keys, lowercased hex, bigint → string. */
function canonical(v: unknown): string {
  if (typeof v === 'bigint') return JSON.stringify(v.toString());
  if (typeof v === 'string') return JSON.stringify(/^0x[0-9a-fA-F]+$/.test(v) ? v.toLowerCase() : v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Stable id of a watch: keccak256 of canonical (project, type, match) with `where` order-normalized. */
export function watchId(t: Pick<Trigger, 'watchProject' | 'watchType' | 'match'>): Hex {
  const where = t.match.where.map(canonical).sort();
  return keccak256(
    stringToHex(canonical({ p: t.watchProject, t: t.watchType, w: where, o: t.match.owner, c: t.match.creator })),
  );
}

function fingerprint(e: RawEntity): string {
  return keccak256(stringToHex(canonical({ a: e.attributes, p: e.payload, o: e.owner })));
}

function snap(e: RawEntity): SnapEntity {
  const attrs: Record<string, SnapAttr> = {};
  for (const [k, a] of Object.entries(e.attributes)) {
    attrs[k] = typeof a.value === 'bigint' ? [a.type, a.value.toString(), 1] : [a.type, a.value];
  }
  return { fp: fingerprint(e), createdAt: e.createdAt, expiresAt: e.expiresAt, owner: e.owner, creator: e.creator, attrs };
}

/** Snapshot entity → RawEntity (payload not kept: '' for gone entities). */
function unsnap(key: string, s: SnapEntity): RawEntity {
  const attributes: Record<string, RawAttr> = {};
  for (const [k, [type, value, big]] of Object.entries(s.attrs)) attributes[k] = { type, value: big ? BigInt(value as string) : value };
  return {
    key: key as EntityKey,
    owner: s.owner as Address,
    creator: s.creator as Address,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    readonly: false,
    permissionlessExtension: false,
    attributes,
    payload: '',
    contentType: 'application/json',
  };
}

const errText = (e: unknown): string => {
  const x = e as { code?: unknown; message?: unknown } | null;
  const code = x && typeof x.code === 'string' ? `${x.code}: ` : '';
  const msg = x && typeof x.message === 'string' ? x.message : String(e);
  return `${code}${msg.split('\n')[0] ?? ''}`.slice(0, 200);
};
const isTransient = (e: unknown): boolean => {
  const x = e as { retryable?: unknown; code?: unknown } | null;
  return !!x && (x.retryable === true || x.code === 'NETWORK' || x.code === 'RATE_LIMITED' || x.code === 'QUOTA_EXHAUSTED');
};

interface Candidate {
  trigger: Trigger;
  entity: RawEntity;
  event: TriggerEvent;
  id: Hex;
  attempts: number;
}

interface QueuedReceipt {
  id: Hex;
  fields: FiringFields;
  attest?: CreateSpec;
  attempts: number;
  queuedAt: number;
}

type Verdict =
  | { kind: 'ignore'; reason: string }
  | { kind: 'done' }
  | { kind: 'fired'; outcome: FiringOutcome };

// ------------------------------------------------------------------ engine

export function createTriggerEngine(opts: TriggerEngineOptions): TriggerEngine {
  const port = opts.port;
  const me = opts.workerAddress.toLowerCase() as Address;
  const actions = opts.actions ?? {};
  const plugins = opts.plugins ?? {};
  const clock = opts.clock ?? (() => port.now());
  const pollMs = opts.pollMs ?? 10_000;
  const refreshMs = opts.triggerRefreshMs ?? 30_000;
  const flushMs = opts.flushMs ?? 5_000;
  const maxBatch = Math.max(2, Math.min(opts.maxBatch ?? 20, 20));
  const log = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    try {
      opts.onLog?.(data ? { level, msg, data } : { level, msg });
    } catch {
      // a broken logger must not break the engine
    }
  };

  let state: EngineState | null = null;
  let triggers: Trigger[] = [];
  let lastRefresh = -Infinity;
  let lastTickAt: number | null = null;
  let ticks = 0;
  let firedTotal = 0;
  const queue: QueuedReceipt[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let current: Promise<TickReport> | null = null;
  let flushing: Promise<void> | null = null;

  if (port.address && port.address.toLowerCase() !== me) {
    log('warn', 'port wallet differs from workerAddress; receipts are signed by the port wallet', { port: port.address, worker: me });
  }

  async function ensureState(): Promise<EngineState> {
    if (state) return state;
    try {
      state = reviveState(await opts.store?.load());
    } catch (e) {
      log('error', 'engine store load failed; starting empty', { error: errText(e) });
      state = emptyState();
    }
    return state;
  }

  async function save(): Promise<void> {
    if (!state || !opts.store) return;
    try {
      await opts.store.save(state);
    } catch (e) {
      log('error', 'engine store save failed', { error: errText(e) });
    }
  }

  // ---------------------------------------------------------------- trigger set

  async function refreshTriggers(report: TickReport): Promise<void> {
    report.queries++;
    const workerPred = me === ZERO_ADDRESS ? pred.addr('worker', ZERO_ADDRESS) : pred.or(pred.addr('worker', me), pred.addr('worker', ZERO_ADDRESS));
    const rows = await port.query({ where: [...baseWhere(TRIGGERS_PROJECT, TRIGGER_TYPE), workerPred] });
    const now = clock();
    const next: Trigger[] = [];
    let dropped = 0;
    for (const raw of rows) {
      try {
        const t = decodeTrigger(raw, (key, reason) => log('debug', 'ignored malformed trigger', { key, reason }));
        if (!t) {
          dropped++;
          continue;
        }
        if (t.expiresAt <= now) continue;
        next.push(t);
      } catch (e) {
        dropped++;
        log('warn', 'trigger decode crashed; ignored', { key: raw.key, error: errText(e) });
      }
    }
    triggers = next;
    lastRefresh = Date.now();
    log('debug', 'trigger set refreshed', { triggers: next.length, ignored: dropped });
  }

  // ---------------------------------------------------------------- diff

  function diffWatch(
    ts: readonly Trigger[],
    prev: WatchState | undefined,
    rows: readonly RawEntity[],
    now: number,
    st: EngineState,
  ): { candidates: Candidate[]; gone: { key: string; e: SnapEntity }[] } {
    const out: Candidate[] = [];
    const add = (trigger: Trigger, entity: RawEntity, event: TriggerEvent) =>
      out.push({ trigger, entity, event, id: firingId(trigger.key, entity.key, event), attempts: 0 });
    const cur = new Map(rows.map((r) => [r.key.toLowerCase(), r]));

    for (const [key, e] of cur) {
      const before = prev?.entities[key];
      const fp = before ? fingerprint(e) : '';
      for (const t of ts) {
        if (e.expiresAt <= now) continue;
        const primed = !!prev && st.primed[t.key] === 1;
        // Created since the previous snapshot (vs. an older entity that started matching after a patch).
        const createdSincePrev = !prev || e.createdAt >= prev.tickAt - EXPIRY_SLACK;
        if (t.on === 'created') {
          // Never historical: only entities created at or after the subscription. A trigger that
          // has not been through a snapshot yet considers every such entity (seen set + receipt
          // lookup dedupe), so triggers picked up late by the 30 s refresh still fire.
          if (e.createdAt >= t.createdAt && (!primed || (!before && createdSincePrev))) add(t, e, 'created');
        } else if (t.on === 'patched' && primed) {
          if (before ? before.fp !== fp : !createdSincePrev) add(t, e, 'patched');
        }
        if (t.on === 'expiring' && e.expiresAt - now <= t.lead) add(t, e, 'expiring');
      }
    }

    const gone: { key: string; e: SnapEntity }[] = [];
    for (const [key, before] of Object.entries(prev?.entities ?? {})) {
      if (cur.has(key)) continue;
      gone.push({ key, e: before });
    }
    return { candidates: out, gone };
  }

  // ---------------------------------------------------------------- evaluation

  async function existingFiring(c: Candidate, report: TickReport): Promise<boolean> {
    report.queries++;
    const rows = await port.query({
      where: [
        ...baseWhere(TRIGGERS_PROJECT, FIRING_TYPE),
        pred.key('trigger', c.trigger.key),
        pred.key('entity', c.entity.key),
        pred.str('event', c.event),
      ],
    });
    // A trigger addressed to a specific worker only trusts that worker's receipts (others could
    // forge receipts to suppress it); an any-worker trigger accepts a receipt by anyone.
    const trusted = (creator: Address) => c.trigger.worker === ZERO_ADDRESS || creator === c.trigger.worker || creator === me;
    return rows.some((r) => {
      const f = decodeFiring(r);
      return !!f && f.trigger === c.trigger.key && f.entity === c.entity.key.toLowerCase() && f.event === c.event && trusted(f.creator);
    });
  }

  async function guardBlocks(t: Trigger, report: TickReport): Promise<boolean> {
    if (!t.unless) return false;
    report.queries++;
    const u = t.unless;
    const rows = await port.query({
      where: [...baseWhere(u.project, u.type), ...u.where],
      ...(u.owner ? { owner: u.owner } : {}),
      ...(u.creator ? { creator: u.creator } : {}),
    });
    const now = clock();
    return rows.some((r) => r.expiresAt > now);
  }

  const mine = (t: Trigger) => t.worker === me;

  function pushMessage(c: Candidate): PushMessage {
    const t = c.trigger;
    const attrs: Record<string, RawAttr | string> = {
      ...c.entity.attributes,
      $key: c.entity.key,
      $owner: c.entity.owner,
      $creator: c.entity.creator,
    };
    const msg: PushMessage = {
      title: (t.label ?? `${t.watchType} ${c.event}`).slice(0, 80),
      body: fillTemplate(t.body ?? '', attrs),
      trigger: t.key,
      firing: c.id,
      entity: c.entity.key,
      event: c.event,
    };
    if (t.href) msg.href = t.href;
    return msg;
  }

  /** Runs one candidate end to end. Throws only on transient read errors (retried next tick). */
  async function evaluate(c: Candidate, st: EngineState, report: TickReport, headBlock: () => Promise<bigint>): Promise<Verdict> {
    const t = c.trigger;
    if (st.seen[c.id] !== undefined) return { kind: 'done' };

    // 1. Is it this worker's job? (cheap, local: no reads for triggers another worker owns)
    let channel: ChannelInfo | null = null;
    let skip: string | null = null;
    if (t.action === 'push' || t.action === 'webhook') {
      channel = actions.channels ? await actions.channels.get(t.channel) : null;
      if (!channel) {
        if (!mine(t)) return { kind: 'ignore', reason: 'channel registered elsewhere' };
        skip = 'unknown channel';
      } else if (channel.owner.toLowerCase() !== t.creator) {
        skip = 'channel owner mismatch';
      } else if (t.action === 'webhook' ? channel.kind !== 'webhook' : channel.kind === 'webhook') {
        skip = `channel kind ${channel.kind} cannot serve ${t.action}`;
      } else if (t.action === 'push' && !actions.push) {
        skip = 'push not supported by this worker';
      } else if (t.action === 'webhook' && !actions.webhook) {
        skip = 'webhooks not supported by this worker';
      }
    } else {
      const plugin = t.attester ? plugins[t.attester] : undefined;
      if (!plugin) {
        if (!mine(t)) return { kind: 'ignore', reason: 'attester not installed' };
        skip = `unknown attester ${t.attester ?? ''}`;
      }
    }

    // 2. Idempotency across workers and restarts.
    if (await existingFiring(c, report)) {
      st.seen[c.id] = clock();
      return { kind: 'done' };
    }

    // 3. Guard at head. Suppression is local only (no receipt, no gas).
    const block = await headBlock();
    if (!skip && (await guardBlocks(t, report))) {
      st.seen[c.id] = clock();
      report.suppressed++;
      log('debug', 'suppressed by unless', { trigger: t.key, entity: c.entity.key, event: c.event });
      return { kind: 'done' };
    }

    // 4. Act.
    const at = clock();
    let outcome: FiringOutcome;
    let detail: string | undefined;
    let attest: CreateSpec | undefined;
    let message: PushMessage | undefined;
    if (skip) {
      outcome = 'skipped';
      detail = skip;
    } else if (t.action === 'push' && channel && actions.push) {
      message = pushMessage(c);
      const r = await safeDeliver(() => actions.push!.send(channel!, message!));
      outcome = r.ok ? 'delivered' : 'failed';
      detail = r.ok ? r.detail : r.detail;
    } else if (t.action === 'webhook' && channel && actions.webhook) {
      const body: WebhookBody = {
        trigger: t.key,
        entity: c.entity.key,
        event: c.event,
        block: block.toString(),
        at,
        attributes: jsonAttributes(c.entity.attributes),
        firing: c.id,
      };
      const r = await safeDeliver(() => actions.webhook!.send(channel!, body));
      outcome = r.ok ? 'delivered' : 'failed';
      detail = r.detail;
    } else {
      const plugin = plugins[t.attester ?? ''];
      const ctx: AttestContext = { trigger: t, entity: c.entity, event: c.event, block, now: at, params: t.params ?? {} };
      try {
        const spec = plugin ? await plugin(port, ctx) : null;
        if (spec) {
          outcome = 'attested';
          attest = spec;
        } else {
          outcome = 'skipped';
          detail = 'nothing to attest';
        }
      } catch (e) {
        if (isTransient(e)) throw e;
        outcome = 'failed';
        detail = `attester error: ${errText(e)}`;
      }
    }

    st.seen[c.id] = at;
    const fields: FiringFields = { trigger: t.key, entity: c.entity.key, event: c.event, outcome, at, block };
    if (detail) fields.detail = detail;
    queue.push({ id: c.id, fields, ...(attest ? { attest } : {}), attempts: 0, queuedAt: Date.now() });
    firedTotal++;
    log('info', 'trigger fired', { trigger: t.key, entity: c.entity.key, event: c.event, action: t.action, outcome, ...(detail ? { detail } : {}) });
    try {
      const ev: FiringEvent = { id: c.id, trigger: t, entity: c.entity.key, event: c.event, outcome, block, at };
      if (detail) ev.detail = detail;
      if (message) ev.message = message;
      opts.onFiring?.(ev);
    } catch (e) {
      log('warn', 'onFiring callback threw', { error: errText(e) });
    }
    return { kind: 'fired', outcome };
  }

  async function safeDeliver(fn: () => Promise<DeliveryResult>): Promise<DeliveryResult> {
    try {
      return await fn();
    } catch (e) {
      return { ok: false, detail: errText(e) };
    }
  }

  // ---------------------------------------------------------------- receipts

  async function flushOnce(): Promise<void> {
    while (queue.length) {
      // Pack receipts (+ their attestations) into one tx of at most maxBatch creates.
      const batch: QueuedReceipt[] = [];
      let creates = 0;
      for (const q of queue) {
        const n = q.attest ? 2 : 1;
        if (creates + n > maxBatch) break;
        batch.push(q);
        creates += n;
      }
      try {
        await writeBatch(batch);
        queue.splice(0, batch.length);
      } catch (e) {
        for (const q of batch) q.attempts++;
        const dead = batch.filter((q) => q.attempts >= MAX_RECEIPT_ATTEMPTS);
        if (dead.length) {
          for (const q of dead) queue.splice(queue.indexOf(q), 1);
          log('error', 'dropped firing receipts after repeated write failures', { count: dead.length, error: errText(e) });
        }
        const code = (e as { code?: unknown } | null)?.code;
        log('error', 'receipt write failed; will retry', {
          error: errText(e),
          pending: queue.length,
          ...(code === 'INSUFFICIENT_FUNDS' ? { hint: `fund the worker wallet ${me}` } : {}),
        });
        return;
      }
    }
  }

  async function writeBatch(batch: QueuedReceipt[]): Promise<void> {
    const needsKeys = batch.some((q) => q.attest);
    await port.write(async (w) => {
      // Order in the tx: for each receipt, [attestation?, firing]. Attestation keys are predicted
      // so each receipt can name its attestation in the same atomic batch.
      let predicted: { key: EntityKey; salt: bigint }[] | null = null;
      const total = batch.reduce((n, q) => n + (q.attest ? 2 : 1), 0);
      if (needsKeys) {
        try {
          predicted = await w.predictKeys(total);
        } catch (e) {
          log('warn', 'predictKeys unavailable; writing attestations first', { error: errText(e) });
        }
      }
      if (needsKeys && !predicted) {
        // Fallback: two txs. Attestations first (their keys come back), then the receipts.
        const attests = batch.filter((q) => q.attest);
        const r1 = await w.batch({ creates: attests.map((q) => q.attest as CreateSpec) });
        attests.forEach((q, i) => {
          q.fields.attestation = r1.created[i] as EntityKey;
          delete q.attest;
        });
      }
      const creates: CreateSpec[] = [];
      const firingIndex: number[] = [];
      const attestIndex: (number | null)[] = [];
      let i = 0;
      for (const q of batch) {
        if (q.attest && predicted) {
          const p = predicted[i] as { key: EntityKey; salt: bigint };
          creates.push({ ...q.attest, salt: p.salt });
          q.fields.attestation = p.key;
          attestIndex.push(creates.length - 1);
          i++;
        } else attestIndex.push(null);
        const spec = firingSpec(q.fields);
        if (predicted) spec.salt = (predicted[i] as { salt: bigint }).salt;
        creates.push(spec);
        firingIndex.push(creates.length - 1);
        i++;
      }
      const r = await w.batch({ creates });
      if (predicted && predicted.some((p, j) => r.created[j] !== undefined && r.created[j] !== p.key)) {
        log('warn', 'predicted keys differ from created keys; attestation links may be wrong', { txHash: r.txHash });
      }
      batch.forEach((q, j) => {
        const receipt = r.created[firingIndex[j] as number];
        const ai = attestIndex[j];
        const attestation = ai !== null && ai !== undefined ? r.created[ai] : q.fields.attestation;
        if (!receipt) return;
        try {
          const ev: ReceiptEvent = {
            id: q.id,
            receipt,
            trigger: q.fields.trigger,
            entity: q.fields.entity,
            event: q.fields.event,
            outcome: q.fields.outcome,
            txHash: r.txHash,
          };
          if (attestation) ev.attestation = attestation;
          opts.onReceipt?.(ev);
        } catch (e) {
          log('warn', 'onReceipt callback threw', { error: errText(e) });
        }
      });
      log('info', 'receipts written', { count: batch.length, creates: creates.length, txHash: r.txHash });
    });
  }

  function flush(): Promise<void> {
    if (!flushing) {
      flushing = flushOnce().finally(() => {
        flushing = null;
      });
    }
    return flushing;
  }

  // ---------------------------------------------------------------- tick

  async function runTick(refresh: boolean): Promise<TickReport> {
    const st = await ensureState();
    const report: TickReport = { triggers: 0, watches: 0, queries: 0, candidates: 0, fired: 0, suppressed: 0, errors: 0 };
    if (refresh || Date.now() - lastRefresh >= refreshMs) {
      try {
        await refreshTriggers(report);
      } catch (e) {
        report.errors++;
        log('warn', 'trigger refresh failed; keeping the previous set', { error: errText(e) });
      }
    }
    const now = clock();
    report.triggers = triggers.length;

    // Group into watches.
    const groups = new Map<string, Trigger[]>();
    for (const t of triggers) {
      if (t.expiresAt <= now) continue;
      try {
        const id = watchId(t);
        const g = groups.get(id);
        if (g) g.push(t);
        else groups.set(id, [t]);
      } catch (e) {
        report.errors++;
        log('warn', 'trigger grouping failed; ignored', { trigger: t.key, error: errText(e) });
      }
    }
    report.watches = groups.size;

    // Head block for this tick's evaluations (fetched lazily, once).
    let head: Promise<bigint> | null = null;
    const headBlock = () => (head ??= port.blockNumber());

    // Retries from earlier ticks first.
    const candidates: Candidate[] = [];
    const byKey = new Map(triggers.map((t) => [t.key, t]));
    for (const [id, r] of Object.entries(st.retry)) {
      const t = byKey.get(r.trigger as EntityKey);
      delete st.retry[id];
      if (!t) continue;
      candidates.push({ trigger: t, entity: unsnap(r.entity.key, r.entity), event: r.event, id: id as Hex, attempts: r.attempts });
    }

    const nextWatches: Record<string, WatchState> = {};
    for (const [id, ts] of groups) {
      const first = ts[0] as Trigger;
      const prev = st.watches[id];
      try {
        report.queries++;
        const rows = await port.query({
          where: [...baseWhere(first.watchProject, first.watchType), ...first.match.where],
          ...(first.match.owner ? { owner: first.match.owner } : {}),
          ...(first.match.creator ? { creator: first.match.creator } : {}),
        });
        const live = rows.filter((r) => r.expiresAt > now);
        const { candidates: found, gone } = diffWatch(ts, prev, live, now, st);
        candidates.push(...found);
        const entities: Record<string, SnapEntity> = {};
        for (const r of live) entities[r.key.toLowerCase()] = snap(r);

        // Disappeared since last tick: expired, deleted, or no longer matching.
        for (const { key, e } of gone) {
          const raw = unsnap(key, e);
          if (e.expiresAt <= now + EXPIRY_SLACK) {
            for (const t of ts) if (t.on === 'expired' && e.expiresAt >= t.createdAt) candidates.push(mk(t, raw, 'expired'));
            continue;
          }
          const wantsDeleted = ts.filter((t) => t.on === 'deleted' && st.primed[t.key] === 1);
          if (!wantsDeleted.length) continue;
          try {
            report.queries++;
            const still = await port.get(key as EntityKey);
            if (still) continue; // still exists, just stopped matching
            for (const t of wantsDeleted) candidates.push(mk(t, raw, 'deleted'));
          } catch (err) {
            entities[key] = e; // unknown: keep it and look again next tick
            report.errors++;
            log('warn', 'existence check failed', { entity: key, error: errText(err) });
          }
        }
        nextWatches[id] = { tickAt: now, entities };
        for (const t of ts) st.primed[t.key] = 1;
      } catch (e) {
        report.errors++;
        if (prev) nextWatches[id] = prev;
        log('warn', 'watch query failed; will retry next tick', {
          watch: id,
          project: first.watchProject,
          type: first.watchType,
          triggers: ts.length,
          error: errText(e),
        });
      }
    }
    st.watches = nextWatches;

    // Evaluate candidates (dedupe within the tick), each isolated.
    const done = new Set<string>();
    for (const c of candidates) {
      if (done.has(c.id)) continue;
      done.add(c.id);
      report.candidates++;
      try {
        const v = await evaluate(c, st, report, headBlock);
        if (v.kind === 'fired') report.fired++;
      } catch (e) {
        report.errors++;
        head = null;
        if (isTransient(e) && c.attempts + 1 < MAX_RETRY_ATTEMPTS) {
          st.retry[c.id] = { trigger: c.trigger.key, event: c.event, entity: { ...snap(c.entity), key: c.entity.key }, attempts: c.attempts + 1 };
        }
        log('warn', 'trigger evaluation failed', {
          trigger: c.trigger.key,
          entity: c.entity.key,
          event: c.event,
          error: errText(e),
          retry: st.retry[c.id] !== undefined,
        });
      }
    }

    // Housekeeping.
    const liveKeys = new Set(triggers.map((t) => t.key as string));
    for (const k of Object.keys(st.primed)) if (!liveKeys.has(k)) delete st.primed[k];
    const cutoff = now - SEEN_TTL;
    for (const [k, at] of Object.entries(st.seen)) if (at < cutoff) delete st.seen[k];

    if (queue.length && (flushMs === 0 || queue.length >= maxBatch || Date.now() - (queue[0] as QueuedReceipt).queuedAt >= flushMs)) {
      await flush();
    }
    await save();
    lastTickAt = now;
    ticks++;
    log('debug', 'tick', { ...report });
    return report;
  }

  function mk(t: Trigger, entity: RawEntity, event: TriggerEvent): Candidate {
    return { trigger: t, entity, event, id: firingId(t.key, entity.key, event), attempts: 0 };
  }

  function tick(o: { refreshTriggers?: boolean } = {}): Promise<TickReport> {
    if (current) return current;
    current = runTick(o.refreshTriggers ?? false).finally(() => {
      current = null;
    });
    return current;
  }

  function schedule(delay: number) {
    if (!running) return;
    timer = setTimeout(() => {
      timer = null;
      tick()
        .catch((e) => log('error', 'tick crashed', { error: errText(e) }))
        .finally(() => schedule(pollMs));
    }, delay);
  }

  // Receipts also flush on their own clock, between ticks.
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      if (running) return;
      running = true;
      schedule(0);
      if (flushMs > 0) {
        flushTimer = setInterval(() => {
          const oldest = queue[0];
          if (oldest && Date.now() - oldest.queuedAt >= flushMs) void flush().then(save);
        }, Math.min(flushMs, 1000));
      }
      log('info', 'engine started', { worker: me, pollMs, triggerRefreshMs: refreshMs });
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = null;
      if (current) await current.catch(() => undefined);
      await flush();
      await save();
      log('info', 'engine stopped', { pendingReceipts: queue.length });
    },
    tick,
    flush,
    get triggers() {
      return triggers;
    },
    stats: () => ({
      triggers: triggers.length,
      watches: state ? Object.keys(state.watches).length : 0,
      pendingReceipts: queue.length,
      lastTickAt,
      ticks,
      firedTotal,
    }),
  };
}

