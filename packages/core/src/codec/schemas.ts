/**
 * zod schemas for everything read from chain. Anyone can write project=bhaiyaplease, so every
 * attribute and payload is validated; anything malformed is dropped by the codec.
 * Also used to validate user inputs in services (same rules both directions).
 */
import { z } from 'zod';
import { TIERS } from '../types';
import type { Address, EntityKey, Hex } from '../types';

const GEOHASH = '0123456789bcdefghjkmnpqrstuvwxyz';
const geohashOf = (len: number) => new RegExp(`^[${GEOHASH}]{${len}}$`);

export const zone6Schema = z.string().regex(geohashOf(6), 'zone must be a 6-char geohash');
export const zone5Schema = z.string().regex(geohashOf(5), 'zone5 must be a 5-char geohash');

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'invalid address')
  .transform((s) => s.toLowerCase() as Address);
export const keySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'invalid entity key')
  .transform((s) => s.toLowerCase() as EntityKey);
export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'invalid bytes32')
  .transform((s) => s.toLowerCase() as Hex);
export const saltSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{32}$/, 'salt must be 16 bytes hex')
  .transform((s) => s.toLowerCase() as Hex);
export const codeSchema = z.string().regex(/^\d{4}$/, 'code must be 4 digits');

export const MAX_TIER_LEVEL = 2;
export const MAX_CAPACITY = TIERS[2].requestsPerRun;
/** Generous sanity bound; tier caps are enforced by services, not the codec. */
export const MAX_RUPEES = 100_000;

export const rupeesSchema = z.number().int().min(0).max(MAX_RUPEES);
export const nameTagSchema = z.string().trim().min(1).max(48);
export const noteSchema = z.string().trim().max(140);
export const itemSchema = z.string().trim().min(1).max(80);
export const itemsSchema = z.array(itemSchema).min(1).max(3);

export const shopCategorySchema = z.enum(['grocery', 'bakery', 'pharmacy_otc', 'stationery', 'household']);
export const receiptTagSchema = z.enum(['exact_item', 'on_time', 'polite', 'good_price', 'careful_packing']);
export const receiptTagsSchema = z
  .array(receiptTagSchema)
  .max(5)
  .refine((tags) => new Set(tags).size === tags.length, 'duplicate tags');
export const complaintReasonSchema = z.enum(['no_show', 'wrong_item', 'rude']);
export const attestationLevelSchema = z.enum(['id_checked', 'resident', 'successor']);
export const tierLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

// ------------------------------------------------------------------ typed attribute cells

const cell = <T extends string, S extends z.ZodType>(type: T, value: S) =>
  z.object({ type: z.literal(type), value });

const unixFromU64 = z
  .bigint()
  .min(0n)
  .max(BigInt(Number.MAX_SAFE_INTEGER))
  .transform((v) => Number(v));

export const A = {
  str: <S extends z.ZodType<string>>(s: S) => cell('str', s),
  zone6: cell('str', zone6Schema),
  zone5: cell('str', zone5Schema),
  addr: cell('addr', addressSchema),
  key: cell('key', keySchema),
  bytes32: cell('bytes32', bytes32Schema),
  unix: cell('u64', unixFromU64),
  rupees: cell('i32', rupeesSchema),
  capacity: cell('i32', z.number().int().min(0).max(MAX_CAPACITY)),
  tier: cell('i32', tierLevelSchema),
};

export const attrSchemas = {
  attestation: z.object({
    subject: A.addr,
    level: A.str(attestationLevelSchema),
    prev: A.addr.optional(),
    at: A.unix,
  }),
  shop: z.object({
    zone: A.zone6,
    zone5: A.zone5,
    category: A.str(shopCategorySchema),
    name_tag: A.str(nameTagSchema),
  }),
  run: z.object({
    dest_zone: A.zone6,
    from_zone: A.zone6,
    eta: A.unix,
    capacity_left: A.capacity,
    tier: A.tier,
    /** Optional: runs announced before (or never marked) have no at_gate. */
    at_gate: A.unix.optional(),
  }),
  request: z.object({
    run: A.key,
    shop: A.key,
    dest_zone: A.zone6,
    max_price: A.rupees,
    tip: A.rupees,
    code_commit: A.bytes32,
  }),
  accept: z.object({ request: A.key, run: A.key, rider: A.addr }),
  decline: z.object({ request: A.key, run: A.key, rider: A.addr }),
  delivery: z.object({ request: A.key, rider: A.addr, resident: A.addr, zone: A.zone6 }),
  receipt: z.object({ rider: A.addr, delivery: A.key, zone: A.zone6, at: A.unix }),
  complaint: z.object({
    rider: A.addr,
    request: A.key,
    reason: A.str(complaintReasonSchema),
    at: A.unix,
  }),
};

export const payloadSchemas = {
  run: z.object({ note: noteSchema.optional() }),
  request: z.object({ items: itemsSchema }),
  delivery: z.object({ code: codeSchema, salt: saltSchema }),
  receipt: z.object({ tags: receiptTagsSchema }),
  /** Entities with no meaningful payload accept any JSON object. */
  none: z.object({}),
};
