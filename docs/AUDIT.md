# Pre-submission audit (16 Oct 2026)

Scope: `packages/core`, `scripts/{seed,spike}`, `apps/mobile/lib/core.ts`, `arkiv/*.md`, `README.md`, checked against Arkiv's own agent skills (arkiv 0.2.1: security-trust, write-safety, query, data-modeling, entity-expiration, entity-lifecycle, app-integration, troubleshooting) and the hackathon rules (disqualifiers, "claimed but absent counts against"). Everything marked **verified** was run, not reasoned about: `pnpm spike` (29/29 PASS), `pnpm seed` on Tiramisu, the real-core web build driven in headless Chromium, `pnpm test`, `pnpm -r typecheck`, `pnpm --filter mobile build:web`.

Not inspected: the live-location work being added in parallel (`services/locations.ts`, `codec/ping.ts`, `geo.ts`, map screens), except for the privacy question in finding 2. The Android build was not exercised.

Severity: **High** = a judge or attacker can break a stated guarantee or a disqualifier applies; **Medium** = wrong under realistic conditions; **Low** = hardening or documentation.

## Findings, ranked

### 1. High: anyone could push a Trusted runner down with three cheap complaints (fixed)
- **Where**: `packages/core/src/services/complaints.ts` (before: the complaint filter only checked `complaint.$creator == request.$creator`).
- **Evidence**: the request a complaint points to was never linked to the accused rider. Any wallet that had posted *any* request (on any run, accepted or not) could write a complaint naming *any* rider. `TRUSTED_RULE.maxComplaints30d = 2`, so three requests plus three complaints (≈ 6 creates, < 0.001 GLM) demoted any Trusted runner. `schema.md` claimed a narrower limit ("a request that names the rider's run") that the code did not even check.
- **Fix**: `riderDelivered()` (`complaints.ts:20`). A complaint counts only if the rider provably served that request: a readonly Delivery for it with `$creator == rider attr == complaint.rider` whose reveal hashes to the request commit (query scoped with `$creator = rider`, per arkiv-query). Applied by every viewer (`complaints.ts:50`) and by `fileComplaint` before spending gas (`complaints.ts:77`). Deliveries live 1 y, longer than complaints (180 d), so the evidence never expires first. The app only offers complaints after a delivery (`apps/mobile/app/r/request/[key]/rate.tsx`), so no UI flow changes.
- **Tests**: `test/reputation.test.ts` "a resident cannot complain about a rider who never delivered their request" (service refuses; three raw forged complaints are ignored; `complaints30d` stays 0). Existing test updated (it filed a complaint with no delivery).
- **Residual limit (documented in schema.md)**: an accepted-but-never-delivered no-show cannot be proven after the run expires.

### 2. High (decision for the human / maps engineer): live pings put a real device position on chain
- **Where**: `apps/mobile/components/PingBeacon.tsx:24,58` (parallel work, not edited) calls `Location.getCurrentPositionAsync` and publishes `coarsenToGh7(lat, lng)` every `PING_RULES.intervalSeconds` (20 s).
- **Evidence**: geohash-7 is a ~150 m cell. A sequence of them every 20 s from a judge's or runner's phone is a movement trace of a real person. Expiry (2 min) removes it from queries but **not** from transaction calldata (arkiv-security-trust: "Expiration removes live query state; it cannot retract copies or transaction calldata"). The rules list "real personal data on Arkiv (plaintext OR hashed)" as a disqualifier, and the brief puts "exact GPS" off-chain.
- **Recommendation (not applied, outside my files)**: in the hosted demo, publish only the synthetic route (`simulatedPosition`) by default; make real GPS an explicit opt-in with a warning, or coarsen real positions to geohash-6 (the precision already used for zones). State the choice in `schema.md` §9.

### 3. Medium: receipts, deliveries, requests and attestations were trusted without checking `readonly` (fixed)
- **Where**: `services/reputation.ts:37,59`, `services/attestations.ts:25,58`, `types.ts:206` (additive union member `'not_readonly'`).
- **Evidence**: arkiv-security-trust: "Default trusted publications to readonly creation by an allowlisted creator… Owner is not payload provenance." A hand-written receipt without the flag, transferred to the runner, can be patched by the runner (its owner) to point at a different delivery; a mutable request lets the resident swap `code_commit` after the reveal; a mutable attestation from a trusted verifier can be re-pointed if ever transferred. The services always write these readonly, but readers must not assume it.
- **Fix**: a receipt is valid only if receipt, delivery and request are all readonly; an attestation counts as trusted only if readonly. Tests: "a receipt created without the readonly flag is not counted", "a mutable attestation from a trusted verifier does not verify".

### 4. Medium: access key in the RPC URL leaked into error messages (fixed)
- **Where**: `arkiv/adapter.ts:62` (`rpcTransport`), `scripts/seed/common.ts:118`.
- **Evidence**: viem's `HttpRequestError` message contains the request URL; `toBhaiyaError` copies the message into `BhaiyaPleaseError.message`, which the app shows in toasts and scripts print. Probed on Tiramisu: `X-API-KEY` header → 200; wrong key → 401 `INVALID_KEY`; CORS preflight allows `X-Api-Key` from `*` (arkiv-app-integration / troubleshooting recommend headers).
- **Fix**: core and seed scripts send the key as `X-API-KEY`. Verified in Chromium: full real-core flow, 0 RPC responses ≥ 400. `rpcUrlWithKey` kept (exported, tested).

### 5. Medium: web build ships the access key (documented; mitigation required before deploy)
- **Where**: `apps/mobile/lib/core.ts:24` (`EXPO_PUBLIC_ARKIV_ACCESS_KEY`). Confirmed: the key string is present in the exported JS bundle.
- **Decision**: unavoidable for a no-backend static app. **Action for the human**: create a separate hub.arkiv.network key for the web build and restrict its allowed Origins to the deploy domain; never reuse the seed/heartbeat key. Without a key the app still works (anonymous limit observed: 600 req/min). Written into README and `.env.example`.

### 6. Medium: paginated queries were not pinned to a block, and cursor errors were retried as rate limits (fixed)
- **Where**: `arkiv/adapter.ts:196-236`, `arkiv/errors.ts:85`.
- **Evidence**: arkiv-query and the skills' known-issues: an unpinned cursor can be rejected (-32005) once the head moves; partial walks must not be merged. `classify()` mapped code -32005 to `RATE_LIMITED` (viem's `LimitExceededRpcError` shares the code), so a dead cursor was retried three times with backoff.
- **Fix**: single-page reads unchanged (no extra RPC); multi-page walks restart pinned to the first page's `blockNumber`, restart once on a cursor error, and a hit of the 2000-row cap is reported through `onSdkError` instead of silently truncating. `QueryError` is classified by `kind` before any code check.

### 7. Medium: judges need gas; no workable path except the faucet (fixed with operator tooling; decision noted)
- **Where**: `apps/mobile/components/WalletGate.tsx` (Unfunded screen → faucet link). The faucet page is client-rendered; we could not verify its sign-in requirements headlessly.
- **Fix**: `scripts/seed/fund.ts` / `pnpm fund <address...>` tops any address up from the seed wallet (no key in the bundle). Used to fund the test burners for the real-chain browser run below. README tells judges they can send their address.
- **Decision for the human**: if you want judges to act with zero waiting, the alternative is pre-funded demo personas whose keys ship in the bundle. I did **not** do this: those keys would be public, drainable and nonce-colliding across judges. Recommendation: keep `pnpm fund` plus a contact line in the submission, and show the full flow in the video.

### 8. Low: an interrupted seed could not be resumed without duplicates (fixed)
- **Where**: `scripts/seed/seed.ts` (`--resume`).
- **Evidence**: the first seed run was killed by the tooling after 8 trusted-runner handoffs and 5 shops. `--force` would have duplicated the five shops on the board and the early handoffs.
- **Fix**: `--resume` reads chain state (shops by lister + name, issued attestations, per-runner receipts + complaints) and skips that prefix of the plan; verified on the real chain (see bring-up below).

### 9. Low: mock accepted uppercase attribute names that Tiramisu rejects (fixed)
- **Where**: `mock/chain.ts:54`. arkiv skill: the node rejects uppercase (`Ident32InvalidByte`) although SDK 0.8.1 accepts it. All schema names are lowercase; the mock now matches the node so a future camelCase name fails in tests, not on chain.

### 10. Low: documented, not fixed
- `extendReceipt` (core only, not in UI, `receipts.ts:134`): the runner can renew a receipt, but the resident-owned Request it is verified against expires after 1 y, after which the renewed receipt stops verifying. Fix would need `permissionlessExtension` on requests (schema change); documented as a known limit instead.
- Receipts are transferable by their owner (that is what `transferAllReceipts` / key rotation needs), so reputation can be handed to another wallet. Stated in schema.md known limits.
- Demo mode trusts the verifier wallet created in the same browser (`apps/mobile/lib/core.ts:18`) so judges can try attestations. Per-viewer trust, other viewers are unaffected; stated in schema.md.
- `confirmShopOpen` does not pre-check that the extension moves expiry later; two taps in one block get a node rejection at estimation (no gas spent). Kept: the seed relies on confirming right after listing.
- Burner keys live in `localStorage` in plaintext; acceptable for a testnet demo with an export/backup nudge.
- Two tabs on the same role share one wallet; the per-process write queue cannot coordinate across tabs (arkiv-write-safety). The nonce-too-low retry covers the common case.
- Watcher load: Tiramisu carried 2.3 events/block (measured over 300 blocks), well under the watcher's 10 resolutions/s.

### Compliance checklist (Arkiv skills)
| Practice | Status |
|---|---|
| Trust via `$creator`/`$owner`, never `project`/attributes | Yes; strengthened by findings 1 and 3 |
| Payload/attribute validation (zod, drop malformed) | Yes, every read (`codec/schemas.ts`) |
| Lowercase snake_case attribute names | Yes; mock now enforces it |
| Typed predicates match write constructors | Yes, single attribute table (`codec/attrs.ts`) |
| Write safety: serialized queue, nonce manager, no retry after broadcast, no explicit gas | Yes (`adapter.ts`, `errors.ts`); predict + create share the write slot |
| Expiry right-sized per entity | Yes: run ETA+10 min, request run+1 h, accept = run, delivery/receipt 1 y, complaint/attestation 180 d, shop 30 d, ping 2 min; no `permanent()` |
| Pinned pagination | Fixed (finding 6) |
| Key custody | Seed/verifier keys only in `.env`/CI secrets, never printed (redactor), never on chain; access key header-only; web key public by design (finding 5) |
| `project` attribute on every entity | Yes |
| Batching | Accept (create + patch), receipt (create + extend + transfer), complaint (create + extend), bulk transfers chunked at 20 |

### Claimed vs exercised
Every row marked "yes" in `schema.md` §8 maps to a UI path, and the following ran on chain from the browser: watchEntityEvents refresh, typed range query board, shops by `zone5`, permissionless "still open", `predictEntityKeys` + commit, accept batch, delivery reveal, receipt batch with same-batch `changeOwnership`, on-chain proof panel, client-side profile, verifier attestation. Not re-run from the browser: run cancel (`deleteEntity`), attestation revoke, complaint (complaint path exercised by the seed and tests). "Core only" rows are labelled as such.

## Real-chain bring-up

- `pnpm spike`: 29/29 PASS (twice). Details in `arkiv/friction.md` section B.
- `SEED_FUND_GLM=0.05 pnpm seed`: funded 22 persona wallets from the seed wallet, then replayed the fixture plan through the real core. The first run was interrupted after 8 handoffs (tool timeout, see finding 8); `pnpm seed -- --resume` skipped the 8 handoffs and 5 shops already on chain and completed in 1,868 s with no errors, no key-prediction mismatch, and the atomic receipt batch (create + extend + same-batch `changeOwnership`) on every receipt. Gas for the whole seed ≈ 0.03 GLM.
- Profiles recomputed from chain by an independent read-only core instance (no signer, trusting only the verifier `0x166efae608457303daf2af830d281922c5d6ee20`):

| Runner | Address | Valid receipts | Distinct residents | Invalid | Complaints | Verified | Tier | Expected (fixture plan) |
|---|---|---|---|---|---|---|---|---|
| runner-trusted | `0x21f758e41831e8fed3486a8fa3d894a12f69cc1a` | 30 | 18 | 0 | 0 | yes | Trusted | 30 / 18 / Trusted |
| runner-verified | `0x7b9c76f7d847dd5dd244507ce883fa51b8f2e33a` | 6 | 5 | 0 | 1 | yes | Verified | 6 / 5 / 1 complaint / Verified |
| runner-new | `0x280e00fd992aa5eec367846df3501858dcf955da` | 2 | 2 | 0 | 0 | no | New | 2 / 2 / New |

  The verified runner's complaint counts under the new delivery-evidence rule (finding 1), as intended.
- `pnpm heartbeat`: first run announced nothing: it counted the seed's just-finished history runs (full, ETA passed but not yet expired) as "live" and skipped every runner. Fixed in `scripts/seed/heartbeat.ts` (count only runs with `eta > now` and `capacity_left > 0`); re-run announced 3 runs and confirmed a shop "still open" from a non-owner wallet (permissionless extension). An anonymous viewer then saw the live runs and 5 shops.
- Persona addresses are in the README wallet table; the verifier address is the default `EXPO_PUBLIC_TRUSTED_VERIFIERS` in `.env.example`.

## Real-core web app test (headless Chromium, 16 Oct)

Build: `EXPO_PUBLIC_CORE=real EXPO_PUBLIC_TRUSTED_VERIFIERS=0x166efae608457303daf2af830d281922c5d6ee20 EXPO_PUBLIC_ARKIV_ACCESS_KEY=… expo export --platform web`, served statically. Three fresh burners (runner, resident, verifier) were created by the app in the browser and topped up to 0.01 GLM each with `pnpm fund`. Steps, each a real Tiramisu transaction from the browser:

| Step | Result |
|---|---|
| Board loads seeded runs and shops from chain | OK |
| Verifier attests the runner (readonly create) | OK, runner shows "Vouched by … · until Apr 2027" |
| Runner announces a run (tier-clamped capacity) | OK |
| Resident posts a request (predictEntityKeys + commit) | OK |
| Stranger taps "Still open" on a shop it does not own (permissionless extend) | OK ("Confirmed ✓"), separate run with its own burner |
| Runner accepts (create + patch batch) | OK |
| Resident shows the handoff code; runner pastes it; delivery reveal written | OK |
| Resident issues the receipt (create + extend + changeOwnership in one batch); on-chain proof panel opens | OK |
| Runner profile recomputed from chain | OK: "VERIFIED · Cap ₹500 · 2 requests/run · 1 handoff from 1 resident · receipt issued by the resident, owned by you" |

RPC responses with HTTP status ≥ 400 during the run: 0. Not driven: camera scanning (paste fallback used), cancel run, revoke, complaint from the UI.
