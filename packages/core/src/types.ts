/**
 * BhaiyaPlease domain types. Pure types + constants, no runtime dependencies.
 * Shared contract between packages/core (Person A) and apps/web (Person B).
 * Change only by agreement of both owners after the Thu 21:00 freeze.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Hex = `0x${string}`;
export type Address = `0x${string}`;
/** Arkiv entity key ($key), 32-byte hex. */
export type EntityKey = `0x${string}`;
export type TxHash = `0x${string}`;
/** Unix seconds. All times in the domain layer are unix seconds (number). */
export type UnixSeconds = number;
/** Whole rupees. Integers only (stored as i32 on chain). */
export type Rupees = number;

/** Geohash precision 6 (~1.2 km x 0.6 km). Building / destination zone. */
export type Zone6 = string;
/** Geohash precision 5 (~4.9 km x 4.9 km). Shop catchment / route area. */
export type Zone5 = string;

export const PROJECT_TAG = 'bhaiyaplease' as const;

export type EntityType =
  | 'attestation'
  | 'shop'
  | 'run'
  | 'request'
  | 'accept'
  | 'delivery'
  | 'receipt'
  | 'complaint';

/** Arkiv system attributes, surfaced on every domain object. Unforgeable. */
export interface EntityMeta {
  key: EntityKey;
  /** $creator: immutable. The ONLY trustworthy authorship signal. */
  creator: Address;
  /** $owner: current owner (changes on changeOwnership). */
  owner: Address;
  /** $createdAt as unix seconds. SDK returns a block number; adapter converts (2 s blocks). Not query-filterable. */
  createdAt: UnixSeconds;
  /** $expiresAt as unix seconds (SDK: block number; adapter converts). */
  expiresAt: UnixSeconds;
  /** Creation flag, reported by the codec from our schema (not all SDKs expose flags on read). */
  readonly: boolean;
  permissionlessExtension: boolean;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export interface Zone {
  zone6: Zone6;
  /** Always zone6.slice(0, 5). */
  zone5: Zone5;
  /** Human label, device-local only (never written to Arkiv). e.g. "Whitefield (demo)". */
  label?: string;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export type ShopCategory = 'grocery' | 'bakery' | 'pharmacy_otc' | 'stationery' | 'household';

export interface Shop extends EntityMeta {
  zone: Zone6;
  zone5: Zone5;
  category: ShopCategory;
  /** Public shop name, synthetic in the demo ("Lakshmi Stores"). Not personal data. */
  nameTag: string;
}

export interface Run extends EntityMeta {
  destZone: Zone6;
  fromZone: Zone6;
  eta: UnixSeconds;
  capacityLeft: number;
  /**
   * Tier the runner CLAIMED at announce time. Self-declared → never trusted for
   * limits; the UI shows the viewer-computed tier from getProfile().
   */
  claimedTier: TierLevel;
  note?: string;
}

export interface Request extends EntityMeta {
  run: EntityKey;
  shop: EntityKey;
  destZone: Zone6;
  maxPrice: Rupees;
  tip: Rupees;
  /** keccak256(code ‖ salt ‖ requestKey). See computeCodeCommit in ARCHITECTURE.md. */
  codeCommit: Hex;
  /** 1–3 free-text item lines, synthetic in the demo. */
  items: string[];
}

export interface Accept extends EntityMeta {
  request: EntityKey;
  run: EntityKey;
  rider: Address;
}

export interface Delivery extends EntityMeta {
  request: EntityKey;
  rider: Address;
  resident: Address;
  zone: Zone6;
  /** Public reveal (payload). */
  code: string;
  salt: Hex;
}

export type ReceiptTag = 'exact_item' | 'on_time' | 'polite' | 'good_price' | 'careful_packing';

export interface Receipt extends EntityMeta {
  rider: Address;
  delivery: EntityKey;
  zone: Zone6;
  /** Resident-declared time attribute. Windows use createdAt ($createdAt), not this. */
  at: UnixSeconds;
  tags: ReceiptTag[];
}

export type ComplaintReason = 'no_show' | 'wrong_item' | 'rude';

export interface Complaint extends EntityMeta {
  rider: Address;
  request: EntityKey;
  reason: ComplaintReason;
  at: UnixSeconds;
}

export type AttestationLevel = 'id_checked' | 'resident' | 'successor';

export interface Attestation extends EntityMeta {
  subject: Address;
  level: AttestationLevel;
  /** Previous wallet, only for level = 'successor'. */
  prev?: Address;
  at: UnixSeconds;
  /** Computed by the viewer: creator ∈ config.trustedVerifiers. */
  trusted: boolean;
}

// ---------------------------------------------------------------------------
// Verification & reputation (computed client-side, never stored)
// ---------------------------------------------------------------------------

export type ReceiptInvalidReason =
  | 'delivery_missing'
  | 'request_missing'
  | 'reveal_mismatch'
  | 'creator_not_requester' // receipt.$creator !== request.$creator
  | 'rider_mismatch' // delivery.$creator / delivery.rider / receipt.rider disagree
  | 'self_dealing' // receipt.$creator === receipt.rider
  | 'duplicate'; // another valid receipt already credits the same request (one handoff = one credit)

export interface DeliveryVerification {
  valid: boolean;
  reason?: Exclude<ReceiptInvalidReason, 'creator_not_requester' | 'self_dealing' | 'delivery_missing' | 'duplicate'>;
  delivery: Delivery;
  request?: Request;
}

export interface VerifiedReceipt {
  receipt: Receipt;
  valid: boolean;
  reason?: ReceiptInvalidReason;
}

export type TierLevel = 0 | 1 | 2; // 0 New, 1 Verified, 2 Trusted
export type TierName = 'new' | 'verified' | 'trusted';

export interface TierLimits {
  tier: TierLevel;
  name: TierName;
  priceCap: Rupees;
  requestsPerRun: number;
}

export const TIERS: Readonly<Record<TierLevel, TierLimits>> = {
  0: { tier: 0, name: 'new', priceCap: 200, requestsPerRun: 1 },
  1: { tier: 1, name: 'verified', priceCap: 500, requestsPerRun: 2 },
  2: { tier: 2, name: 'trusted', priceCap: 1000, requestsPerRun: 3 },
};

/** Thresholds for Trusted. */
export const TRUSTED_RULE = {
  minReceipts: 25,
  minDistinctResidents: 15,
  maxComplaints30d: 2, // "< 3 complaints in 30 days"
  windowSeconds: 30 * 24 * 3600,
} as const;

export interface Profile {
  address: Address;
  /** Counted from VALID receipts only. */
  receiptsTotal: number;
  distinctResidents: number;
  receipts30d: number;
  distinctResidents30d: number;
  /** Receipts that failed verification (shown greyed, not counted). */
  invalidReceipts: number;
  complaints: Complaint[];
  complaints30d: number;
  attestations: Attestation[];
  /** True if any attestation from a trusted verifier is live. */
  verified: boolean;
  tier: TierLimits;
  /** Tag histogram over valid receipts. */
  tagCounts: Partial<Record<ReceiptTag, number>>;
  /** Block the profile was computed at (latest unless getProfileAt). */
  atBlock?: bigint;
  computedAt: UnixSeconds;
}

// ---------------------------------------------------------------------------
// Handoff secret (device-local; never written to Arkiv until the Delivery reveal)
// ---------------------------------------------------------------------------

export interface HandoffSecret {
  requestKey: EntityKey;
  /** 4 ASCII digits, e.g. "0427". */
  code: string;
  /** 16 random bytes. */
  salt: Hex;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface ListShopInput {
  zone: Zone6;
  category: ShopCategory;
  nameTag: string;
}

export interface AnnounceRunInput {
  destZone: Zone6;
  fromZone: Zone6;
  /** Minutes from now; core converts to eta and expiry (eta + 10 min). */
  etaMinutes: number;
  /** Desired capacity; core clamps to own tier's requestsPerRun. */
  capacity: number;
  note?: string;
}

export interface PostRequestInput {
  runKey: EntityKey;
  shopKey: EntityKey;
  items: string[]; // 1..3
  maxPrice: Rupees;
  tip: Rupees;
}

export interface RecordDeliveryInput {
  /** Usually straight from decodeHandoffQR(scannedText). */
  secret: HandoffSecret;
}

export interface IssueReceiptInput {
  deliveryKey: EntityKey;
  tags: ReceiptTag[];
}

export interface FileComplaintInput {
  requestKey: EntityKey;
  rider: Address;
  reason: ComplaintReason;
}

export interface IssueAttestationInput {
  subject: Address;
  level: AttestationLevel;
  prev?: Address; // required iff level === 'successor'
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface MutationResult {
  /** Primary entity created/affected. */
  key: EntityKey;
  /** Hash of the (last) transaction. */
  txHash: TxHash;
  /** Present when the operation used >1 tx (e.g. receipt fallback path). */
  txHashes?: TxHash[];
}

export interface PostRequestResult extends MutationResult {
  /** Must be persisted by the app (localStorage) to render the handoff QR later. */
  secret: HandoffSecret;
}

export interface IssueReceiptResult extends MutationResult {
  /** 'batch' = single atomic executeBatch; 'two_tx' = fallback create then changeOwnership. */
  path: 'batch' | 'two_tx';
}

/** Raw on-chain view for the "inspect" panel (demo shot 1:50). */
export interface EntityInspection extends EntityMeta {
  type: EntityType | 'unknown';
  attributes: Record<string, string | number | bigint>;
  payloadText?: string;
  explorerUrl?: string;
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

export type ChangeKind = 'created' | 'patched' | 'extended' | 'transferred' | 'deleted';

export interface ChangeEvent {
  kind: ChangeKind;
  key: EntityKey;
  /** Resolved when known (created/patched via a follow-up read); undefined for deletes of unknown keys. */
  type?: EntityType;
  /** Selected decoded attributes useful for filtering (run, request, dest_zone, rider, subject, $owner). */
  hints?: Partial<{
    run: EntityKey;
    request: EntityKey;
    destZone: Zone6;
    rider: Address;
    subject: Address;
    owner: Address;
    newOwner: Address;
  }>;
}

/** All fields AND-ed; omitted = wildcard. Filtering is client-side (no server filter on events). */
export interface SubscribeFilter {
  types?: EntityType[];
  keys?: EntityKey[];
  run?: EntityKey;
  request?: EntityKey;
  destZone?: Zone6;
  rider?: Address;
  subject?: Address;
}

export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Anything that can sign for the active wallet. Burner key is the default path. */
export type SignerConfig =
  | { kind: 'privateKey'; privateKey: Hex }
  | { kind: 'injected' } // window.ethereum (MetaMask) — optional
  | { kind: 'none' }; // read-only

export interface BhaiyaPleaseConfig {
  rpcUrl: string; // https://rpc.tiramisu.db-chain.testnet.arkiv.network
  wsUrl?: string;
  /** hub.arkiv.network access key. Public in the bundle; rate-limit only, not a secret of value. */
  accessKey?: string;
  chainId?: number; // default 7738577
  signer: SignerConfig;
  /** Verifier wallets whose attestations the viewer trusts. */
  trustedVerifiers: Address[];
  /** Override project tag (tests only). Default PROJECT_TAG. */
  projectTag?: string;
  /** Event poll interval for the shared watcher. Default 2000. */
  pollIntervalMs?: number;
  explorerBaseUrl?: string;
  /** Optional logger for friction.md evidence. */
  onSdkError?: (op: string, err: unknown) => void;
  /**
   * Receipt issuance path. 'auto' (default): one atomic batch, falling back to 'two_tx' for the
   * session if the chain rejects transferring an entity created in the same batch.
   */
  receiptMode?: 'auto' | 'batch' | 'two_tx';
}

export interface MockConfig {
  /** Active wallet in the mock. Default: a deterministic fake address. */
  address?: Address;
  trustedVerifiers?: Address[];
  /** Clock override for expiry simulation. Default Date.now()/1000. */
  now?: () => UnixSeconds;
  /** Artificial latency for mutations, ms. Default 600 (≈ feels like 2 s blocks). */
  latencyMs?: number;
  /** Load fixtures (2 zones, shops, verifier, 3 runners with history). Default true. */
  seed?: boolean;
  /**
   * Share state across instances/tabs. 'memory' = per-instance; 'localStorage' = persisted +
   * cross-tab via storage events, so two tabs act as runner + resident.
   */
  store?: 'memory' | 'localStorage';
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type BhaiyaPleaseErrorCode =
  | 'NO_SIGNER' // mutation called in read-only mode
  | 'INSUFFICIENT_FUNDS' // wallet has no GLM for gas → UI shows "Fund me"
  | 'RATE_LIMITED' // RPC 429 after retries
  | 'NETWORK' // RPC unreachable after retries
  | 'NOT_FOUND' // entity missing or expired
  | 'EXPIRED' // run/request past eta / expiresAt
  | 'NOT_OWNER' // patch/delete/transfer on someone else's entity
  | 'CAPACITY_EXHAUSTED' // run.capacityLeft === 0 at accept time
  | 'TIER_LIMIT' // maxPrice > cap, or capacity > requestsPerRun
  | 'INVALID_INPUT' // zod/input validation failed
  | 'INVALID_REVEAL' // code/salt do not hash to request.codeCommit
  | 'KEY_PREDICTION_MISMATCH' // created key !== predicted key (commit unusable)
  | 'BATCH_FAILED' // executeBatch reverted / rejected
  | 'UNKNOWN';

export class BhaiyaPleaseError extends Error {
  readonly code: BhaiyaPleaseErrorCode;
  /** True if retrying the same call later may succeed. */
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(code: BhaiyaPleaseErrorCode, message: string, opts?: { retryable?: boolean; cause?: unknown }) {
    super(message);
    this.name = 'BhaiyaPleaseError';
    this.code = code;
    this.retryable = opts?.retryable ?? (code === 'RATE_LIMITED' || code === 'NETWORK');
    this.cause = opts?.cause;
  }
}
