/**
 * Client-side reputation. Nothing is stored as a score; every number is recomputed by the viewer
 * from entities whose authorship ($creator / $owner) the chain guarantees.
 */
import { decode } from '../codec/entities';
import { revealMatches } from '../codec/handoff';
import { TIERS, TRUSTED_RULE } from '../types';
import type {
  Address,
  Attestation,
  Complaint,
  Delivery,
  DeliveryVerification,
  EntityKey,
  Profile,
  Receipt,
  ReceiptTag,
  Request,
  TierLimits,
  UnixSeconds,
  VerifiedReceipt,
} from '../types';
import type { ReadPort } from '../arkiv/port';
import { listAttestationsFor } from './attestations';
import { listComplaintsAgainst } from './complaints';
import { mapLimit, memoGets, reader, sameAddr } from './context';
import type { Reader, ServiceContext } from './context';

/** Does the reveal hash to the request's commit, and did the rider write it themselves? */
export function verifyDeliveryData(delivery: Delivery, request: Request | null): DeliveryVerification {
  if (!request || request.key !== delivery.request) return { valid: false, reason: 'request_missing', delivery };
  if (!revealMatches(delivery.code, delivery.salt, request.key, request.codeCommit)) {
    return { valid: false, reason: 'reveal_mismatch', delivery, request };
  }
  if (!sameAddr(delivery.creator, delivery.rider)) return { valid: false, reason: 'rider_mismatch', delivery, request };
  return { valid: true, delivery, request };
}

/**
 * Receipt validity (ARCHITECTURE §3 step 3): delivery exists ∧ reveal verifies ∧
 * delivery.$creator == delivery.rider == receipt.rider ∧ request.$creator == receipt.$creator ∧
 * receipt.$creator ≠ receipt.rider.
 */
export function verifyReceiptData(
  receipt: Receipt,
  delivery: Delivery | null,
  request: Request | null,
): VerifiedReceipt {
  const bad = (reason: NonNullable<VerifiedReceipt['reason']>): VerifiedReceipt => ({ receipt, valid: false, reason });
  if (!delivery || delivery.key !== receipt.delivery) return bad('delivery_missing');
  const dv = verifyDeliveryData(delivery, request);
  if (!dv.valid) return bad(dv.reason ?? 'reveal_mismatch');
  if (!sameAddr(delivery.rider, receipt.rider)) return bad('rider_mismatch');
  if (!request || !sameAddr(request.creator, receipt.creator)) return bad('creator_not_requester');
  if (sameAddr(receipt.creator, receipt.rider)) return bad('self_dealing');
  return { receipt, valid: true };
}

/**
 * One handoff = one credit: only the earliest valid receipt per request counts; later ones are
 * marked 'duplicate' (otherwise a resident could mint many receipts for one delivery).
 */
export function markDuplicates(items: { verified: VerifiedReceipt; request?: EntityKey }[]): VerifiedReceipt[] {
  const sorted = [...items].sort(
    (a, b) => a.verified.receipt.createdAt - b.verified.receipt.createdAt || cmp(a.verified.receipt.key, b.verified.receipt.key),
  );
  const seen = new Set<EntityKey>();
  return sorted.map(({ verified, request }) => {
    if (!verified.valid || !request) return verified;
    if (seen.has(request)) return { receipt: verified.receipt, valid: false, reason: 'duplicate' };
    seen.add(request);
    return verified;
  });
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function tierFor(p: {
  verified: boolean;
  receiptsTotal: number;
  distinctResidents: number;
  complaints30d: number;
}): TierLimits {
  if (!p.verified) return TIERS[0];
  const trusted =
    p.receiptsTotal >= TRUSTED_RULE.minReceipts &&
    p.distinctResidents >= TRUSTED_RULE.minDistinctResidents &&
    p.complaints30d <= TRUSTED_RULE.maxComplaints30d;
  return trusted ? TIERS[2] : TIERS[1];
}

export interface ProfileInput {
  address: Address;
  receipts: VerifiedReceipt[];
  /** Already trust-filtered complaints. */
  complaints: Complaint[];
  /** Already marked trusted/untrusted; expired ones must not be present. */
  attestations: Attestation[];
  now: UnixSeconds;
  atBlock?: bigint;
}

/** Pure: same inputs → same profile. Windows use $createdAt, never self-declared `at`. */
export function computeProfile(i: ProfileInput): Profile {
  const since = i.now - TRUSTED_RULE.windowSeconds;
  const valid = i.receipts.filter((r) => r.valid).map((r) => r.receipt);
  const recent = valid.filter((r) => r.createdAt >= since);
  const tagCounts: Partial<Record<ReceiptTag, number>> = {};
  for (const r of valid) for (const t of r.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const verified = i.attestations.some((a) => a.trusted && a.expiresAt > i.now);
  const complaints30d = i.complaints.filter((c) => c.createdAt >= since).length;
  const receiptsTotal = valid.length;
  const distinctResidents = new Set(valid.map((r) => r.creator)).size;
  const profile: Profile = {
    address: i.address,
    receiptsTotal,
    distinctResidents,
    receipts30d: recent.length,
    distinctResidents30d: new Set(recent.map((r) => r.creator)).size,
    invalidReceipts: i.receipts.length - receiptsTotal,
    complaints: i.complaints,
    complaints30d,
    attestations: i.attestations,
    verified,
    tier: tierFor({ verified, receiptsTotal, distinctResidents, complaints30d }),
    tagCounts,
    computedAt: i.now,
  };
  if (i.atBlock !== undefined) profile.atBlock = i.atBlock;
  return profile;
}

// ------------------------------------------------------------------ loaders

/** Receipts owned by any of `owners`, each verified against its Delivery and Request. */
export async function loadVerifiedReceipts(rd: Reader, owners: readonly Address[]): Promise<VerifiedReceipt[]> {
  const lists = await Promise.all(owners.map((owner) => rd.list('receipt', decode.receipt, [], { owner })));
  const receipts = dedupeByKey(lists.flat());
  const items = await mapLimit(receipts, 6, async (receipt) => {
    const delivery = await rd.one(receipt.delivery, decode.delivery);
    const request = delivery ? await rd.one(delivery.request, decode.request) : null;
    const verified = verifyReceiptData(receipt, delivery, request);
    return request ? { verified, request: request.key } : { verified };
  });
  return markDuplicates(items);
}

function dedupeByKey<T extends { key: EntityKey }>(xs: T[]): T[] {
  const m = new Map<EntityKey, T>();
  for (const x of xs) m.set(x.key, x);
  return [...m.values()];
}

export async function loadProfile(
  ctx: ServiceContext,
  r: ReadPort,
  address: Address,
  atBlock?: bigint,
): Promise<Profile> {
  const subject = address.toLowerCase() as Address;
  const rd = reader(memoGets(r), ctx.project, ctx.drop);
  const attestations = await listAttestationsFor(rd, ctx.trustedVerifiers, subject);
  // Key rotation: a trusted 'successor' attestation carries the old wallet's receipts over.
  const prevs = attestations
    .filter((a) => a.trusted && a.level === 'successor' && a.prev && !sameAddr(a.prev, subject))
    .map((a) => a.prev as Address);
  const [receipts, complaints] = await Promise.all([
    loadVerifiedReceipts(rd, [subject, ...new Set(prevs)]),
    listComplaintsAgainst(rd, subject),
  ]);
  const input: ProfileInput = { address: subject, receipts, complaints, attestations, now: rd.now() };
  if (atBlock !== undefined) input.atBlock = atBlock;
  return computeProfile(input);
}
