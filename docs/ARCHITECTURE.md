# Bhaiya Please — Architecture & Interface Contract

Source of truth for product/schema: `docs/BRIEF.md`. Contract: `packages/core/src/{types,interface}.ts`.
SDK facts reconciled with `docs/SDK_NOTES.md` (0.8.1, source-verified, not yet chain-verified). Items still marked
**[verify on chain]** are the Thu-night spike's job. All SDK shapes live
only in `packages/core/src/arkiv/adapter.ts`, so a wrong guess costs one file, not the app.

## 1. Repo layout

```
bhaiya-please/
├─ LICENSE (MIT, first commit)        README.md        .env.example       pnpm-workspace.yaml
├─ package.json            # scripts: dev, build, seed, typecheck, test
├─ packages/core/          # Person A — domain layer, no React
│  └─ src/
│     ├─ types.ts          # FROZEN contract (domain types, errors, config)
│     ├─ interface.ts      # FROZEN contract (Bhaiya Please interface, factories, helpers)
│     ├─ codec/            # attrs.ts (attr names + encode/decode), schemas.ts (zod), handoff.ts (commit/QR), entities.ts
│     ├─ arkiv/adapter.ts  # THE ONLY file importing @arkiv-network/sdk; retry/backoff; write queue
│     ├─ arkiv/watcher.ts  # shared poller over watchEntityEvents → ChangeEvent
│     ├─ services/         # runs.ts requests.ts handoff.ts receipts.ts complaints.ts attestations.ts shops.ts reputation.ts
│     ├─ zones.ts wallet.ts  # ngeohash wrappers, DEMO_ZONES; burner key gen + QR encode
│     ├─ mock/             # index.ts (createMockBhaiyaPlease), store.ts, fixtures.ts
│     └─ index.ts          # createBhaiyaPlease(config) + re-exports
├─ apps/web/               # Person B — Vite + React + TS + Tailwind PWA
│  └─ src/{main.tsx, core.ts (picks mock|real by VITE_CORE), live.ts, wallet/, screens/, components/}
├─ scripts/seed/           # Person A — seed.ts (one-shot), heartbeat.ts (live demo runs), fund.ts
├─ arkiv/schema.md         # judges' gate
├─ arkiv/friction.md       # judges' gate, logged live
└─ docs/ BRIEF.md ARCHITECTURE.md PLAN.md SDK_NOTES.md
```

**Tooling.** pnpm workspaces (fast, strict, Vercel-native). `packages/core` ships **TS source** (`"main": "src/index.ts"`,
`"exports"` to src) — no build step; Vite and `tsx` consume it directly. Vitest for core (codec, reputation, mock parity).
`tsx` runs the seed. One root `tsconfig.base.json` (strict, `moduleResolution: bundler`). Vercel: root dir `apps/web`,
install `pnpm install --frozen-lockfile` at repo root. Runtime deps in core: `@arkiv-network/sdk`, `viem` (via SDK),
`zod`, `ngeohash`. Web: `react`, `@tanstack/react-query`, `react-router-dom`, `qrcode` (render), `qr-scanner` (camera),
`vite-plugin-pwa`, Tailwind.

## 2. Layering inside core

```
types.ts ─▶ codec ─▶ arkiv/adapter ─▶ services ─▶ createBhaiyaPlease(config): Bhaiya Please
                 ╰────────────── mock/store ─▶ createMockBhaiyaPlease(config): MockBhaiyaPlease (same interface)
```
- **types** — zero deps. **codec** — attribute names/encodings (one table, mirrors schema.md), entity ⇄ domain object,
  **zod validation of every entity read** (anyone can write `project=bhaiyaplease`; malformed → dropped + counted in a debug log),
  `computeCodeCommit`, QR encode/decode. Pure, unit-tested, shared by real + mock so hashes match.
- **adapter** — exposes ~10 primitives the services need, in our own types:
  `query(q: QueryAst, opts?: {atBlock?})`, `get(key)`, `create(spec)`, `patch(key, attrs)`, `extend(key, seconds)`,
  `transfer(key, to)`, `remove(key)`, `batch({creates, patches, extensions, transfers})`, `predictKeys(n)`,
  `watch(handlers)`, `balance(addr)`, `blockNumber()`, `timeOfBlock(n)`. Converts SDK errors → `BhaiyaPleaseError`.
  Owns retries and the **serialized write queue**. Query strings are built here from a tiny AST so escaping lives in one place.
- **services** — domain logic + trust filters + tier checks. Never import the SDK.
- **mock** — in-memory `Map<key, StoredEntity>` with `$creator/$owner/$createdAt/$expiresAt`, enforces owner-only patch,
  readonly, permissionlessExtension, batch atomicity, capacity; queries filter `expiresAt > now()`; emits `ChangeEvent`s
  synchronously after a `latencyMs` delay. Mock implements **services on top of a fake adapter** (same services code!)
  — that is how "identical interface" is guaranteed cheaply: only the adapter is faked. `store:'localStorage'` +
  `storage` events → two browser tabs act as two phones. Fixtures = same data set as `scripts/seed` (shared `fixtures.ts`).

## 3. Data flows (all attrs also carry `project=str('bhaiyaplease')`, `type=str(<entity>)`)

**Announce run** — runner app → `announceRun({destZone, fromZone, etaMinutes, capacity})` → services compute own tier
(`getProfile(self)`), clamp capacity to `requestsPerRun` → `create(run attrs, claimedTier, expiry = ExpirationTime.fromSeconds(even(etaMinutes·60 + 600)))` —
durations must be multiples of 2 s (SDK_NOTES).
Resident screens see it via watcher → invalidate `['runs', destZone]`.

**Post request** — resident picks run + shop → `postRequest`:
1. Read run (must be live, `capacityLeft>0`); compute runner's tier from `getProfile(run.creator)`; reject `maxPrice > cap` (`TIER_LIMIT`).
2. `code` = 4 random digits, `salt` = 16 random bytes (`crypto.getRandomValues`).
3. `[{key: requestKey, salt: keySalt}] = pub.predictEntityKeys({owner, count: 1})` (SDK_NOTES: returns `{key, salt}[]`;
   the create **must** pass `salt: keySalt` or the key silently differs). Inside the write queue so no other create from
   this wallet lands first (prediction is nonce-bound).
4. `code_commit = keccak256(concat([utf8Bytes(code), salt, requestKey]))` — 4 + 16 + 32 bytes. Single implementation in `codec/handoff.ts`.
5. `create(Request, readonly, expiry = run.expiresAt − now + 3600 s grace)`; assert returned key == predicted, else
   `KEY_PREDICTION_MISMATCH` (delete + retry once). Return `{key, txHash, secret}`; **app persists secret** in
   localStorage `bhaiyaplease.secrets[requestKey]`. Secret never touches Arkiv until the runner reveals it.

**Accept** — runner → `acceptRequest(requestKey)`: fresh `get(run)`; if `capacityLeft == 0` → `CAPACITY_EXHAUSTED`.
`batch({ creates:[Accept{request, run, rider:self}, expiry = run.expiresAt], patches:[{run, capacity_left: n−1}] })`.
**Race:** only the runner can patch their run, so contention is self-contention (two taps / two tabs). The write queue
serializes it; the second accept re-reads capacity inside the queue and fails cleanly. Residents may post more requests
than capacity — that's fine; unaccepted requests just expire. Patch is partial (`set: {capacity_left: i32(n-1)}`) per SDK_NOTES; **[verify on chain]** that patch leaves expiry unchanged.

**Delivery** — at the gate resident shows QR `bhaiyaplease:h1:<requestKey>:<code>:<saltHex>` (+ 4 digits in large text).
Runner scans (`qr-scanner`) → `decodeHandoffQR` → `recordDelivery({secret})`: get Request, check
`computeCodeCommit(...) == request.codeCommit` locally (`INVALID_REVEAL` before spending gas) → `create(Delivery{request,
rider:self, resident: request.creator, zone: request.destZone}, payload {code, salt}, readonly, 1 y)`.
Resident screen gets `created` event (hint `request`) → shows "Delivered — issue receipt?".

**Receipt** — resident → `issueReceipt({deliveryKey, tags})`: `verifyDelivery` (reveal matches, delivery.request.creator ==
self, delivery.$creator == delivery.rider) → `[{key: receiptKey, salt}] = predictEntityKeys(1)` →
`executeBatch({ creates:[{salt, Receipt{rider, delivery, zone, at}, readonly, fromYears(1)}], extensions:[{request, fromYears(1)}],
ownershipChanges:[{entityKey: receiptKey, newOwner: rider}] })`; assert `createdEntities[0] == receiptKey`. Batch order
creates→…→extensions→ownershipChanges makes this legal (SDK_NOTES: ~85% confident; spike verifies). Extension of a
**readonly** Request is allowed per brief **[verify on chain, SDK_NOTES open Q4]**; extend *sets* now+duration and reverts
if not later, so services include an extension only when it moves expiry later (same rule in complaint).
The extension keeps the Request (and its commit) alive as long as the receipt, so verification works for a year
without `atBlock`. **Fallback** (`path:'two_tx'`): if the batch is rejected because the transfer targets an entity
created in the same batch, do `batch({creates, extensions})` then `transfer(receiptKey, rider)`; on transfer failure,
retry 3× and surface "receipt issued, handing over…" with a retry button (receipt still verifiable; `$creator` unchanged).

**Complaint** — resident → `fileComplaint({requestKey, rider, reason})` →
`batch({ creates:[Complaint readonly 180 d], extensions:[{request, +180 d}] })`. Resident keeps ownership.

**Attestation** — verifier page scans runner's `bhaiyaplease:a1:<address>` QR → `issueAttestation({subject, level})`
→ `create(readonly, 180 d)`. Revoke = `remove(key)` by verifier (readonly still allows delete). Successor (CUT-ABLE):
`level:'successor', prev:oldAddr`; reputation merges `prev`'s receipts if attested by a trusted verifier.

**Shops** — `listShop` → `create(zone, zone5, category, name_tag, permissionlessExtension, 30 d)`. Any wallet:
`confirmShopOpen` → `extend(key, fromDays(30))`. SDK_NOTES: extend **sets** expiry to now+30 d (not additive) and reverts
`ExpiryNotExtended` if not later — so a tap always resets to "30 days from the last confirmation"; the *extender* pays gas. UI shows
"open · confirmed N days ago / fades in X d" from `expiresAt`.

**Profile / reputation** (`services/reputation.ts`, pure function over fetched data, no chain writes):
1. `receipts = select().where(project, type=receipt).ownedBy(R)` (`$owner`/`$creator`/`$key`/`$expiresAt` are queryable;
   `$createdAt` is **not** — SDK_NOTES).
2. Batch-load each receipt's Delivery and that Delivery's Request (dedupe by key; `get` in parallel, concurrency 6).
3. Valid iff: delivery exists ∧ reveal hashes to request.codeCommit ∧ **request.$creator == receipt.$creator** ∧
   delivery.$creator == delivery.rider == receipt.rider ∧ receipt.$creator ≠ receipt.rider.
4. `receiptsTotal` = valid count; `distinctResidents` = |{receipt.$creator}|; 30-day window by **`$createdAt`** (not the
   self-declared `at`), filtered client-side; it is a **block number** → adapter converts with
   `now − (head − block)·2 s` (or `getBlockTiming()`). Same conversion for every `expiresAt` → `EntityMeta` unix seconds.
5. Attestations: `query(type=attestation AND subject=addr(R))`; `trusted` iff `$creator ∈ config.trustedVerifiers`.
6. Complaints: `query(type=complaint AND rider=addr(R))`; count only if complaint.$creator == request.$creator.
7. Tier: Trusted if verified ∧ receipts ≥ 25 ∧ distinct ≥ 15 ∧ complaints30d < 3; else Verified if verified; else New.
UI copy: "212 handoffs from 140 residents · 31 in last 30 days · 1 complaint · ID-checked by Whitefield Union".

## 4. Trust model (every read assumes hostile writers)

Anyone can create any entity with `project=bhaiyaplease`. Only `$creator` (immutable) and `$owner` are unforgeable.
| Read | Accept only if | Why |
|---|---|---|
| Run | — (anyone may run) ; `claimedTier` ignored, tier recomputed from profile | Runner self-declares `tier` |
| Request on run | `request.run == run.key`, live | Anyone can attach; capacity gates acceptance |
| Accept | `accept.$creator == run.$creator` and `accept.rider == accept.$creator` | Otherwise anyone could "accept" for a runner |
| Delivery | `delivery.$creator == delivery.rider`; matching Accept by that rider (while live) ; reveal hashes | Fake deliveries without the secret are impossible (salt) |
| Receipt | Profile rule step 3 in §3 | Prevents receipts for deliveries you weren't party to; self-receipts |
| Complaint | `complaint.$creator == request.$creator` of the referenced request | Stops drive-by complaints from non-customers |
| Attestation | `$creator ∈ trustedVerifiers` (viewer's list) | Anyone can mint attestations |
| Shop | — (community data); hide if payload/attrs fail zod | Low stakes, expiry cleans up |
Known limit (say it in schema.md): a determined attacker with N wallets can farm receipts from N "residents" by
running fake requests against themselves; Trusted tier requires a verifier attestation, which can't be farmed.

## 5. Live updates

- `watchEntityEvents` is polling and **unfiltered** (all of Tiramisu) Events carry key + owner (+flags on create), **no attributes, no
  type** (SDK_NOTES) → `get` is needed to classify a create. Core runs **one** watcher per `BhaiyaPlease` instance (`arkiv/watcher.ts`); `subscribe(filter, cb)`
  registers listeners. For `created/patched` events the watcher resolves the entity (`get`, cached, max 10/s) only when
  we can't decide cheaply, drops anything without `project=bhaiyaplease`, decodes `type` + hints, then fans out.
- Web: `apps/web/src/live.ts` makes one `subscribe({})` at app start and maps events → TanStack Query invalidations:
  run→`['runs', destZone]`,`['run', key]`; request→`['requests', run]`; accept/delivery→`['request', request]`;
  receipt/attestation/complaint→`['profile', rider|subject]`. Debounce 300 ms.
- Belt and braces: live screens also set `refetchInterval: 10_000`. If the watcher proves unreliable, polling alone
  still demos fine (and we then stop claiming watchEntityEvents — see PLAN cut list).
- **Expiry has no event.** UI hides by `expiresAt`/`eta` locally with a 1 s ticking clock hook (`useNow()`); a run card
  shows a countdown and fades out at expiry — that *is* the visible expiry feature.

## 6. Wallet & keys

- Burner: `generatePrivateKey()` on first load → `localStorage['bhaiyaplease.key']`. Export = QR + copy of
  `bhaiyaplease:k1:<hex>`; import = scan/paste. `?persona=2` uses `bhaiyaplease.key.2` so one judge can be runner and
  resident in two tabs. MetaMask (`signer.kind='injected'`) optional; cut if it costs >1 h.
- Nonces: single-tab assumption. Core's write queue (promise chain) serializes all writes per wallet; viem
  `nonceManager` on the account (`createWalletClient({account: privateKeyToAccount(k, {nonceManager})})` — the SDK takes a
  plain viem account). The wallet client has **no read actions** → adapter holds a public + a wallet client. On "nonce too low" → refetch
  nonce, retry once.
- **Gas for judges' fresh burners** (they can browse with 0 GLM; any write needs gas):
  1. **Default: "Fund me" sheet.** On `INSUFFICIENT_FUNDS` or balance 0: show address + QR + copy button + link to
     `hub.arkiv.network/faucet`, poll `getBalance` every 3 s, auto-dismiss when funded. Zero secrets, honest, but
     depends on faucet UX (login/captcha?) — **Person A checks Thu night**.
  2. **Fallback: Demo personas.** Pre-funded testnet wallets (Runner Ravi, Resident Priya, Verifier) selectable on
     the welcome screen when `VITE_DEMO_PERSONAS=1`. Keys come from a **Vercel env var at build time**, never in git.
     Tradeoff, stated plainly: anything in a static bundle is public, so these are *intentionally public testnet keys*
     with tiny balances; anyone can drain or misuse them; concurrent judges on one persona collide on nonces (mitigate:
     pool of 3 per role, picked randomly; top up via `scripts/seed/fund.ts`). Check the rules allow it; disclose in README.
  3. Rejected: serverless "drip" function holding a sponsor key — it's a backend and undercuts "no operator".
- Never on Arkiv: private keys, secrets, the access key. `.env*` gitignored; `.env.example` committed.

## 7. Geohash zones

- `ngeohash` (tiny, boring). Precision **6** = building/destination zone (`dest_zone`, `from_zone`, `shop.zone`);
  precision **5** = route/catchment (`shop.zone5 = zone6.slice(0,5)`; "shops on route" = `zone5 = from_zone[0..5]`).
- Selection: "Use my location" → `navigator.geolocation` → `zoneFromLatLng` on device; only the geohash is kept.
  **Demo mode / judges outside India**: pick from `DEMO_ZONES` (two seeded Bengaluru zones, e.g. Whitefield `tdr1wx`
  and its neighbour) — shown by default as chips; GPS is the secondary button. Labels are device-local only.

## 8. Errors, rate limits, retries

- Access key from `VITE_ARKIV_ACCESS_KEY` (web) / `ARKIV_ACCESS_KEY` (seed) Format per SDK_NOTES: appended to the RPC URL
  (`…/tiramisu…/<KEY>`, **[verify on chain]** incl. browser CORS).
  It is visible in the bundle; it only raises rate limits. Different keys for web vs seed/heartbeat.
- Adapter retry policy (only place with retries): reads 3 attempts, exp backoff 400 ms·2ⁿ + jitter on 429/5xx/network;
  writes retried **only** before broadcast (estimation/nonce errors), never after a tx hash exists (poll receipt
  instead, 30 s timeout). Map: 429→`RATE_LIMITED`, insufficient funds→`INSUFFICIENT_FUNDS`, not owner→`NOT_OWNER`, etc.
- Read economy: reputation joins dedupe keys; TanStack `staleTime: 5 s`; watcher resolves ≤10 entities/s.
- UI: every mutation button has pending (≈2–4 s for a block) + error toast keyed off `BhaiyaPleaseError.code`; `INSUFFICIENT_FUNDS`
  opens Fund me; `retryable` errors show "Retry".

## 9. Deliberately OFF Arkiv
Names, phone numbers, flat numbers, ID documents/numbers, exact GPS (only geohash), chat, payments (UPI at the gate),
any delivery-platform data, handoff secret until reveal, private keys, access keys, reputation *scores* (always computed),
zone labels, the trusted-verifier list (viewer config).

## 10. Top risks
| # | Risk | Mitigation |
|---|---|---|
| 1 | SDK 0.8 behaviour differs (batch transfer of same-batch create, predictEntityKeys semantics, patch semantics, $owner in queries) | All in one adapter; Thu-night spike tests each; documented fallbacks (two_tx, re-send attrs, client-side owner filter); log in friction.md |
| 2 | Judges can't get gas → app looks broken | Read-only browsing works; Fund me flow; demo personas fallback; video shows the full flow regardless |
| 3 | Empty board when judges open it (runs expire in ~20 min) | `scripts/seed/heartbeat.ts` run by a GitHub Actions cron (every 15 min until 22 Oct) announces synthetic runs from seed runners; keys in GH secrets; disclosed in README |
| 4 | Integration crunch Fri | Mock shares services code with real; swap behind `VITE_CORE`; sync at Fri 14:00, not Sat |
| 5 | Rate limits / RPC flakiness during demo recording | Access keys, retries, record the video from a warm session; keep a mock-mode build as a last-resort *local* rehearsal only (never shown as live) |
