/**
 * Action plumbing between the engine and whatever delivers notifications. The engine never sees
 * a push endpoint or webhook URL: it only knows channel ids and owners (ChannelInfo). The host
 * (the Node worker, or an in-page sandbox) implements the senders and the channel directory.
 */
import type { Trigger, TriggerEvent } from './codec';
import type { Address, ArkivPort, CreateSpec, EntityKey, Hex, RawAttr, RawEntity } from './port';

export const CHANNEL_KINDS = ['webpush', 'expo', 'webhook'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** What the engine may know about a channel. The target (endpoint/token/URL) stays with the host. */
export interface ChannelInfo {
  id: Hex;
  kind: ChannelKind;
  /** Lowercased. A push/webhook trigger runs only if trigger.$creator === owner. */
  owner: Address;
}

/** Looks up channels by id. Return null for unknown ids. */
export interface ChannelDirectory {
  get(id: Hex): ChannelInfo | null | Promise<ChannelInfo | null>;
}

/** Push notification payload (Web Push JSON body / Expo `data`). */
export interface PushMessage {
  title: string;
  body: string;
  href?: string;
  /** Trigger entity key. */
  trigger: EntityKey;
  /**
   * Firing id: keccak256(trigger ‖ entity ‖ event). Stable across workers, so clients can dedupe
   * duplicate pushes, and find the on-chain receipt by (trigger, entity, event).
   */
  firing: Hex;
  entity: EntityKey;
  event: TriggerEvent;
}

/** Webhook POST body. */
export interface WebhookBody {
  trigger: EntityKey;
  entity: EntityKey;
  event: TriggerEvent;
  /** Decimal string (JSON has no bigint). */
  block: string;
  at: number;
  /** The matched entity's attributes, u64 values as decimal strings. */
  attributes: Record<string, { type: string; value: string | number | boolean }>;
  firing: Hex;
}

export type DeliveryResult =
  | { ok: true; detail?: string }
  /** `gone`: the channel is dead (404/410, DeviceNotRegistered). The host should forget it. */
  | { ok: false; detail: string; gone?: boolean };

export interface PushSender {
  send(channel: ChannelInfo, message: PushMessage): Promise<DeliveryResult>;
}

export interface WebhookSender {
  send(channel: ChannelInfo, body: WebhookBody): Promise<DeliveryResult>;
}

export interface EngineActions {
  /** Without it, push triggers this engine would run are recorded as `skipped`. */
  push?: PushSender;
  webhook?: WebhookSender;
  /** Channel lookup for push/webhook. Without it every push/webhook trigger is "not mine". */
  channels?: ChannelDirectory;
}

/** Context handed to an attest plugin. Evaluated at `block` (the head when the trigger fired). */
export interface AttestContext {
  trigger: Trigger;
  /** The watched entity that caused the firing (as last seen; it may be gone for expired/deleted). */
  entity: RawEntity;
  event: TriggerEvent;
  block: bigint;
  now: number;
  params: Record<string, string>;
}

/**
 * An attester: returns the evidence entity to write (in the same batch as the firing receipt), or
 * null when there is nothing to attest. The engine records the written key as `attestation`.
 */
export type AttestPlugin = (port: ArkivPort, ctx: AttestContext) => Promise<CreateSpec | null> | CreateSpec | null;

/** Plugin id (trigger payload `attester`) → plugin. */
export type PluginRegistry = Readonly<Record<string, AttestPlugin>>;

// ------------------------------------------------------------------ in-page helpers (sandbox)

/** A channel directory kept in memory: the sandbox "registers" channels locally, no server. */
export interface MemoryChannelDirectory extends ChannelDirectory {
  register(kind: ChannelKind, owner: Address, id?: Hex): ChannelInfo;
  remove(id: Hex): boolean;
  list(): ChannelInfo[];
}

export function createMemoryChannelDirectory(): MemoryChannelDirectory {
  const map = new Map<Hex, ChannelInfo>();
  return {
    get: (id) => map.get(id.toLowerCase() as Hex) ?? null,
    register(kind, owner, id) {
      const channel = (id ?? randomBytes32()).toLowerCase() as Hex;
      const info: ChannelInfo = { id: channel, kind, owner: owner.toLowerCase() as Address };
      map.set(channel, info);
      return info;
    },
    remove: (id) => map.delete(id.toLowerCase() as Hex),
    list: () => [...map.values()],
  };
}

/** A PushSender that hands each message to a callback (in-app notification in the sandbox). */
export function createCallbackPushSender(onMessage: (channel: ChannelInfo, message: PushMessage) => void): PushSender {
  return {
    async send(channel, message) {
      onMessage(channel, message);
      return { ok: true, detail: 'in-app' };
    },
  };
}

/** 32 random bytes as 0x-hex (Web Crypto: Node ≥ 19 and every browser). */
export function randomBytes32(): Hex {
  const c = (globalThis as { crypto?: { getRandomValues<T extends ArrayBufferView>(a: T): T } }).crypto;
  if (!c?.getRandomValues) throw new Error('crypto.getRandomValues is unavailable');
  const b = c.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}` as Hex;
}

/** RawAttr map → JSON-safe map (bigint → decimal string). */
export function jsonAttributes(attrs: Record<string, RawAttr>): WebhookBody['attributes'] {
  const out: WebhookBody['attributes'] = {};
  for (const [k, a] of Object.entries(attrs)) {
    out[k] = { type: a.type, value: typeof a.value === 'bigint' ? a.value.toString() : a.value };
  }
  return out;
}
