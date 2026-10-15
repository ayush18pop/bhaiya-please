/**
 * Single source of truth for on-chain attribute names and types (mirrors arkiv/schema.md).
 * Every entity also carries project=str(<tag>) and type=str(<EntityType>).
 */
import type { EntityType, Hex } from '../types';
import type { AttrMap, AttrType, AttrValue } from '../arkiv/port';

export const ATTR = {
  project: 'str',
  type: 'str',
  // attestation
  subject: 'addr',
  level: 'str',
  prev: 'addr',
  at: 'u64',
  // shop
  zone: 'str',
  zone5: 'str',
  category: 'str',
  name_tag: 'str',
  // run
  dest_zone: 'str',
  from_zone: 'str',
  eta: 'u64',
  capacity_left: 'i32',
  tier: 'i32',
  // request
  run: 'key',
  shop: 'key',
  max_price: 'i32',
  tip: 'i32',
  code_commit: 'bytes32',
  // accept / delivery / receipt / complaint
  request: 'key',
  rider: 'addr',
  resident: 'addr',
  delivery: 'key',
  reason: 'str',
} as const satisfies Record<string, AttrType>;

export type AttrName = keyof typeof ATTR;

/** Which attributes each entity type writes (besides project/type). Optional ones marked by the codec. */
export const ENTITY_ATTRS: Readonly<Record<EntityType, readonly AttrName[]>> = {
  attestation: ['subject', 'level', 'prev', 'at'],
  shop: ['zone', 'zone5', 'category', 'name_tag'],
  run: ['dest_zone', 'from_zone', 'eta', 'capacity_left', 'tier'],
  request: ['run', 'shop', 'dest_zone', 'max_price', 'tip', 'code_commit'],
  accept: ['request', 'run', 'rider'],
  delivery: ['request', 'rider', 'resident', 'zone'],
  receipt: ['rider', 'delivery', 'zone', 'at'],
  complaint: ['rider', 'request', 'reason', 'at'],
};

export const ENTITY_TYPES: readonly EntityType[] = [
  'attestation',
  'shop',
  'run',
  'request',
  'accept',
  'delivery',
  'receipt',
  'complaint',
];

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v);
}

type ValueFor<T extends AttrType> = Extract<AttrValue, { type: T }>['value'];

/** Typed attribute constructor keyed by name, so a name can never be written with the wrong type. */
export function attr<N extends AttrName>(name: N, value: ValueFor<(typeof ATTR)[N]>): AttrValue {
  const type = ATTR[name];
  const hexLike = type === 'addr' || type === 'key' || type === 'bytes32';
  const v = hexLike && typeof value === 'string' ? value.toLowerCase() : value;
  return { type, value: v } as AttrValue;
}

export const strV = (value: string): AttrValue => ({ type: 'str', value });
export const u64V = (value: number | bigint): Extract<AttrValue, { type: 'u64' }> => ({
  type: 'u64',
  value: BigInt(value),
});
export const i32V = (value: number): Extract<AttrValue, { type: 'i32' }> => ({ type: 'i32', value });

/** Addresses and keys are lowercased everywhere in core so comparisons are plain `===`. */
export function lower<T extends Hex>(v: T): T {
  return v.toLowerCase() as T;
}

/** Base attributes carried by every entity. */
export function baseAttrs(project: string, type: EntityType): AttrMap {
  return { project: strV(project), type: strV(type) };
}
