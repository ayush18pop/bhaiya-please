/**
 * Arkiv Triggers wire format (docs/TRIGGERS.md §1): the `trigger` and `firing` entities under the
 * project tag `arkivtriggers`, their attribute names and types, zod schemas for payloads, decoders
 * that turn a RawEntity into a typed object (or null for anything malformed or foreign), and
 * encoders that produce CreateSpecs.
 *
 * Anyone can write `project = arkivtriggers`, so every read is validated and every limit below is
 * enforced in both directions (writing and reading).
 */
import { z } from 'zod';
import type {
  Address,
  AttrMap,
  AttrValue,
  CreateSpec,
  EntityKey,
  Hex,
  Predicate,
  QueryAst,
  RawAttr,
  RawEntity,
  UnixSeconds,
} from './port';

// ------------------------------------------------------------------ constants

export const TRIGGERS_PROJECT = 'arkivtriggers' as const;
export const TRIGGER_TYPE = 'trigger' as const;
export const FIRING_TYPE = 'firing' as const;

export const TRIGGER_EVENTS = ['created', 'patched', 'expiring', 'expired', 'deleted'] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export const TRIGGER_ACTIONS = ['push', 'webhook', 'attest'] as const;
export type TriggerAction = (typeof TRIGGER_ACTIONS)[number];

export const FIRING_OUTCOMES = ['delivered', 'failed', 'attested', 'skipped'] as const;
export type FiringOutcome = (typeof FIRING_OUTCOMES)[number];

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
export const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as Hex;

/** Validation limits. Shared by encoders (inputs) and decoders (chain reads). */
export const LIMITS = {
  label: 80,
  body: 200,
  href: 512,
  attester: 64,
  paramsEntries: 16,
  paramKey: 32,
  paramValue: 256,
  /** Predicates per query (counting nested `or` members). */
  predicates: 16,
  /** Nesting depth of `or`. */
  orDepth: 3,
  strValue: 128,
  /** Whole trigger payload (UTF-8 bytes). */
  payloadBytes: 8 * 1024,
  /** Firing `detail` text. */
  detail: 200,
  /** Longest `lead` for `expiring` (seconds). */
  maxLead: 30 * 24 * 3600,
  /** Longest trigger lifetime a client helper will create (seconds). */
  maxTriggerLifetime: 365 * 24 * 3600,
} as const;

/** Default `lead` (seconds before `$expiresAt`) for `expiring` triggers. */
export const DEFAULT_LEAD = 120;
/** Firing receipts live 30 days. */
export const FIRING_TTL = 30 * 24 * 3600;

/** Attribute name → type, per entity. Every entity also has project=str and type=str. */
export const TRIGGER_ATTRS = {
  watch_project: 'str',
  watch_type: 'str',
  on: 'str',
  action: 'str',
  channel: 'bytes32',
  worker: 'addr',
  lead: 'u64',
} as const;

export const FIRING_ATTRS = {
  trigger: 'key',
  entity: 'key',
  event: 'str',
  outcome: 'str',
  at: 'u64',
  block: 'u64',
} as const;

// ------------------------------------------------------------------ attribute helpers

/** Typed attribute value constructors (also usable to build `match` predicates). */
export const val = {
  str: (value: string): Extract<AttrValue, { type: 'str' }> => ({ type: 'str', value }),
  i32: (value: number): Extract<AttrValue, { type: 'i32' }> => ({ type: 'i32', value }),
  u64: (value: number | bigint): Extract<AttrValue, { type: 'u64' }> => ({ type: 'u64', value: BigInt(value) }),
  addr: (value: string): Extract<AttrValue, { type: 'addr' }> => ({ type: 'addr', value: value.toLowerCase() as Address }),
  key: (value: string): Extract<AttrValue, { type: 'key' }> => ({ type: 'key', value: value.toLowerCase() as EntityKey }),
  bytes32: (value: string): Extract<AttrValue, { type: 'bytes32' }> => ({ type: 'bytes32', value: value.toLowerCase() as Hex }),
};

/**
 * Predicate builders for `match` / `unless`:
 *   where: [pred.key('request', requestKey), pred.gte('at_gate', val.u64(1))]
 * `$key`, `$owner` and `$creator` are valid names too (pred.key('$key', k)).
 */
export const pred = {
  eq: (name: string, value: AttrValue): Predicate => ({ op: 'eq', name, value }),
  str: (name: string, v: string): Predicate => ({ op: 'eq', name, value: val.str(v) }),
  key: (name: string, v: string): Predicate => ({ op: 'eq', name, value: val.key(v) }),
  addr: (name: string, v: string): Predicate => ({ op: 'eq', name, value: val.addr(v) }),
  i32: (name: string, v: number): Predicate => ({ op: 'eq', name, value: val.i32(v) }),
  u64: (name: string, v: number | bigint): Predicate => ({ op: 'eq', name, value: val.u64(v) }),
  bytes32: (name: string, v: string): Predicate => ({ op: 'eq', name, value: val.bytes32(v) }),
  gt: (name: string, value: Extract<AttrValue, { type: 'i32' | 'u64' }>): Predicate => ({ op: 'gt', name, value }),
  gte: (name: string, value: Extract<AttrValue, { type: 'i32' | 'u64' }>): Predicate => ({ op: 'gte', name, value }),
  lt: (name: string, value: Extract<AttrValue, { type: 'i32' | 'u64' }>): Predicate => ({ op: 'lt', name, value }),
  lte: (name: string, value: Extract<AttrValue, { type: 'i32' | 'u64' }>): Predicate => ({ op: 'lte', name, value }),
  or: (...preds: Predicate[]): Predicate => ({ op: 'or', preds }),
};

/** project=str(project) AND type=str(type): the base of every protocol query. */
export function baseWhere(project: string, type: string): Predicate[] {
  return [pred.str('project', project), pred.str('type', type)];
}

/** Reads a raw attribute value as a string (bigint/number/bool stringified); undefined if absent. */
export function rawString(a: RawAttr | undefined): string | undefined {
  if (!a) return undefined;
  return typeof a.value === 'string' ? a.value : String(a.value);
}

// ------------------------------------------------------------------ zod: primitives

const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const HEX64 = /^0x[0-9a-fA-F]{64}$/;
/** Same rule the Arkiv node enforces for attribute names (lowercase), plus the $ system names. */
const ATTR_NAME = /^(\$key|\$owner|\$creator|[a-z][a-z0-9._-]{0,31})$/;
/** Project / entity type tags. */
const TAG = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const addressSchema = z.string().regex(HEX40, 'invalid address').transform((s) => s.toLowerCase() as Address);
export const keySchema = z.string().regex(HEX64, 'invalid entity key').transform((s) => s.toLowerCase() as EntityKey);
export const bytes32Schema = z.string().regex(HEX64, 'invalid bytes32').transform((s) => s.toLowerCase() as Hex);
export const tagSchema = z.string().regex(TAG, 'invalid project/type tag');

const u64Schema = z
  .union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative(), z.bigint().nonnegative()])
  .transform((v) => BigInt(v))
  .refine((v) => v < 2n ** 64n, 'u64 out of range');

/**
 * Attribute values inside payload JSON. u64 values travel as decimal strings (JSON has no
 * bigint) and decode back to bigint, so a decoded `match` is directly a core QueryAst.
 */
export const attrValueSchema: z.ZodType<AttrValue> = z.union([
  z.object({ type: z.literal('str'), value: z.string().max(LIMITS.strValue) }),
  z.object({ type: z.literal('i32'), value: z.number().int().min(-(2 ** 31)).max(2 ** 31 - 1) }),
  z.object({ type: z.literal('u64'), value: u64Schema }),
  z.object({ type: z.literal('addr'), value: addressSchema }),
  z.object({ type: z.literal('key'), value: keySchema }),
  z.object({ type: z.literal('bytes32'), value: bytes32Schema }),
]) as unknown as z.ZodType<AttrValue>;

const rangeValueSchema = z.union([
  z.object({ type: z.literal('i32'), value: z.number().int().min(-(2 ** 31)).max(2 ** 31 - 1) }),
  z.object({ type: z.literal('u64'), value: u64Schema }),
]);

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('eq'), name: z.string().regex(ATTR_NAME), value: attrValueSchema }),
    z.object({ op: z.enum(['gt', 'gte', 'lt', 'lte']), name: z.string().regex(ATTR_NAME), value: rangeValueSchema }),
    z.object({ op: z.literal('or'), preds: z.array(predicateSchema).min(1).max(LIMITS.predicates) }),
  ]),
) as unknown as z.ZodType<Predicate>;

/** Counts predicates (nested `or` members included) and checks the `or` depth. */
function predicateShapeOk(where: readonly Predicate[], depth = 0): { count: number; ok: boolean } {
  let count = 0;
  for (const p of where) {
    if (p.op === 'or') {
      if (depth + 1 > LIMITS.orDepth) return { count, ok: false };
      const inner = predicateShapeOk(p.preds, depth + 1);
      if (!inner.ok) return { count, ok: false };
      count += inner.count;
    } else count += 1;
  }
  return { count, ok: count <= LIMITS.predicates };
}

const whereSchema = z
  .array(predicateSchema)
  .max(LIMITS.predicates)
  .refine((w) => predicateShapeOk(w).ok, `at most ${LIMITS.predicates} predicates and ${LIMITS.orDepth} levels of "or"`);

/** `project` / `type` are implied by watch_project / watch_type (or unless.project/type). */
const noBaseNames = (w: readonly Predicate[]) => !w.some((p) => p.op !== 'or' && (p.name === 'project' || p.name === 'type'));

/** `match`: a core QueryAst without the project/type predicates. `where` may be empty (= every entity of that type). */
export const matchSchema = z.object({
  where: whereSchema.refine(noBaseNames, 'match must not contain project/type predicates'),
  owner: addressSchema.optional(),
  creator: addressSchema.optional(),
});

/** `unless`: a full guard query; the trigger fires only if it returns zero rows at the head block. */
export const unlessSchema = z.object({
  project: tagSchema,
  type: tagSchema,
  where: whereSchema.refine(noBaseNames, 'unless.where must not contain project/type predicates'),
  owner: addressSchema.optional(),
  creator: addressSchema.optional(),
});

export type MatchQuery = QueryAst;
export interface UnlessQuery {
  project: string;
  type: string;
  where: Predicate[];
  owner?: Address;
  creator?: Address;
}

const paramsSchema = z
  .record(z.string().min(1).max(LIMITS.paramKey), z.string().max(LIMITS.paramValue))
  .refine((p) => Object.keys(p).length <= LIMITS.paramsEntries, `at most ${LIMITS.paramsEntries} params`);

/** The trigger payload (JSON). */
export const triggerPayloadSchema = z.object({
  match: matchSchema,
  unless: unlessSchema.optional(),
  label: z.string().max(LIMITS.label).optional(),
  body: z.string().max(LIMITS.body).optional(),
  href: z
    .string()
    .max(LIMITS.href)
    .refine((h) => h.startsWith('/') || /^https:\/\//.test(h), 'href must be an app path ("/…") or an https URL')
    .optional(),
  attester: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).max(LIMITS.attester).optional(),
  params: paramsSchema.optional(),
});

export type TriggerPayload = {
  match: MatchQuery;
  unless?: UnlessQuery;
  label?: string;
  body?: string;
  href?: string;
  attester?: string;
  params?: Record<string, string>;
};

/** The firing payload (JSON). */
export const firingPayloadSchema = z.object({
  detail: z.string().max(LIMITS.detail).optional(),
  attestation: keySchema.optional(),
});
export type FiringPayload = { detail?: string; attestation?: EntityKey };

// ------------------------------------------------------------------ decoded types

interface Meta {
  key: EntityKey;
  /** Lowercased. The only unforgeable authorship signal. */
  creator: Address;
  owner: Address;
  createdAt: UnixSeconds;
  expiresAt: UnixSeconds;
}

export interface Trigger extends Meta, TriggerPayload {
  watchProject: string;
  watchType: string;
  on: TriggerEvent;
  action: TriggerAction;
  /** push/webhook: off-chain delivery channel id; attest: ZERO_BYTES32. */
  channel: Hex;
  /** Worker asked to run it; ZERO_ADDRESS = any worker. */
  worker: Address;
  /** Seconds before $expiresAt for `expiring` (DEFAULT_LEAD if absent). */
  lead: number;
}

export interface Firing extends Meta, FiringPayload {
  trigger: EntityKey;
  entity: EntityKey;
  event: TriggerEvent;
  outcome: FiringOutcome;
  at: UnixSeconds;
  /** Block the condition (incl. `unless`) was evaluated at. */
  block: bigint;
}

// ------------------------------------------------------------------ JSON (bigint-safe)

/** JSON.stringify that writes bigints as decimal strings (u64 attribute values in payloads). */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

// ------------------------------------------------------------------ decoders

const attrCell = <T extends string, S extends z.ZodType>(type: T, value: S) => z.object({ type: z.literal(type), value });
const strCell = <S extends z.ZodType<string>>(schema: S) => attrCell('str', schema);
const u64Cell = attrCell('u64', u64Schema);

const triggerAttrsSchema = z.object({
  project: strCell(z.literal(TRIGGERS_PROJECT)),
  type: strCell(z.literal(TRIGGER_TYPE)),
  watch_project: strCell(tagSchema),
  watch_type: strCell(tagSchema),
  on: strCell(z.enum(TRIGGER_EVENTS)),
  action: strCell(z.enum(TRIGGER_ACTIONS)),
  channel: attrCell('bytes32', bytes32Schema),
  worker: attrCell('addr', addressSchema),
  lead: u64Cell.optional(),
});

const firingAttrsSchema = z.object({
  project: strCell(z.literal(TRIGGERS_PROJECT)),
  type: strCell(z.literal(FIRING_TYPE)),
  trigger: attrCell('key', keySchema),
  entity: attrCell('key', keySchema),
  event: strCell(z.enum(TRIGGER_EVENTS)),
  outcome: strCell(z.enum(FIRING_OUTCOMES)),
  at: u64Cell,
  block: u64Cell,
});

/** Optional reporting hook for dropped entities (why a read was rejected). */
export type DropSink = (key: EntityKey, reason: string) => void;

function parsePayload(raw: RawEntity): unknown {
  if (!raw.payload || utf8Length(raw.payload) > LIMITS.payloadBytes) return undefined;
  try {
    return JSON.parse(raw.payload) as unknown;
  } catch {
    return undefined;
  }
}

const meta = (raw: RawEntity): Meta => ({
  key: raw.key.toLowerCase() as EntityKey,
  creator: raw.creator.toLowerCase() as Address,
  owner: raw.owner.toLowerCase() as Address,
  createdAt: raw.createdAt,
  expiresAt: raw.expiresAt,
});

const issue = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ').slice(0, 200);

/**
 * RawEntity → Trigger, or null if it is not a well-formed trigger. Besides the schema, enforces
 * the cross-field rules: push/webhook need a non-zero channel; attest needs an `attester`.
 */
export function decodeTrigger(raw: RawEntity, drop?: DropSink): Trigger | null {
  const a = triggerAttrsSchema.safeParse(raw.attributes);
  if (!a.success) {
    drop?.(raw.key, `trigger attributes: ${issue(a.error)}`);
    return null;
  }
  const p = triggerPayloadSchema.safeParse(parsePayload(raw));
  if (!p.success) {
    drop?.(raw.key, `trigger payload: ${issue(p.error)}`);
    return null;
  }
  const at = a.data;
  const action = at.action.value;
  const channel = at.channel.value;
  if ((action === 'push' || action === 'webhook') && channel === ZERO_BYTES32) {
    drop?.(raw.key, `${action} trigger without a channel`);
    return null;
  }
  if (action === 'attest' && !p.data.attester) {
    drop?.(raw.key, 'attest trigger without an attester');
    return null;
  }
  const lead = at.lead ? Number(at.lead.value) : DEFAULT_LEAD;
  if (lead > LIMITS.maxLead) {
    drop?.(raw.key, 'lead too long');
    return null;
  }
  const payload = stripUndefined(p.data) as TriggerPayload;
  return {
    ...meta(raw),
    ...payload,
    watchProject: at.watch_project.value,
    watchType: at.watch_type.value,
    on: at.on.value,
    action,
    channel,
    worker: at.worker.value,
    lead,
  };
}

/** RawEntity → Firing, or null if malformed. */
export function decodeFiring(raw: RawEntity, drop?: DropSink): Firing | null {
  const a = firingAttrsSchema.safeParse(raw.attributes);
  if (!a.success) {
    drop?.(raw.key, `firing attributes: ${issue(a.error)}`);
    return null;
  }
  const payloadValue = raw.payload ? parsePayload(raw) : {};
  const p = firingPayloadSchema.safeParse(payloadValue ?? {});
  const payload = p.success ? (stripUndefined(p.data) as FiringPayload) : {};
  const at = a.data;
  return {
    ...meta(raw),
    ...payload,
    trigger: at.trigger.value,
    entity: at.entity.value,
    event: at.event.value,
    outcome: at.outcome.value,
    at: Number(at.at.value),
    block: at.block.value,
  };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// ------------------------------------------------------------------ encoders

export interface TriggerFields extends TriggerPayload {
  watchProject: string;
  watchType: string;
  on: TriggerEvent;
  action: TriggerAction;
  /** Required for push/webhook. Ignored (zero) for attest. */
  channel?: Hex;
  /** Default ZERO_ADDRESS (any worker). */
  worker?: Address;
  /** `expiring` only. Default DEFAULT_LEAD. */
  lead?: number;
}

/** Validated trigger attributes + payload JSON (throws TriggerInputError on invalid input). */
export function encodeTrigger(f: TriggerFields): { attributes: AttrMap; payload: string } {
  const fail = (msg: string): never => {
    throw new TriggerInputError(msg);
  };
  if (!tagSchema.safeParse(f.watchProject).success) fail('watchProject must be a lowercase tag');
  if (!tagSchema.safeParse(f.watchType).success) fail('watchType must be a lowercase tag');
  if (!(TRIGGER_EVENTS as readonly string[]).includes(f.on)) fail(`on must be one of ${TRIGGER_EVENTS.join(', ')}`);
  if (!(TRIGGER_ACTIONS as readonly string[]).includes(f.action)) fail(`action must be one of ${TRIGGER_ACTIONS.join(', ')}`);
  const channel = f.action === 'attest' ? ZERO_BYTES32 : (f.channel ?? ZERO_BYTES32).toLowerCase();
  if (!HEX64.test(channel)) fail('channel must be 0x + 64 hex');
  if (f.action !== 'attest' && channel === ZERO_BYTES32) fail(`${f.action} triggers need a channel (register one with a worker first)`);
  if (f.action === 'attest' && !f.attester) fail('attest triggers need an attester (plugin id)');
  const worker = (f.worker ?? ZERO_ADDRESS).toLowerCase();
  if (!HEX40.test(worker)) fail('worker must be an address');
  const lead = f.lead ?? DEFAULT_LEAD;
  if (!Number.isInteger(lead) || lead < 0 || lead > LIMITS.maxLead) fail(`lead must be an integer in 0..${LIMITS.maxLead}`);

  const payloadObj: Record<string, unknown> = { match: f.match };
  for (const k of ['unless', 'label', 'body', 'href', 'attester', 'params'] as const) {
    if (f[k] !== undefined) payloadObj[k] = f[k];
  }
  const payload = toJson(payloadObj);
  if (utf8Length(payload) > LIMITS.payloadBytes) fail(`trigger payload exceeds ${LIMITS.payloadBytes} bytes`);
  // Round-trip through the read schema: what we write is exactly what workers accept.
  const check = triggerPayloadSchema.safeParse(JSON.parse(payload));
  if (!check.success) fail(`invalid trigger: ${issue(check.error)}`);

  const attributes: AttrMap = {
    project: val.str(TRIGGERS_PROJECT),
    type: val.str(TRIGGER_TYPE),
    watch_project: val.str(f.watchProject),
    watch_type: val.str(f.watchType),
    on: val.str(f.on),
    action: val.str(f.action),
    channel: val.bytes32(channel),
    worker: val.addr(worker),
  };
  if (f.on === 'expiring') attributes.lead = val.u64(lead);
  return { attributes, payload };
}

export interface FiringFields extends FiringPayload {
  trigger: EntityKey;
  entity: EntityKey;
  event: TriggerEvent;
  outcome: FiringOutcome;
  at: UnixSeconds;
  block: bigint;
}

/** The firing receipt: readonly, 30 days. Detail is truncated to LIMITS.detail. */
export function firingSpec(f: FiringFields): CreateSpec {
  const payload: FiringPayload = {};
  if (f.detail) payload.detail = f.detail.slice(0, LIMITS.detail);
  if (f.attestation) payload.attestation = f.attestation.toLowerCase() as EntityKey;
  return {
    attributes: {
      project: val.str(TRIGGERS_PROJECT),
      type: val.str(FIRING_TYPE),
      trigger: val.key(f.trigger),
      entity: val.key(f.entity),
      event: val.str(f.event),
      outcome: val.str(f.outcome),
      at: val.u64(Math.max(0, Math.floor(f.at))),
      block: val.u64(f.block),
    },
    payload: JSON.stringify(payload),
    readonly: true,
    permissionlessExtension: false,
    expiresInSeconds: FIRING_TTL,
  };
}

/** Thrown by encoders / client helpers on invalid input. Never thrown for chain reads (those return null). */
export class TriggerInputError extends Error {
  override readonly name = 'TriggerInputError';
}

/** Convenience re-export: the input of client.buildTriggerSpec (fields + lifetime). */
export type { TriggerInput } from './client';
