# Arkiv schema

Chain: Arkiv Tiramisu testnet (chain id 7738577). SDK: `@arkiv-network/sdk` 0.8.1. Every entity is a plain Arkiv entity: **no smart contracts, no off-chain index, no backend**. Source of truth in code: attribute table `packages/core/src/codec/attrs.ts`, encoders `packages/core/src/codec/entities.ts`, validators `packages/core/src/codec/schemas.ts`, TTLs `packages/core/src/services/context.ts`, the only SDK importer `packages/core/src/arkiv/adapter.ts`.

> Status: every write-side behaviour this schema relies on was exercised against Tiramisu with funded keys on 16 Oct 2026 (`pnpm spike`: 29/29 PASS; `pnpm seed`: the full fixture history written through the production core; the real-core web build driven end to end in a browser). Section 10 lists each assumption with its chain result.

## 1. Conventions

- Every entity carries `project = str('bhaiyaplease')` and `type = str('<entity>')`. Anyone can write that tag, so **nothing is trusted because of it**; trust comes from `$creator` / `$owner` (section 6).
- Payload is UTF-8 JSON, `contentType = application/json`, always far below the 128 KiB limit.
- Addresses, keys and bytes32 values are lowercased in core so comparisons are plain `===`.
- Lifetimes are given to the SDK as `ExpirationTime.fromSeconds(n)` with `n` rounded up to a whole number of 2 s blocks (minimum 2). The chain returns `$expiresAt` as a block number; the adapter converts to unix seconds using `getBlockTiming()`.
- Every read is validated with zod; entities with a wrong tag, wrong attribute type, bad geohash, out-of-range number or malformed payload are **dropped** (reported to `onSdkError`), never shown.
- Reputation is **never stored**. There is no score, rank or tier entity.

## 2. Entity types

Attribute types are Arkiv attribute types (`str`, `i32`, `u64`, `addr`, `key`, `bytes32`). Flags: **RO** = `readonly`, **PE** = `permissionlessExtension`. Flags are immutable after creation.

| Entity | Flags | Expiry (from creation) | Created by | `$owner` | Why this ownership |
|---|---|---|---|---|---|
| `shop` | PE | 30 d; any wallet's "still open" resets to now + 30 d | any wallet (lister) | lister | Community data, nobody needs special rights. PE lets neighbours keep it alive instead of the lister. |
| `run` | none (must be patched) | `etaMinutes*60 + 600` s (ETA + 10 min) | runner | runner | Only the runner may decrement `capacity_left` or delete the run. Not RO because accept patches it. |
| `request` | RO | `max(60, run.expiresAt - now + 3600)` s (run expiry + 1 h grace). Extended to 1 y when a receipt is issued; to 180 d when a complaint is filed (each only if that moves expiry later) | resident | resident | The commit must be immutable (RO), and the resident keeps the right to extend/delete it. |
| `accept` | none | `max(2, run.expiresAt - now)` s (dies with the run) | runner | runner | Proves the runner took the job; written atomically with the run patch. |
| `delivery` | RO | 1 y | runner | runner | The runner reveals the handoff secret; RO so the reveal cannot be rewritten. |
| `receipt` | RO | 1 y; the owner (runner) can renew +1 y | **resident** | **runner** (transferred) | The point of the project: the resident authors it (`$creator`, unforgeable, immutable) but the **runner owns it**, so reputation is a portable asset the runner holds and renews, and no platform database owns it. |
| `complaint` | RO | 180 d | resident | resident | The accused runner cannot delete or edit it (not the owner). The resident keeps ownership on purpose. |
| `attestation` | RO | 180 d | verifier | verifier | Contains no ID data, only "this wallet was checked". Verifier revokes by deleting (RO still allows delete). |

## 3. Attributes (besides `project`, `type`)

| Attribute | Arkiv type | Used by | Purpose |
|---|---|---|---|
| `subject` | addr | attestation | Wallet being attested |
| `level` | str | attestation | `id_checked` / `resident` / `successor` |
| `prev` | addr | attestation (only `successor`, required iff successor) | Old wallet whose receipts carry over (key rotation) |
| `at` | u64 | attestation, receipt, complaint | Writer-declared unix time. Reputation windows use `$createdAt`, not this; `at` exists because `$createdAt` is not filterable, and the complaint query filters `at >= since` |
| `zone` | str (geohash-6) | shop, delivery, receipt | Shop location / delivery zone |
| `zone5` | str (geohash-5) | shop | Route/catchment area; must equal `zone[0..5]` or the shop is dropped |
| `category` | str | shop | `grocery` `bakery` `pharmacy_otc` `stationery` `household` |
| `name_tag` | str (1-48 chars) | shop | Public shop name (synthetic in the demo) |
| `dest_zone` | str (geohash-6) | run, request | Destination building zone |
| `from_zone` | str (geohash-6) | run | Where the runner is coming from |
| `eta` | u64 | run | Unix seconds. u64 so it supports range queries |
| `capacity_left` | i32 (0-3) | run | Decremented by `accept` in the same batch |
| `tier` | i32 (0-2) | run | **Self-declared** tier at announce time. Display hint only; limits always use the viewer-computed tier |
| `run` | key | request, accept | Run this request/accept refers to |
| `shop` | key | request | Shop to buy from |
| `max_price` | i32 (rupees, 0-100000) | request | Price ceiling; checked against the runner's computed tier cap |
| `tip` | i32 (rupees) | request | Tip offered |
| `code_commit` | bytes32 | request | `keccak256(utf8(code) ‖ salt(16 B) ‖ requestKey(32 B))` |
| `request` | key | accept, delivery, complaint | Request referred to |
| `rider` | addr | accept, delivery, receipt, complaint | The runner |
| `resident` | addr | delivery | Request creator (informational; trust uses `$creator`) |
| `delivery` | key | receipt | Delivery being credited |
| `reason` | str | complaint | `no_show` / `wrong_item` / `rude` |

Per entity (exactly `ENTITY_ATTRS` in code):

```
attestation: subject level [prev] at
shop:        zone zone5 category name_tag
run:         dest_zone from_zone eta capacity_left tier
request:     run shop dest_zone max_price tip code_commit
accept:      request run rider
delivery:    request rider resident zone
receipt:     rider delivery zone at
complaint:   rider request reason at
```

## 4. Payloads (JSON)

| Entity | Payload | Notes |
|---|---|---|
| shop | `{}` | |
| run | `{ "note"?: string<=140 }` | Free text, synthetic in the demo |
| request | `{ "items": string[1..3] }` | Each item 1-80 chars, e.g. "1 L toned milk" |
| accept | `{}` | |
| delivery | `{ "code": "0427", "salt": "0x<32 hex>" }` | The **reveal**. Public by design: it only proves the handoff happened; it is the first time it touches Arkiv |
| receipt | `{ "tags": ReceiptTag[0..5] }` | `exact_item` `on_time` `polite` `good_price` `careful_packing`, no duplicates |
| complaint | `{}` | |
| attestation | `{}` | |

Payloads with no schema accept any JSON object and ignore its contents.

## 5. Queries the app runs

Built with the typed builder `publicClient.select('*').where([...]).limit(200)` (`.ownedBy` → `$owner`, `.createdBy` → `$creator`, `.atBlock` for history). Multi-page walks are pinned to the block of the first page (`.atBlock(page.blockNumber)`), restart once on an expired cursor, and stop at 2000 rows with a reported (not silent) truncation. The strings below are the SDK's own rendering of those builders (`String(builder)`), with illustrative values. Lines marked *list* come from one helper that always prepends `project = str('bhaiyaplease') AND type = str('<type>')`.

| Used by (core API) | Query |
|---|---|
| `getLiveRuns(destZone)` | `project = str('bhaiyaplease') AND type = str('run') AND dest_zone = str('tdr3c1') AND eta > u64(1760000000) AND capacity_left > i32(0)` |
| `getMyRuns()` | `… type = str('run') AND $creator = addr(0x…)` |
| `getShops(zone5, category?)` | `… type = str('shop') AND zone5 = str('tdr3c') [AND category = str('grocery')]` |
| `getRequestsForRun(runKey)` | `… type = str('request') AND run = key(0x…)` |
| `getMyRequests()` | `… type = str('request') AND $creator = addr(0x…)` |
| accepts for a run (capacity, trust) | `… type = str('accept') AND run = key(0x…) AND $creator = addr(<runner>)` |
| `getAcceptForRequest(requestKey)` | `… type = str('accept') AND request = key(0x…) AND $creator = addr(<run creator>)` |
| `getDeliveryForRequest(requestKey)` | `… type = str('delivery') AND request = key(0x…)` |
| `getReceiptsFor(rider)` (reputation core) | `… type = str('receipt') AND $owner = addr(<rider>)`, then per receipt a read of its Delivery and that Delivery's Request |
| `issueReceipt` duplicate check | `… type = str('receipt') AND delivery = key(0x…) AND $creator = addr(<resident>)` |
| `transferAllReceipts()` | `… type = str('receipt') AND $owner = addr(<self>)` |
| `getComplaintsAgainst(rider, since?)` | `… type = str('complaint') AND rider = addr(0x…) [AND at >= u64(since)]`, then a read of each referenced Request and `… type = str('delivery') AND request = key(0x…) AND $creator = addr(<rider>)` (evidence the rider served it) |
| `fileComplaint` duplicate check | `… type = str('complaint') AND request = key(0x…) AND $creator = addr(<resident>)` |
| `getAttestationsFor(subject)` | `… type = str('attestation') AND subject = addr(0x…)` |
| `getMyIssuedAttestations()` | `… type = str('attestation') AND $creator = addr(<verifier>)` |
| any single-entity read (`getRun`, `getShop`, `getRequest`, `inspect`, joins) | `$key = key(0x…)` (note: implemented as a query on `$key`, not `getEntity`) |
| `getProfileAt(addr, block)` | the profile queries above, each with `.atBlock(block)` |

Also used (not queries): `predictEntityKeys({owner, count})`, `getBlockTiming()`, `getBlockNumber()`, `getBalance()`, `watchEntityEvents` (section 7), writes `createEntity` `patchEntity` `extendEntity` `changeOwnership` `deleteEntity` `executeBatch`.

Never used: `!=`/`ne()` (the network is documented to reject it), `getEntityCount()`, match-all queries.

## 6. Trust model

Anyone can create any entity with `project=bhaiyaplease`. Only `$creator` (immutable) and `$owner` are unforgeable, so every read applies these rules (code: `services/*.ts`):

| Read | Accepted only if | Stops |
|---|---|---|
| Run | `run.$owner == run.$creator`; limits use the runner's **computed** tier, never the `tier` attribute | Run hijack after transfer; fake "Trusted" claims |
| Accept | `accept.$creator == run.$creator`, `accept.rider == accept.$creator`, refers to this run; earliest per request wins | Strangers "accepting" for a runner; double accept |
| Delivery | reveal hashes to `request.code_commit`; `delivery.$creator == delivery.rider`; rider is not the requester; if a live Accept exists, rider matches it; earliest wins | Fake deliveries (the salted secret is unknown to anyone but resident and the scanning runner); a requester delivering to themselves; another runner stealing credit |
| Receipt | delivery exists; reveal verifies; `delivery.rider == receipt.rider`; **`request.$creator == receipt.$creator`**; `receipt.$creator != receipt.rider`; receipt, delivery and request were all created **readonly** (`not_readonly` otherwise); the receipt is owned by the profile's wallet (`$owner` query) | Receipts for deliveries the issuer was not party to; self-issued receipts; a mutable receipt the runner (its owner) could re-point, or a mutable request whose commit could be swapped |
| Duplicates | Only the **earliest** valid receipt per request counts; later ones are marked `duplicate` and shown greyed | A resident minting many receipts for one handoff |
| Self-dealing | `receipt.$creator == rider` is invalid (`self_dealing`) | Runner issuing receipts to themselves |
| Complaint | `complaint.$creator == request.$creator`, `complaint.$creator != rider`, **and the rider provably served that request**: a readonly Delivery for it with `$creator == rider == complaint.rider` whose reveal hashes to the commit; one per request | Drive-by complaints: without the delivery check any wallet that posted *any* request could pin complaints on *any* runner and push a Trusted runner down with three cheap writes |
| Attestation | counted as "verified" only if `$creator` is in the **viewer's** trusted-verifier list (`EXPO_PUBLIC_TRUSTED_VERIFIERS`), the attestation is **readonly**, `attestation.$creator != subject`, not expired | Anyone minting "ID-checked"; a mutable attestation whose subject could be patched |
| Shop | passes zod; `zone5 == zone[0..5]` | Malformed junk |

**Reputation** (computed in `services/reputation.ts`, no writes): valid receipts, distinct `$creator` count, last-30-day window by `$createdAt`, complaints separately. Tiers: New (₹200 cap, 1 request/run); Verified = a trusted live attestation (₹500, 2/run); Trusted = Verified and >= 25 valid receipts from >= 15 distinct residents and <= 2 complaints in 30 d (₹1000, 3/run). A trusted `successor` attestation carries the `prev` wallet's receipts over.

**Known limits (stated, not hidden):**
- A determined attacker with N wallets can farm receipts from N fake "residents" by running requests against themselves. Mitigation: the Trusted tier requires a verifier attestation, which cannot be farmed; New-tier caps are small.
- A complaint needs a recorded Delivery as evidence. A no-show (accepted but never delivered) cannot be proven after the run expires, because the Accept dies with the run, so it does not count; the app only offers complaints after a delivery.
- Receipts are transferable by their owner (that is what makes key rotation work), so a runner could hand its receipts to another wallet; the profile counts whatever receipts a wallet owns. Reputation is portable by design, and therefore also sellable.
- `extendReceipt` (core only) renews the receipt, but the Request it is verified against is owned by the resident and expires after 1 y, after which the renewed receipt no longer verifies. Not claimed in the UI.
- In demo mode the app also trusts the verifier wallet created in the same browser, so a judge can try the verifier flow; other viewers do not trust it.
- Receipts are only as honest as the resident who issues them; the system proves *who said it*, not that it is true.
- Handoff secret is a 4-digit code plus a 16-byte random salt; the salt prevents brute-forcing the 10,000 codes from `code_commit`.
- Key loss: the runner can `changeOwnership` every receipt to a new wallet (`transferAllReceipts`), or a verifier issues a `successor` attestation.

## 7. Live updates

One shared `watchEntityEvents` poller per client (interval 2000 ms). Events carry no attributes and no type, and there is no server-side filter, so core resolves each created/patched key with `get` (at most 10/s), drops anything not tagged `bhaiyaplease`, and fans out client-side. **Expiry produces no event**: the app hides runs by `eta`/`$expiresAt` against a ticking clock, and queries exclude expired entities on refetch. Screens also poll.

## 8. Feature → what the user sees

"UI wired" reflects `apps/mobile` at the time of writing (grep of `apps/mobile/{app,components,hooks}`); re-check before relying on it.

| Arkiv feature | Entity / call | What the user sees | UI wired |
|---|---|---|---|
| Expiry | `run` (ETA + 10 min) | Runs on the board count down and vanish by themselves; a runner never has to clean up | yes (Countdown) |
| Typed range query | `eta > u64`, `capacity_left > i32` | "Runs to your building" list, ordered by ETA, full runs hidden | yes |
| Attribute query | `zone5`, `category` | Shops on the runner's route | yes |
| `permissionlessExtension` + `extendEntity` | `shop` | Anyone taps "still open"; the row shows "last confirmed N d ago" / "fades in N d" derived from `$expiresAt` | yes (ShopRow); listing a shop is core-only |
| `predictEntityKeys` + `bytes32` + `key` attrs | `request.code_commit` | Resident gets a QR and 4-digit code; the runner's scan is verified against the on-chain commit | yes |
| Atomic `executeBatch` (create + patch) | `accept` + `run.capacity_left` | Capacity drops exactly when a request is accepted, never out of sync | yes |
| `readonly` | request, delivery, receipt, complaint, attestation | "On-chain proof" panel shows `readonly: true`; nobody can edit a receipt | yes (OnChainProof) |
| `changeOwnership` in the issuing batch | `receipt` | Receipt appears in the runner's wallet/profile; the resident remains the author | yes |
| `$creator` vs `$owner` | receipt | Proof panel shows creator = resident, owner = runner; profile counts "N handoffs from M residents" | yes |
| Client-side reputation from queries | profile | Tier badge, handoff counts, tags, no stored score | yes |
| Complaints owned by the resident | `complaint` | Complaint shown on the runner's profile; runner cannot remove it | yes |
| Attestation + trusted list | `attestation` | "ID-checked by <verifier>" and tier lift only for verifiers the viewer trusts; verifier can revoke | yes (verifier pages) |
| `watchEntityEvents` | all | Board and request status update without refresh | yes (provider) |
| `deleteEntity` | run, attestation | Runner cancels a run; verifier revokes | yes |
| `extendEntity` by owner | receipt | Runner renews receipts for another year | core only |
| `atBlock` historical query | `getProfileAt` | "Tier when you accepted" dispute view | core only (cut-able) |
| Bulk `ownershipChanges` | `transferAllReceipts` | Move all receipts to a new wallet | core only (cut-able) |
| `successor` attestation | attestation | Old wallet's receipts carry over | core only (cut-able) |

Features marked "core only" are implemented and tested in `packages/core` but not claimed as user-visible.

## 9. Deliberately off Arkiv

Names, phone numbers, flat/door numbers, ID documents or numbers, exact GPS (only a geohash-6 cell leaves the device), chat, payments (UPI at the gate, off-chain), any delivery-platform data, the handoff code and salt **until the runner reveals them in the Delivery**, private keys, access keys, reputation scores (always recomputed), zone labels, the trusted-verifier list (viewer configuration), request secrets (kept in device storage). All demo content is synthetic: fictional shop names, persona ids, generic item lines.

## 10. Write-side assumptions: chain results (16 Oct 2026, SDK 0.8.1, Tiramisu)

All were open before the spike; all are now verified on chain. Reproduce with `pnpm spike` (details and exact error texts in `friction.md` section B).

| # | Assumption | Result | What the code does now |
|---|---|---|---|
| 1 | `changeOwnership` of an entity created earlier in the **same** `executeBatch` is accepted | **PASS**: readonly create + extend + transfer in one batch; owner = recipient, creator = issuer, readonly = true | Receipt batch is the default path. The `two_tx` fallback stays as defence in depth; it never triggered during seeding |
| 2 | `extendEntity` works on a **readonly** entity | **PASS** (owner extend, and new owner after transfer) | Receipt and complaint batches extend the readonly Request |
| 3 | A non-owner can extend a `permissionlessExtension` entity; a plain entity rejects it | **PASS** both ways (rejection text: `entity … is owned by 0x…, not 0x…`) | "Still open" works from any wallet; confirmed from a fresh browser burner |
| 4 | `patchEntity` partial `set` leaves expiry and other attributes untouched | **PASS** (`$expiresAt` unchanged) | Accept batch patches only `capacity_left` |
| 5 | `predictEntityKeys` key equals the created key when `salt` is passed | **PASS** (single create and in batches; never mismatched over the whole seed) | Mismatch handling kept |
| 6 | Access key accepted; browsers can reach the RPC | **PASS**: URL path suffix and `X-API-KEY` header both work; a wrong key gives HTTP 401 `INVALID_KEY`; CORS preflight allows `Content-Type, Authorization, X-Api-Key` from `*`. Anonymous limit observed: 600 requests / 60 s | Core sends the key as the `X-API-KEY` header (not in the URL, so it cannot leak through error messages). In a static web build the key is public: restrict its Origins on hub.arkiv.network |
| 7 | Block-to-time via `getBlockTiming()` | **PASS**: `currentBlockTime` unix seconds, `blockDuration` 2 | Unchanged |
| 8 | Read-after-write latency | Entity visible to `select` ~230 ms after the receipt | Seed still waits 2.5 s per write (safety margin) |
| 9 | Explorer URL path | Not verified | Link only shown when `EXPO_PUBLIC_EXPLORER_URL` is set |
| 10 | Injected (MetaMask) signer | Not exercised | Optional path; burner keys are the default |
| 11 | `!=` / `ne()` | Rejected by the node: `QueryError` kind `type`, code -32002 | Never used |

## 11. `ping`: live location that deletes itself

Added for the map-first tracking screens. Code: codec `packages/core/src/codec/ping.ts`, service `packages/core/src/services/locations.ts`, geometry `packages/core/src/geo.ts`, rules `PING_RULES` in `types.ts`.

| Entity | Flags | Expiry | Created by / `$owner` | Why |
|---|---|---|---|---|
| `ping` | RO | `min(120 s, run.$expiresAt - now)`: a ping never outlives its run | runner / runner | A coarse "I am around here" for one live run. Nobody edits it (RO), nobody deletes it: the chain does, 2 minutes later. |

Attributes (`ENTITY_ATTRS.ping`):

| Attribute | Type | Purpose |
|---|---|---|
| `run` | key | The run this position belongs to |
| `rider` | addr | Must equal `$creator` (and the run's `$creator`) |
| `gh7` | str (geohash-7, ~153 m x 153 m) | The position. **Coarsened on the device** (`coarsenToGh7`); exact lat/lng is never written |
| `zone5` | str (geohash-5) | `gh7[0..5]`; a mismatch drops the ping. Lets a viewer query "pings around my area" |
| `at` | u64 | Writer-declared unix time (ordering hint only; freshness uses `$createdAt`) |
| `seq` | i32 (optional) | Per-run sequence number |

Payload: `{ "heading"?: 0..360, "speedKmh"?: 0..200 }`, both optional.

Writes and cadence: the runner app publishes one ping every 20 s (`PING_RULES.intervalSeconds`) **only while its run is live and the runner has sharing switched on**; it stops when the run ends or expires (`publishPing` throws `EXPIRED`, `NOT_OWNER` for anyone but the run's creator). The app reads GPS through `expo-location` (foreground permission; browser Geolocation on web), or in demo mode a synthetic route ("Simulate route").

Queries:

| Used by | Query |
|---|---|
| `getLatestPings(zone5)` | `… type = str('ping') AND zone5 = str('tdr3c')` |
| `getLatestPings(runKeys)` | `… type = str('ping') AND (run = key(0x…) OR run = key(0x…))` |
| `getRunTrail(runKey)` | `… type = str('ping') AND run = key(0x…) AND $creator = addr(<runner>)` |

Trust: a ping counts only if `ping.$creator == ping.rider == run.$creator` and the run is a live, trusted run (`$owner == $creator`). Forged pings (anyone else naming the run, or the runner naming someone else as rider) are ignored; the latest valid ping per run wins (`$createdAt`, then `seq`, then `at`). Viewers fade a marker whose latest ping is older than 60 s (`staleAfterSeconds`) and drop it at expiry, because an expired ping no longer exists (there is no expiry event; the app ticks a clock).

What the user sees: residents see each runner heading to their gate as a pulsing, tier-coloured marker with "N min away · Ns ago" and a short breadcrumb trail (the ≤ 6 still-living pings); runners see "Sharing live location · deletes itself in 2 min" with an off switch. Demo data: the mock and `scripts/seed/heartbeat.ts` (≤ 6 pings per announced run per invocation) move runners along a deterministic synthetic route in the demo zones (Whitefield, Bengaluru); no real person's location is ever written.

Privacy limits (stated): a 153 m cell still reveals roughly where a runner is while sharing; that is the point of the feature, it is opt-in per run, and it disappears after 2 minutes. Pings are public like every Arkiv entity.
