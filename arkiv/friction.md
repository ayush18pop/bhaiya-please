# Arkiv friction report

SDK: `@arkiv-network/sdk` **0.8.1** with `viem` 2.57.7, Node 20, Tiramisu testnet (chain id 7738577). Surfaces used: `createPublicClient`/`createWalletClient`, `createEntity`, `patchEntity`, `extendEntity`, `changeOwnership`, `deleteEntity`, `executeBatch`, `predictEntityKeys`, `select()` query builder, `watchEntityEvents`, `getBlockTiming`, entity flags (`readonly`, `permissionlessExtension`), `ExpirationTime`, access key.

How to read this file:
- **Evidence** says how we know: `source` = read in the shipped package source and type-checked, not yet run against the chain; `chain` = observed against Tiramisu; `build` = hit while building. Write-side items stay `source` until the chain spike runs (section B).
- **Time lost** values are **estimates** from memory of the build, not measured.
- Full SDK notes: `docs/SDK_NOTES.md`. Probe/spike code: `scripts/spike/spike.ts`.

## A. Findings so far

### 1. `ne()` / `!=` is in the SDK but the network is documented to reject it
- **SDK**: 0.8.1. **Symbol**: `import { ne } from '@arkiv-network/sdk/query'`, `ne('x', i32(1))`.
- **Expected**: an operator the typed API offers is accepted by the network, or is not offered.
- **Actual**: the builder renders `x != i32(1)` without error; the docs say the current network rejects `!=`. The failure would only appear at request time. Evidence: `source`.
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
- **Actual**: the query is valid and silently returns an empty set. Same for bigint → `u256`. Evidence: `source`.
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
- **Actual**: docs say "append the access key to the end of the RPC URL" with no example, and warn that it leaks in a browser, which is the exact case for a no-backend app. Evidence: `source`, to be confirmed by spike.
- **Reproduce**: n/a (documentation).
- **Workaround**: `rpcUrlWithKey()` appends `/<KEY>`; the key is optional; separate keys for the web bundle and for seed/heartbeat. [unverified: see section B]
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

### 13. `watchEntityEvents` carries no attributes, no type, no filter; expiry emits nothing
- **SDK**: 0.8.1. **Symbol**: `pub.watchEntityEvents({ onEntityCreated, ... })`.
- **Expected**: subscribe to "my project's runs"; be told when something expires.
- **Actual**: the stream is all of Tiramisu (a third-party indexer load generator creates entities every block), events have key + owner only, `ExpiryExtended.owner` is the entity owner not the extender, and nothing fires on expiry. A project-filtered live board needs one `get` per foreign event. Evidence: `source` and `chain` (observed foreign traffic on 16 Oct).
- **Reproduce**: subscribe and log; count events without `project=bhaiyaplease`.
- **Workaround**: one shared poller, resolves unknown keys at <= 10 `get`/s, remembers foreign keys, UI hides by `eta`/`expiresAt` on a ticking clock (`arkiv/watcher.ts`).
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

### 16. Shared-testnet behaviour we need to plan around
- **SDK**: 0.8.1. **Symbol**: public RPC without access key.
- **Expected**: rate limits stated.
- **Actual**: the public RPC served `select`, system-attribute filters, `getEntity` and `atBlock` queries without a key on 16 Oct. We do not yet know the limit under judge load. Evidence: `chain` (read-only, unfunded probe).
- **Reproduce**: `scripts/spike` read steps.
- **Workaround**: retry with backoff on 429/5xx (reads only; writes retried only before broadcast), batching of joins, `staleTime`.
- **Time lost (estimate)**: 30 min.

## B. To be filled after chain spike

Run `pnpm spike` with a funded `SEED_PRIVATE_KEY` (and `VERIFIER_PRIVATE_KEY` for the two-wallet checks). For each, record PASS/FAIL, the exact error text, and the fallback taken. Nothing below is claimed until done.

| # | Check | Why it matters | Status |
|---|---|---|---|
| S1 | `createEntity` with attributes + flags + expiry; read back; returned `expiresAt` vs `$expiresAt` | Baseline; expiry drift | TODO |
| S2 | `executeBatch`: create + `changeOwnership` of the **new** key in one batch | Receipt flow (`schema.md` item 1) | TODO |
| S3 | `predictEntityKeys` equals `createdEntities` for 1 and 2+ creates in a batch | Handoff commit (item 5) | TODO |
| S4 | `executeBatch`: create + `patchEntity`; expiry and other attributes unchanged after patch | Accept flow (item 4) | TODO |
| S5 | `extendEntity` on a **readonly** entity | Request/receipt extension (item 2) | TODO |
| S6 | `extendEntity` by a non-owner on a `permissionlessExtension` entity; non-owner on a plain entity must fail | Shop "still open" (item 3) | TODO |
| S7 | `ne()` / `!=` error text and `QueryError.kind` | Friction 1 | TODO |
| S8 | Access key as URL suffix; header alternative; browser CORS | Friction 10 (item 6) | TODO |
| S9 | `watchEntityEvents`: created/patched/extended/transferred/deleted observed for our writes | Live board | TODO |
| S10 | Read-after-write lag: time from receipt to visible in `select` | Seed/heartbeat settle delay | TODO |
| S11 | `$creator` unchanged and `$owner` changed after `changeOwnership`; `.ownedBy`/`.createdBy` correct | Trust model | TODO |
| S12 | Gas per op/batch in GLM; faucet amount; max batch size (20 transfers) | `SEED_FUND_GLM`, judge onboarding | TODO |
| S13 | `u64` vs `i32` range queries across wallets | Run board query | TODO |
| S14 | Expired entities disappear from queries after N blocks | "Vanishes by itself" claim | TODO |
| S15 | Faucet UX for a fresh judge wallet (login? captcha? amount) | App "Fund me" flow | TODO |

## C. One thing Arkiv should improve first (draft)

Make the write-side as inspectable as the read-side: batch results that reflect on-chain effects (finding 4), a first-class way to predict-and-create so the salt cannot be forgotten (finding 3), and a project-scoped event filter (finding 13). Final wording after the spike.
