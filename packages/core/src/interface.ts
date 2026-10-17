/**
 * The BhaiyaPlease domain interface — the ONLY surface apps/web may depend on.
 * Implemented twice with identical behaviour:
 *   - createBhaiyaPlease(config)      real, over @arkiv-network/sdk (src/arkiv/adapter.ts is the only SDK importer)
 *   - createMockBhaiyaPlease(config)  in-memory, expiry by timestamps, fixtures seeded
 *
 * Conventions
 *   - Queries return decoded, zod-validated domain objects. Entities that fail validation are DROPPED
 *     (anyone can write project=bhaiyaplease). Queries never return expired entities.
 *   - Queries apply the trust filters in ARCHITECTURE.md §Trust model; callers never re-check $creator.
 *   - Mutations resolve after inclusion (receipt received) and return { key, txHash }.
 *   - Mutations are serialized per wallet inside core (single write queue → no nonce races).
 *   - Errors are always BhaiyaPleaseError (see types.ts) — never raw SDK/viem errors.
 *   - "Arkiv:" in each JSDoc names the feature the call exercises (keep README/schema.md in sync).
 */
import type {
  Accept,
  Address,
  AnnounceRunInput,
  Attestation,
  Complaint,
  Decline,
  Delivery,
  DeliveryVerification,
  EntityInspection,
  EntityKey,
  FileComplaintInput,
  HandoffSecret,
  IssueAttestationInput,
  IssueReceiptInput,
  IssueReceiptResult,
  ListShopInput,
  MockConfig,
  MutationResult,
  PostRequestInput,
  PostRequestResult,
  Profile,
  RecordDeliveryInput,
  Request,
  Run,
  BhaiyaPleaseConfig,
  Shop,
  ShopCategory,
  SubscribeFilter,
  ChangeEvent,
  Unsubscribe,
  VerifiedReceipt,
  Zone,
  Zone5,
  Zone6,
  Hex,
  UnixSeconds,
  Ping,
  PingMeta,
} from './types';

export interface BhaiyaPlease {
  // ------------------------------------------------------------------ wallet
  /** Active wallet address, or null in read-only mode. */
  readonly address: Address | null;

  /** Native GLM balance in wei (default: own wallet). Drives the "Fund me" banner. Arkiv: RPC getBalance. */
  getBalance(address?: Address): Promise<bigint>;

  // ------------------------------------------------------------------ shops
  /** List a shop, 30 d expiry. Arkiv: createEntity + permissionlessExtension flag. */
  listShop(input: ListShopInput): Promise<MutationResult>;

  /** "Still open" tap by ANY wallet: +30 d. Arkiv: extendEntity on a permissionlessExtension entity. */
  confirmShopOpen(shopKey: EntityKey): Promise<MutationResult>;

  /** Shops in a route area. Arkiv: attribute query `type=shop AND zone5=… [AND category=…]`. */
  getShops(zone5: Zone5, category?: ShopCategory): Promise<Shop[]>;

  /** Arkiv: getEntity by key. */
  getShop(key: EntityKey): Promise<Shop | null>;

  // ------------------------------------------------------------------ runs
  /** Announce a run; capacity clamped to own computed tier; expiry = eta + 10 min. Arkiv: createEntity + expiry. */
  announceRun(input: AnnounceRunInput): Promise<MutationResult>;

  /** Live runs to a building zone: eta > now AND capacity_left > 0. Arkiv: typed range query (u64, i32). */
  getLiveRuns(destZone: Zone6): Promise<Run[]>;

  /** Own live runs. Arkiv: query on $creator. */
  getMyRuns(): Promise<Run[]>;

  /** Arkiv: getEntity. Null if missing/expired. */
  getRun(key: EntityKey): Promise<Run | null>;

  /** Runner withdraws a run before ETA. Arkiv: deleteEntity (owner only). */
  cancelRun(key: EntityKey): Promise<MutationResult>;

  /**
   * Runner signals "at the gate": patches ONLY run.at_gate = now (Run.atGateAt); capacity_left, other
   * attributes and expiry are untouched. Allowed after ETA; repeat calls just update the time.
   * NOT_OWNER for anyone but the runner, NOT_FOUND/EXPIRED once the run is gone. Arkiv: partial patchEntity.
   */
  markAtGate(runKey: EntityKey): Promise<MutationResult>;

  // ------------------------------------------------------------------ requests
  /**
   * Post a request on a run. Generates code+salt, predicts the request key, commits
   * keccak256(code‖salt‖requestKey), creates readonly Request (expiry = run expiry + grace).
   * Returns the secret, which the APP must persist locally. Enforces maxPrice ≤ runner's computed tier cap.
   * Arkiv: predictEntityKeys + createEntity(readonly) + key/bytes32 attributes.
   */
  postRequest(input: PostRequestInput): Promise<PostRequestResult>;

  /** Requests attached to a run (filtered: request.run = run key). Arkiv: query on key attribute. */
  getRequestsForRun(runKey: EntityKey): Promise<Request[]>;

  /** Own requests (live + recently closed). Arkiv: query on $creator. */
  getMyRequests(): Promise<Request[]>;

  /** Arkiv: getEntity. */
  getRequest(key: EntityKey): Promise<Request | null>;

  /**
   * Resident withdraws its own request before it is accepted. NOT_OWNER for anyone but the request's
   * owner; INVALID_INPUT('Already accepted') once a valid Accept exists. Arkiv: deleteEntity on a readonly entity (owner only).
   */
  cancelRequest(requestKey: EntityKey): Promise<MutationResult>;

  // ------------------------------------------------------------------ accept
  /**
   * Runner accepts a request: ONE atomic batch = create Accept + patch Run.capacity_left − 1.
   * Throws CAPACITY_EXHAUSTED if a fresh read shows 0. Arkiv: executeBatch (create + patch), patchEntity.
   */
  acceptRequest(requestKey: EntityKey): Promise<MutationResult>;

  /** The valid Accept for a request (accept.$creator == run.$creator), or null. Arkiv: query on key attribute + $creator. */
  getAcceptForRequest(requestKey: EntityKey): Promise<Accept | null>;

  /**
   * Runner turns a request down: readonly Decline (request, run, rider), expiring with the run. A declined
   * request can no longer be accepted (acceptRequest → INVALID_INPUT 'Declined'). NOT_OWNER for anyone but
   * the run's creator, EXPIRED after ETA, INVALID_INPUT 'Already accepted' / 'Already declined'.
   * Arkiv: createEntity(readonly) + expiry.
   */
  declineRequest(requestKey: EntityKey): Promise<MutationResult>;

  /** The valid Decline for a request (decline.$creator == decline.rider == run.$creator), or null. Arkiv: query on key attribute + $creator. */
  getDeclineForRequest(requestKey: EntityKey): Promise<Decline | null>;

  // ------------------------------------------------------------------ handoff / delivery
  /**
   * Runner records the handoff after scanning the resident's QR. Verifies the reveal locally
   * BEFORE writing (INVALID_REVEAL otherwise). Arkiv: createEntity(readonly), 1 y expiry, payload reveal.
   */
  recordDelivery(input: RecordDeliveryInput): Promise<MutationResult>;

  /** The trusted Delivery for a request (delivery.$creator == accept.rider), or null. Arkiv: query on key attribute. */
  getDeliveryForRequest(requestKey: EntityKey): Promise<Delivery | null>;

  /** Anyone-can-check: does the reveal hash to the Request's commit? Arkiv: reads Delivery + Request by key. */
  verifyDelivery(deliveryKey: EntityKey): Promise<DeliveryVerification>;

  // ------------------------------------------------------------------ receipts
  /**
   * Resident issues a readonly Receipt owned by the runner. ONE batch = create Receipt (readonly, 1 y)
   * + extend own Request to 1 y (keeps the commit verifiable) + changeOwnership(receipt → rider).
   * Fallback path 'two_tx' if same-batch transfer is rejected. Arkiv: executeBatch (create + extension +
   * ownershipChange), predictEntityKeys, readonly, changeOwnership.
   */
  issueReceipt(input: IssueReceiptInput): Promise<IssueReceiptResult>;

  /** All receipts owned by `rider`, each verified (see Trust model). Arkiv: query on $owner + joins by key. */
  getReceiptsFor(rider: Address): Promise<VerifiedReceipt[]>;

  /** Runner (owner) renews a receipt +1 y. Arkiv: extendEntity by owner. */
  extendReceipt(receiptKey: EntityKey): Promise<MutationResult>;

  // ------------------------------------------------------------------ complaints
  /** Resident files a complaint it keeps (runner can't delete). Also extends own Request to 180 d. Arkiv: executeBatch (create readonly + extension). */
  fileComplaint(input: FileComplaintInput): Promise<MutationResult>;

  /** Complaints about `rider` (only where complaint.$creator == request.$creator). Arkiv: query `rider=addr AND at>…`. */
  getComplaintsAgainst(rider: Address, sinceUnix?: UnixSeconds): Promise<Complaint[]>;

  // ------------------------------------------------------------------ attestations
  /** Verifier attests a wallet (readonly, 180 d). No ID data. Arkiv: createEntity(readonly) + expiry. */
  issueAttestation(input: IssueAttestationInput): Promise<MutationResult>;

  /** Verifier revokes its own attestation. Arkiv: deleteEntity by owner. */
  revokeAttestation(attestationKey: EntityKey): Promise<MutationResult>;

  /** Attestations about `subject`, each marked trusted iff $creator ∈ trustedVerifiers. Arkiv: query on addr attr + $creator. */
  getAttestationsFor(subject: Address): Promise<Attestation[]>;

  /** Attestations issued by the active wallet (verifier page). Arkiv: query on $creator. */
  getMyIssuedAttestations(): Promise<Attestation[]>;

  // ------------------------------------------------------------------ reputation
  /** Full client-side reputation + tier for any wallet. Arkiv: composed queries; nothing stored. */
  getProfile(address: Address): Promise<Profile>;

  /**
   * Same as getProfile, evaluated at a past block (dispute view: "tier when you accepted").
   * CUT-ABLE: may throw UNKNOWN('not implemented') until enabled. Arkiv: atBlock historical query.
   */
  getProfileAt(address: Address, block: bigint): Promise<Profile>;

  /** Current block number (for stamping the dispute view). */
  getBlockNumber(): Promise<bigint>;

  // ------------------------------------------------------------------ inspection / recovery
  /** Raw $creator/$owner/flags/expiry/attributes for the "on-chain proof" panel. Arkiv: getEntity system attrs. */
  inspect(key: EntityKey): Promise<EntityInspection | null>;

  /** CUT-ABLE. Move all own receipts to a new wallet (key rotation). Arkiv: executeBatch ownershipChanges. */
  transferAllReceipts(to: Address): Promise<MutationResult>;

  // ------------------------------------------------------------------ live location (pings)
  /**
   * Runner shares a coarse position for its live run: a readonly Ping with a geohash-7 cell
   * (never exact lat/lng), expiring in 120 s (never after the run). Throws NOT_OWNER for anyone but
   * the run's creator, EXPIRED once the run is over. Arkiv: createEntity(readonly) + short expiry.
   */
  publishPing(runKey: EntityKey, gh7: string, meta?: PingMeta): Promise<MutationResult>;

  /**
   * Latest valid ping per run, in an area (zone5) or for specific runs. A ping counts only if
   * ping.$creator == ping.rider == run.$creator and the run is live. Expired pings are simply gone.
   * Arkiv: attribute query `type=ping AND (zone5=… | run=key(…) OR …)` + $creator trust filter.
   */
  getLatestPings(scope: Zone5 | readonly EntityKey[]): Promise<Ping[]>;

  /** All live valid pings of a run, oldest first (≤ 2 min breadcrumb trail). Arkiv: query on key attr + $creator. */
  getRunTrail(runKey: EntityKey): Promise<Ping[]>;

  // ------------------------------------------------------------------ live updates
  /**
   * Client-side-filtered change stream from ONE shared poller. Arkiv: watchEntityEvents.
   * Note: no expiry events exist — UI must hide by expiresAt/eta itself.
   */
  subscribe(filter: SubscribeFilter, cb: (e: ChangeEvent) => void): Unsubscribe;

  /** Stop the shared watcher and release resources. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Factories (implemented in src/index.ts and src/mock/index.ts)
// ---------------------------------------------------------------------------

export type CreateBhaiyaPlease = (config: BhaiyaPleaseConfig) => Promise<BhaiyaPlease>;

export interface MockBhaiyaPlease extends BhaiyaPlease {
  /** Test/dev controls, not on the real impl. */
  readonly dev: {
    /** Advance the mock clock by `seconds` (expiry simulation). */
    advance(seconds: number): void;
    /** Switch active wallet (same store) — handy for single-tab role testing. */
    setAddress(address: Address): void;
    reset(reseed?: boolean): void;
    /** Live-location demo: publish one due ping per live seeded-runner run (synthetic route). Returns count. */
    pingTick(): Promise<number>;
    /** The mock clock (unix seconds), which `advance` moves ahead of wall time. */
    now(): number;
  };
}

export type CreateMockBhaiyaPlease = (config?: MockConfig) => MockBhaiyaPlease;

// ---------------------------------------------------------------------------
// Pure helpers exported from core (src/codec/handoff.ts, src/zones.ts, src/wallet.ts).
// Same functions used by real + mock, so hashes always match.
// ---------------------------------------------------------------------------

export interface CoreHelpers {
  /** keccak256(utf8(code) ‖ salt(16 B) ‖ requestKey(32 B)). */
  computeCodeCommit(code: string, salt: Hex, requestKey: EntityKey): Hex;
  /** "bhaiyaplease:h1:<requestKey>:<code>:<saltHex>" */
  encodeHandoffQR(secret: HandoffSecret): string;
  decodeHandoffQR(text: string): HandoffSecret; // throws BhaiyaPleaseError INVALID_INPUT
  /** "bhaiyaplease:a1:<address>" — runner shows this to a verifier. */
  encodeAddressQR(address: Address): string;
  decodeAddressQR(text: string): Address;
  /** Geohash (ngeohash) of a device position; exact lat/lng never leaves the device. */
  zoneFromLatLng(lat: number, lng: number): Zone;
  zoneFromGeohash(zone6: Zone6, label?: string): Zone;
  /** Seeded demo zones for judges outside India (pick-from-list). */
  readonly DEMO_ZONES: readonly Zone[];
}
