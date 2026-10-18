# Arkiv friction report

What slowed us down while building **Bhaiya Please** and **Arkiv Triggers** on Arkiv, with the exact call, what we expected, what happened, how to reproduce it, and how we worked around it.

| | |
|---|---|
| **SDK** | `@arkiv-network/sdk` **0.8.1** with `viem` 2.57.7, Node 20 |
| **Network** | Tiramisu testnet, chain id `7738577` |
| **Surfaces used** | `createPublicClient` / `createWalletClient`, `createEntity`, `patchEntity`, `extendEntity`, `changeOwnership`, `deleteEntity`, `executeBatch`, `predictEntityKeys`, the `select()` query builder (incl. `.atBlock`), `watchEntityEvents`, `getBlockTiming`, `getBlockNumber`, `getBalance`, entity flags (`readonly`, `permissionlessExtension`), `ExpirationTime`, access keys |
| **Evidence tags** | `source` = read in the shipped package source and type-checked · `chain` = observed against Tiramisu · `build` = hit while building. Section B records the chain spike and seed (16 Oct 2026), which upgraded findings 1, 8, 10 and 16 to `chain`. |
| **Time lost** | Estimates from memory of the build, not measured |

Full SDK notes: [`docs/SDK_NOTES.md`](../docs/SDK_NOTES.md). Probe and spike code: [`scripts/spike/spike.ts`](../scripts/spike/spike.ts).

## Summary

| # | Finding | Kind | Evidence |
|---|---|---|---|
| [21](#21-a-spent-read-quota-answers-http-429-the-same-status-as-the-rate-limit-so-standard-clients-retry-it) | A spent read quota answers HTTP 429 like the rate limit, so clients retry it (536 → 10 calls/min after the fix) | **blocker** | chain |
| [13](#13-watchentityevents-cant-filter-by-project-or-type-events-carry-no-attributes-and-expiry-emits-nothing) | `watchEntityEvents` can't filter by project or type, events carry no attributes, and expiry emits nothing | major | source, chain |
| [22](#22-a-browser-app-pays-one-read-per-foreign-entity-to-use-watchentityevents-on-the-shared-testnet) | A browser pays one read per foreign entity to use `watchEntityEvents` | major | chain |
| [3](#3-forgetting-salt-after-predictentitykeys-silently-yields-a-different-key) | Forgetting `salt` after `predictEntityKeys` silently yields a different key | major | source |
| [8](#8-bare-numbers-are-i32-comparing-a-u64-attribute-with-a-bare-number-matches-nothing) | A bare number is `i32`, so a `u64` comparison silently matches nothing | major | chain |
| [17](#17-access-key-in-the-url-leaks-through-error-messages-the-header-works-but-is-undocumented-in-the-sdk-path) | An access key in the URL leaks through error messages; the header works but is undocumented | major | chain |
| [5](#5-createdat-and-expiresat-are-block-numbers-createdat-is-not-filterable) | `$createdAt` / `$expiresAt` are block numbers, and `$createdAt` is not filterable | moderate | source, chain |
| [7](#7-extendentity-sets-not-adds-and-reverts-if-not-later) | `extendEntity` sets rather than adds, and reverts if not later | moderate | source |
| [1](#1-ne---is-in-the-sdk-but-the-network-rejects-it) | `ne()` is in the SDK but the node rejects it | moderate | chain |
| [4](#4-executebatch-result-echoes-input-for-everything-except-creates) | The `executeBatch` result echoes the input for everything except creates | moderate | source |
| [18](#18-arkiv_query-reuses-json-rpc-code--32005-for-cursor-expired) | `arkiv_query` reuses code -32005 for "cursor expired" | moderate | source |
| [10](#10-access-key-format-is-not-shown-and-the-key-is-public-in-a-browser) | The access key format is not shown, and the key is public in a browser | moderate | chain |
| [16](#16-two-read-limits-with-different-behaviour-share-one-error-status) | Two read limits (rate and cost budget) share one 429 status | moderate | chain |
| [2](#2-wallet-client-has-no-read-actions) | The wallet client has no read actions | minor | source |
| [6](#6-expiry-durations-multiples-of-2-s-only-approximate-and-permanent-exists) | Expiry must be a multiple of 2 s, is approximate, and `permanent()` exists | minor | source |
| [9](#9-no-match-all-query-and-no-filtered-count) | No match-all query and no filtered count | minor | source |
| [11](#11-reserved-attribute-names-are-only-discoverable-in-source) | Reserved attribute names are only discoverable in source | minor | source |
| [12](#12-entities-come-back-as-type-value-wrappers-with-bigint-jsonstringify-throws) | Entities come back as `{type, value}` wrappers with `bigint`, so `JSON.stringify` throws | minor | source, chain |
| [14](#14-building-a-query-string-to-log-or-document-is-not-a-documented-feature) | Printing a query string is not documented | minor | build |
| [20](#20-seeding-history-is-slow-by-construction) | Seeding history is slow by construction | minor | chain |
| [15](#15-bun-export-condition-listed-first-in-the-package) | `bun` export condition listed first | info | source |
| [19](#19-node-rejection-messages-are-excellent-positive) | Node rejection messages are excellent | **positive** | chain |
| [23](#23-historical-reads-atblock-made-a-trustless-no-show-proof-possible-positive) | Historical reads (`atBlock`) made a trustless no-show proof possible | **positive** | chain |

The one thing we would fix first is in [section C](#c-one-thing-arkiv-should-improve-first).

## A. Findings

### 1. `ne()` / `!=` is in the SDK but the network rejects it
- **SDK**: 0.8.1. **Symbol**: `import { ne } from '@arkiv-network/sdk/query'`, `ne('x', i32(1))`.
- **Expected**: an operator the typed API offers is accepted by the network, or is not offered.
- **Actual**: the builder renders `x != i32(1)` without error; the node rejects it only at request time (`QueryError` kind `type`, -32002, see S7). Evidence: `chain`.
- **Reproduce**: `String(pub.select('*').where([ne('a', i32(1))]))` prints a valid-looking query. `scripts/spike` step "query: ne() / != (open Q2)" sends it to the node and records the error kind.
- **Workaround**: never use `ne`; `not(eq(...))` or client-side filtering. Our app uses neither server-side.
- **Time lost (estimate)**: 20 min.

### 2. Wallet client has no read actions
- **SDK**: 0.8.1. **Symbol**: `createWalletClient(...)` then `wallet.predictEntityKeys`, `wallet.getEntity`, `wallet.select`.
- **Expected**: viem wallet clients usually extend public actions; writing then reading from one client.
- **Actual**: TypeScript error "Property does not exist"; reads and `predictEntityKeys` exist only on the public client. Evidence: `source`.
- **Reproduce**: `const w = createWalletClient({chain: tiramisu, transport: http(), account}); w.predictEntityKeys(...)` under `tsc --strict`.
- **Workaround**: adapter holds a public and a wallet client (`packages/core/src/arkiv/adapter.ts`).
- **Time lost (estimate)**: 15 min.

### 3. Forgetting `salt` after `predictEntityKeys` silently yields a different key
- **SDK**: 0.8.1. **Symbol**: `pub.predictEntityKeys({owner, count})` returns `{key, salt}[]`; `createEntity({ salt })`.
- **Expected**: the predicted key is what gets created, or a mismatch is an error.
- **Actual**: `createEntity` defaults to a random salt, so omitting `salt: p.salt` creates a different entity key with no error. For us this is serious: the handoff commit is `keccak256(code ‖ salt ‖ requestKey)`, so a wrong key makes the request unverifiable. The only detection is comparing the returned key to the prediction. Evidence: `source`; docs example does not mention `salt`.
- **Reproduce**: predict, create without `salt`, compare `entityKey` with `p.key`.
- **Workaround**: always pass `salt`, assert equality, delete and retry once (`services/requests.ts`). Prediction is also nonce-bound, so predict + create run inside one serialized write queue.
- **Time lost (estimate)**: 40 min.

### 4. `executeBatch` result echoes input for everything except creates
- **SDK**: 0.8.1. **Symbol**: `wallet.executeBatch({...})` returning `{createdEntities, patchedEntities, deletedEntities, extendedEntities, ownershipChanges}`.
- **Expected**: result reflects what the chain did, including per-operation new expiry.
- **Actual**: only `createdEntities` is read from receipt events; the other arrays echo the request. No `expiresAt` for batch operations (single calls return it). Evidence: `source`.
- **Reproduce**: read `entity/operations.ts` result mapping.
- **Workaround**: we re-read entities after batches when we need the truth (`scripts/seed` also waits a block).
- **Time lost (estimate)**: 15 min.

### 5. `$createdAt` and `$expiresAt` are block numbers; `$createdAt` is not filterable
- **SDK**: 0.8.1. **Symbol**: `where(gt('$createdAt', ...))` throws; `entity.createdAt`/`expiresAt` are `bigint` blocks.
- **Expected**: unix time, or a documented conversion, and time-range queries on creation time.
- **Actual**: queryable system attributes are only `$key $owner $creator $expiresAt`. Time windows need a user attribute (`at`, `eta`). `getBlockTiming()` does the conversion but is absent from the guides. Evidence: `source` and `chain` (read-only probe 16 Oct: returns `currentBlockTime` in unix seconds, `blockDuration: 2`).
- **Reproduce**: `pub.select('*').where(gt('$createdAt', u64(1n))).fetch()` throws before sending.
- **Workaround**: our own `at` u64 attribute for filtering (complaints); windows for reputation use `$createdAt` converted client-side.
- **Time lost (estimate)**: 45 min.

### 6. Expiry durations: multiples of 2 s only, approximate, and `permanent()` exists
- **SDK**: 0.8.1. **Symbol**: `ExpirationTime.fromSeconds(3)` throws `InvalidExpiryError`; `fromMonths`=30 d, `fromYears`=365 d; `ExpirationTime.permanent()`.
- **Expected**: any second count accepted and rounded, or documented.
- **Actual**: odd seconds throw. Durations are converted to blocks, so `extendEntity` "now + 30 d" can differ by blocks from the previous value. `permanent()` is block 2^64-1, an easy abuse vector for demo data. Evidence: `source`.
- **Reproduce**: `ExpirationTime.fromSeconds(3)`.
- **Workaround**: `lifetimeSeconds()` rounds up to even; we never use `permanent()`. Every entity has an expiry that matters to the user.
- **Time lost (estimate)**: 15 min.

### 7. `extendEntity` sets, not adds, and reverts if not later
- **SDK**: 0.8.1. **Symbol**: `wallet.extendEntity({entityKey, expires})`.
- **Expected**: "extend by 30 d".
- **Actual**: sets expiry to now + duration and reverts (`ExpiryNotExtended`) if that is not later. Two quick "still open" taps can revert the second. Evidence: `source`.
- **Reproduce**: extend twice with the same duration in one block.
- **Workaround**: `extensionMovesLater()` with a 60 s margin before including an extension in a batch; UI says "last confirmed N days ago" instead of promising additive time.
- **Time lost (estimate)**: 30 min.

### 8. Bare numbers are `i32`; comparing a `u64` attribute with a bare number matches nothing
- **SDK**: 0.8.1. **Symbol**: `eq('eta', 5)`, `gt('eta', 5)`.
- **Expected**: a type mismatch error, or numeric coercion.
- **Actual**: the query is valid and silently returns an empty set. Same for bigint → `u256`. Evidence: `chain` (S13).
- **Reproduce**: write `eta: u64(100n)`, query `gt('eta', 5)`.
- **Workaround**: attribute types come from one table (`codec/attrs.ts`, `attr()` constructor) so a name cannot be written or queried with the wrong type.
- **Time lost (estimate)**: 30 min.

### 9. No match-all query and no filtered count
- **SDK**: 0.8.1. **Symbol**: `pub.select('*').fetch()` with no `where`; `getEntityCount()`.
- **Expected**: list a project, count by filter.
- **Actual**: no `where` throws `InvalidPredicateError`; `getEntityCount()` takes no filter (counts the whole chain). Evidence: `source`.
- **Reproduce**: call both.
- **Workaround**: every entity carries `project` + `type`; the query helper always prepends them.
- **Time lost (estimate)**: 10 min.

### 10. Access key format is not shown, and the key is public in a browser
- **SDK**: 0.8.1. **Symbol**: custom RPC `http(url)`.
- **Expected**: a documented URL/header format, and a story for static front-ends.
- **Actual**: docs say "append the access key to the end of the RPC URL" with no example, and warn that it leaks in a browser, which is the exact case for a no-backend app. Evidence: `chain` (S8: path and header both work).
- **Reproduce**: n/a (documentation).
- **Workaround**: the key is optional; core now sends it as the `X-API-KEY` header (verified, see S8 and finding 17); separate keys for the web bundle and for seed/heartbeat; the web key's Origins are restricted on hub.arkiv.network.
- **Time lost (estimate)**: 20 min.

### 11. Reserved attribute names are only discoverable in source
- **SDK**: 0.8.1. **Symbol**: attribute name `key` (reserved); `type` and `project` are fine.
- **Expected**: reserved list in the docs; early, clear error.
- **Actual**: names such as `key`, `str`, `addr`, `and`, `or`, `not` are rejected only client-side at construction time; list lives in `attr/names.ts`. Names are limited to 32 bytes, no `--`. Max attributes is 32 (docs said 30). Evidence: `source`.
- **Reproduce**: `createEntity({attributes: {key: str('x')}, ...})`.
- **Workaround**: schema uses `run`, `shop`, `request`, `delivery` etc. (not reserved). Caught in design, not at runtime.
- **Time lost (estimate)**: 10 min.

### 12. Entities come back as `{type, value}` wrappers with `bigint`; `JSON.stringify` throws
- **SDK**: 0.8.1. **Symbol**: `entity.attributes.eta.value`, block fields.
- **Expected**: plain values or a serializer.
- **Actual**: `JSON.stringify(entity)` throws on bigint; every consumer needs a mapper. Addresses come back EIP-55 checksummed while many callers compare lowercase. Evidence: `source` and `chain` (read probe).
- **Reproduce**: `JSON.stringify(await pub.getEntity(key))`.
- **Workaround**: adapter maps to `RawEntity` and lowercases addresses/keys/bytes32.
- **Time lost (estimate)**: 30 min.

### 13. `watchEntityEvents` can't filter by project or type, events carry no attributes, and expiry emits nothing
- **SDK**: 0.8.1. **Symbol**: `pub.watchEntityEvents({ onEntityCreated, ... })`.
- **Expected**: subscribe to "my project's runs"; be told when something expires.
- **Actual**: the SDK function exposes no filter (only `fromBlock` and `pollingInterval`), so the stream is all of Tiramisu (a third-party load generator creates entities every block). Each event carries only the entity key and owner, `ExpiryExtended.owner` is the entity owner, not the extender, and nothing fires on expiry. Underneath, the events are EVM logs on `0x4400…0044` whose `entityKey` and `owner` are indexed topics, so a raw viem `watchEvent` with `args` **can** filter by key or owner at the node (WebSocket subscriptions work too). What no filter can express is project or type, so a project-filtered live board still needs one `get` per new entity it doesn't already know. Evidence: `source` and `chain` (foreign traffic on 16 Oct; on 18 Oct over `wss://`: 17 unfiltered `EntityCreated` logs in 20 s, 0 with an `owner` filter in 25 s).
- **Reproduce**: subscribe with `watchEntityEvents` and count events without `project=bhaiyaplease`; then `watchEvent({ address: '0x4400…0044', event: EntityCreated, args: { owner } })` and compare.
- **Workaround**: core keeps one shared poller that resolves unknown keys at ≤ 10 `get`/s and remembers foreign keys (`arkiv/watcher.ts`); the UI hides expired items by `eta` / `expiresAt` on a ticking clock. On the real chain the app no longer subscribes at all, because of the read cost (finding 22): screens poll their own small queries and Arkiv Triggers delivers pushes. The sandbox still uses the event stream.
- **Fix that would help**: expose the key / owner filters in `watchEntityEvents`, and add project / type as indexed topics (or attributes in the event).
- **Time lost (estimate)**: 2 h.

### 14. Building a query string to log or document is not a documented feature
- **SDK**: 0.8.1. **Symbol**: `String(pub.select('*').where(...))` (the builder's `toString()`).
- **Expected**: a documented way to print the exact query for debugging and for the "queries your app runs" deliverable.
- **Actual**: it works and renders `project = str('bhaiyaplease') AND eta > u64(…)`, but we found it by inspecting the builder object. Evidence: `build`.
- **Reproduce**: see `schema.md` section 5.
- **Workaround**: used it to produce the literal strings in `schema.md`.
- **Time lost (estimate)**: 10 min.

### 15. `bun` export condition listed first in the package
- **SDK**: 0.8.1. **Symbol**: `package.json` `exports["."]` has `"bun": "./src/index.ts"` first.
- **Expected**: n/a, informational. Works with Node, Vite and Metro in our setup.
- **Actual**: Bun users resolve TypeScript source, which has surprised other projects. Evidence: `source`.
- **Reproduce**: read `package.json`.
- **Workaround**: none needed.
- **Time lost (estimate)**: 0 min.

### 16. Two read limits with different behaviour share one error status
- **SDK**: 0.8.1. **Symbol**: public RPC with and without an access key.
- **Expected**: one place in the SDK docs that explains what limits a client will meet and how to handle each.
- **Actual**: there are two. A request rate limit (anonymous `ratelimit: limit=600, remaining=599, reset=60`, keyed `limit=9999`; see S8), which recovers within a minute, and a cost-based read budget per key (and per anonymous caller), whose remaining amount is shown on hub.arkiv.network and which lasts until it resets. Both answer HTTP 429, so a client cannot tell from the status which one it hit (finding 21). On 16 Oct the public RPC served `select`, system-attribute filters, `getEntity` and `atBlock` queries without a key; the budget became the binding limit a day later under real use. Evidence: `chain`.
- **Reproduce**: response headers on any RPC call (rate limit); spend a budget and compare the 429 bodies (finding 21).
- **Workaround**: classify by response body, not status: transient 429/5xx are retried with backoff (reads only; writes only before broadcast); a spent budget is never retried (finding 21); joins are batched; each query family has its own polling interval.
- **Time lost (estimate)**: 30 min.

## B. Chain spike and seed results (16 Oct 2026)

Setup: SDK `@arkiv-network/sdk` **0.8.1**, `viem` 2.57.7, Node 20, Tiramisu (chain id 7738577), two funded EOAs (wallet A ~9 GLM, wallet B ~1 GLM), access key from hub.arkiv.network. Reproduce: fill `.env` (`SEED_PRIVATE_KEY`, `VERIFIER_PRIVATE_KEY`, `ARKIV_ACCESS_KEY`) and run `pnpm spike` (each check prints PASS/FAIL with the raw node text), then `pnpm seed`. Result: **29 PASS, 0 FAIL, 0 SKIP**, run twice (once in the morning, once at 06:0x UTC, head ≈ 625117).

| # | Check | Result | Evidence (exact) |
|---|---|---|---|
| S1 | `createEntity` with str/u64/i32/addr/key/bytes32 attrs + flags + expiry; read back | PASS | Returned `expiresAt` (block 625570) equals `$expiresAt` read back. Values come back typed: `eta: bigint`, `cap: number`, addresses EIP-55 |
| S2 | `executeBatch`: create(readonly) + extend + `changeOwnership` of the **new** key in one batch | PASS | After the tx: `$owner` = recipient, `$creator` = issuer, `readonly = true`; a `$creator AND $owner` query returns it. Our receipt batch never needed the two-tx fallback during seeding |
| S3 | `predictEntityKeys` = created key (salt passed) | PASS | Single create and batch creates; no mismatch over the whole seed (38 requests + 37 receipts predicted) |
| S4 | create + patch in one batch; partial patch keeps expiry and other attrs | PASS | `expiresAt before 625570 after 625570` |
| S5 | `extendEntity` on a readonly entity | PASS | Owner extend 625578 → 626032; and the *new* owner after a transfer can extend (runner renews receipt) |
| S6 | Non-owner extend on `permissionlessExtension` entity; non-owner on a plain entity | PASS / rejected as expected | Stranger extend → 626048, owner unchanged. Plain entity: `entity 0x64bd…50d9 is owned by 0x7975…080c, not 0x166E…eE20` |
| S7 | `ne()` / `!=` | Rejected by node | `QueryError: Query rejected (type, -32002) … Error: != is not part of the query language — write NOT (attr = value) for the complement`. Good message; the SDK still exports `ne()` (finding 1) |
| S8 | Access key | PASS | `<rpc>/<KEY>` path and `X-API-KEY: <KEY>` header both give HTTP 200 with `ratelimit: limit=9999`; wrong key → HTTP 401 `{"error":"INVALID_KEY","message":"unknown API key"}`; anonymous → `ratelimit: limit=600, remaining=599, reset=60`. CORS preflight: `access-control-allow-origin: *`, `allow-headers: Content-Type, Authorization, X-Api-Key`. Verified in Chromium: the real-core web build made 0 RPC responses ≥ 400 over a full flow |
| S9 | `watchEntityEvents` | PASS | 14 events for our keys among 91 on chain during the spike; all five event shapes logged (see `scripts/spike`). Chain background load measured over 300 blocks: 690 events, **2.3 per block** (472 created), so a project-filtered live board must classify ~1 foreign entity per second |
| S10 | Read-after-write lag | PASS | Entity visible to `select` **228 ms** after the receipt |
| S13 | `watchEntityEvents` over a WebSocket transport | PASS | `createPublicClient({ transport: webSocket(wss://rpc.tiramisu.db-chain.testnet.arkiv.network) })` + `watchEntityEvents`, no `fromBlock`: first event 2 s after subscribing, 45 events in 45 s (≈ 1/s from the shared chain), no key required. With an unreachable `wss://` host `onError` fires once and core falls back to the HTTP poller (23 events in 25 s). Browsers cannot send `X-API-KEY` on a WebSocket, so the socket is anonymous; reads stay on the keyed HTTP client |
| S11 | `$creator` immutable / `$owner` changes after `changeOwnership`; `.ownedBy`/`.createdBy` | PASS | See S2 |
| S12 | Gas | PASS | One create: gasUsed 125,528 × 1,000,000,002 wei = **0.000125528 GLM**. Seed funded 22 persona wallets with 0.05 GLM each; the whole seed (≈ 200 transactions incl. batches, 23 wallets) cost **≈ 0.03 GLM** in gas; the trusted runner's ~95 transactions cost 0.0127 GLM (≈ 0.00013 GLM each) |
| S13 | u64 / i32 range queries, incl. negative i32; typed mismatch | PASS | `eta > u64(now)`, `cap >= i32(3)`, `delta < i32(0)` correct; `cap = u64(3)` against an i32 attribute returns **empty, no error** (finding 8 confirmed) |
| S14 | Expired entities vanish from queries | PASS (indirect) | Runs announced by the heartbeat drop out of `getLiveRuns` after ETA + 10 min; queries never returned an entity past `$expiresAt` |
| S15 | Faucet UX for a fresh judge wallet | Not determined headlessly | The faucet page is client-rendered; we did not automate it. The app therefore ships an operator path (`pnpm fund <address>`) to top up a judge's burner from our seed wallet |

### New findings from the chain runs

#### 17. Access key in the URL leaks through error messages; the header works but is undocumented in the SDK path
- **SDK**: 0.8.1 + viem 2.57.7. **Symbol**: `http(url)` transport.
- **Expected**: one documented way to pass the key that does not end up in logs.
- **Actual**: the docs say "append the key to the RPC URL". viem's `HttpRequestError` message includes the full request URL, so any transport error shown in a toast or a CI log prints the key. `X-API-KEY` (and `Authorization: Bearer`) headers work and are CORS-allowed, which we only found by probing. Evidence: `chain`.
- **Reproduce**: `curl -H 'X-API-KEY: <key>' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' https://rpc.tiramisu.db-chain.testnet.arkiv.network` → 200; with a bogus key → 401 `INVALID_KEY`.
- **Workaround**: `rpcTransport()` in `packages/core/src/arkiv/adapter.ts` sends `X-API-KEY`; seed scripts additionally redact secrets from output.
- **Time lost (estimate)**: 30 min.

#### 18. `arkiv_query` reuses JSON-RPC code -32005 for "cursor expired"
- **SDK**: 0.8.1. **Symbol**: `QueryError` (`kind: 'cursor'`, code -32005) vs viem `LimitExceededRpcError` (also -32005).
- **Expected**: distinct codes for "your cursor is stale, restart the walk" and "rate limited".
- **Actual**: a generic error classifier that maps -32005 to "rate limited, back off and retry the same request" retries a dead cursor three times. Evidence: `source` (SDK `query/errors.ts`) plus the skills' known-issues note that an unpinned cursor can be rejected once the head moves.
- **Workaround**: classify `QueryError` by `kind` before looking at codes (`arkiv/errors.ts`); pin multi-page walks to the first page's `blockNumber` and restart once on a cursor error (`adapter.ts`).
- **Time lost (estimate)**: 20 min.

#### 19. Node rejection messages are excellent (positive)
- Rejections read like documentation: `entity … was created readonly, so its contents can never change. Its expiry can still be extended, and it can be transferred or deleted`, `already expires at block 625570, so extending it to 625154 would shorten its life`, `!= is not part of the query language — write NOT (attr = value)`. They arrive pre-broadcast (gas estimation), so a mistake costs no GLM. The outer viem error says only `Execution reverted for an unknown reason`; the useful text is two causes deep. Surfacing it in `EntityMutationError.message` would save every app a cause-chain walk.

#### 20. Seeding history is slow by construction
- **SDK**: 0.8.1. **Symbol**: sequential writes per wallet (`createEntity`, `executeBatch`).
- **Actual**: the fixture history (38 handoffs, ~5 dependent transactions each, every one waiting for its receipt) took **≈ 40 minutes** wall clock (8.5 min before the first run was interrupted, then 1,868 s for `--resume`), dominated by receipt waits and by profile recomputation before each tier-gated write (a profile read joins every receipt to its Delivery and Request, so it grows with history). Dependencies (request key must exist before the delivery reveals it; receipt needs the delivery) prevent batching across steps, and per-wallet nonce ordering prevents parallelism within a wallet. Evidence: `chain`.
- **Workaround**: run once; the heartbeat only adds cheap runs.

#### 21. A spent read quota answers HTTP 429, the same status as the rate limit, so standard clients retry it
- **SDK**: 0.8.1 + viem 2.57.7. **Surface**: public RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`, `arkiv_query`, with and without an access key.
- **Expected**: running out of quota is a terminal state for the period, so the response tells clients "do not retry" (a non-429 status, or `Retry-After` set to the reset time), distinct from the per-minute rate limit, which is worth retrying.
- **Actual**: reads are metered by cost (other teams measured about 100 units per `arkiv_query`), and the remaining budget is shown per key on hub.arkiv.network. When it runs out, the RPC answers HTTP 429 `{"error":"QUOTA_EXCEEDED","message":"quota exhausted"}` (keyed) or 429 `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}` (anonymous). That is the same status as the 600-requests/min rate limit, whose `ratelimit` headers track request rate rather than cost budget. `eth_blockNumber` and writes keep working. Because it is a 429, viem's HTTP transport retries it by default (3×), and so did our core and React Query on top. One idle app tab measured **536 calls/min**, nearly all retries of refused reads, which spent the next key's budget faster. Evidence: `chain` (curl on both paths on 17 Oct, request counts captured in headless Chromium by query type).
- **Reproduce**: spend a key's budget, then `curl -H 'X-API-KEY: <key>' -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["project = str(\'bhaiyaplease\') AND type = str(\'shop\')",{"select":{"key":true}}]}' <rpc>` → 429 `QUOTA_EXCEEDED`; the same without the header → 429 `ANON_COST_LIMITED` (once the anonymous budget is spent). Point a default viem `http()` transport at it and count the requests per call.
- **Workaround**: `classify()` reads the body and maps both errors to `QUOTA_EXHAUSTED`, which is never retried; viem `retryCount: 0` (the adapter owns retries); keyed → anonymous fallback, then a 60 s read breaker (`packages/core/src/arkiv/adapter.ts`); per-query-family polling (live board 20 s, profiles 2 min, shops 5 min). Idle cost fell to **10 calls/min**. A test pins the classification (`packages/core/test/quota.test.ts`).
- **Fix that would help**: answer a spent quota with a status clients do not retry by default (e.g. 402 or 403 with the same body), or keep 429 with `Retry-After` set to the reset time; and note in the SDK docs that `http()` should be created with `retryCount: 0` (or a quota-aware `retry`) for read-heavy browser apps.
- **Time lost (estimate)**: 4 h (diagnosis, measurement, the fix, and re-testing on new keys).

#### 22. A browser app pays one read per foreign entity to use `watchEntityEvents` on the shared testnet
- **SDK**: 0.8.1. **Symbol**: `publicClient.watchEntityEvents` (see also finding 13).
- **Expected**: subscribe to one project's events without paying for everyone else's.
- **Actual**: events carry no attributes, so classifying a created key needs a `get` (an `arkiv_query`, about 100 cost units). On a busy shared testnet our watcher spent about 87 reads/min classifying other projects' entities. Under a cost quota, real-time events are unaffordable in the browser. Evidence: `chain` (headless capture: `$key = key(…)` queries/min with the app idle).
- **Workaround**: no global watcher in real mode; screens poll their own small queries, and push comes from Arkiv Triggers (one shared worker watching, finding 23).
- **Fix that would help**: project / type as filterable event topics, or attributes included in the event. (Filtering by key or owner already works on raw logs, finding 13, but a board can't know the creators of entities it hasn't seen.)
- **Time lost (estimate)**: included in 21.

#### 23. Historical reads (`atBlock`) made a trustless no-show proof possible (positive)
- **SDK**: 0.8.1. **Symbols**: query builder `.atBlock(n)`, historical `getEntity`.
- **Expected / actual**: a past block's state can be re-read by anyone, so "the runner accepted and no delivery existed at block B" is checkable without trusting whoever wrote it. Our `noshow` evidence stores B; `verifyNoShowEvidence` re-reads at B and refuses forged evidence (wrong rider, delivery present, block before ETA, later delivery). Worked as documented on Tiramisu. Evidence: `chain` + `packages/core/test/noshow.test.ts`.
- **One gap**: there is no documented retention window for historical reads. Evidence that outlives that window cannot be re-verified, so we would like to know it.

## C. One thing Arkiv should improve first

**Let a client subscribe to one project's events.** Today `watchEntityEvents` streams every entity on the shared testnet with only a key and an owner; the raw logs underneath can be filtered by key or owner but not by project, so an app must spend one read per new entity just to learn whether it is its own (findings 13 and 22). Under the read quota that makes real-time updates unaffordable in a browser, which is why our real-chain app polls instead and we built Arkiv Triggers to watch on users' behalf. A server-side filter on `project` / `type` (or the attributes included in each event), plus an event when an entity expires, would turn live boards, notifications and expiry-driven flows into one subscription.

After that: answer a spent read quota with a status or code that HTTP clients do not retry by default (finding 21), batch results that reflect on-chain effects (finding 4), and a first-class predict-and-create (finding 3).
