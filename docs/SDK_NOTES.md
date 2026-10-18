# Arkiv SDK Ground Truth (verified from package source, not docs)

**Verified:** `@arkiv-network/sdk@0.8.1` (latest stable; `npm i @arkiv-network/sdk@0.8` resolves to it) + `viem@2.57.7`.
Method: read shipped `src/*.ts` (package ships `src/` and `dist/`), ran the built ESM in Node, type-checked every
snippet below with `tsc --strict`, bundled for browser with esbuild (`--platform=browser`, 693 KB, zero `node:` imports).
These notes come from the package source. Behaviour on the live chain was verified afterwards with `pnpm spike` (29/29 PASS); results are in [`arkiv/friction.md`](../arkiv/friction.md) section B and [`arkiv/schema.md`](../arkiv/schema.md) section 10.

## Entry points (package.json `exports`)
| Import | Gives |
|---|---|
| `@arkiv-network/sdk` | `createPublicClient`, `createWalletClient`, `ExpirationTime`, `jsonToPayload`, `stringToPayload`, `Entity`, errors (`EntityMutationError`, `NoEntityFoundError`, `NoMoreResultsError`, `EmptyPatchError`, `InvalidContentTypeError`, `InvalidExpiryError`...), `predictEntityKey`, `randomSalt`, `NO_SALT`, `MAX_SALT`, `encode/decodeCreationFlags`, `chainFromName`, types; also re-exports all of `/attr` |
| `/chains` | `tiramisu`, `localhost` (viem `defineChain`; id 7738577; native token GLM) |
| `/attr` | `str i32 u64 u256 dec addr key bytes32 bool`, `decUnits`, `decFromUnits`, limits, attr errors |
| `/query` | `eq ne gt gte lt lte startsWith exists hasType not and or`, `QueryResult`, `SelectQueryBuilder`, `QueryError`, `InvalidPredicateError`, `UnsupportedOperatorError` |
| `/entity`, `/types`, `/utils` | flags/expiry/key helpers, event + Entity types, `ExpirationTime`/payload helpers |
Deps: `brotli-wasm` only (lazy, and compression is not on any code path in 0.8.1). Peer: `viem ^2`.

## Cheat sheet (all type-checked)
```ts
import { createPublicClient, createWalletClient, ExpirationTime, jsonToPayload,
         NoEntityFoundError, EntityMutationError } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { str, i32, u64, u256, dec, addr, key, bytes32, bool } from "@arkiv-network/sdk/attr";
import { eq, gt, gte, lt, lte, or, not, startsWith, exists } from "@arkiv-network/sdk/query";
import { http, webSocket } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const RPC = "https://rpc.tiramisu.db-chain.testnet.arkiv.network"; // + access key, see (e)
const pub    = createPublicClient({ chain: tiramisu, transport: http(RPC) });
const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC),
                                    account: privateKeyToAccount(generatePrivateKey()) });
```
**Wallet client has NO read/query actions** (`getEntity`, `select`, `query`, `predictEntityKeys`,
`watchEntityEvents` are public-only). Keep both clients.

### createEntity
```ts
const { entityKey, txHash, expiresAt /* bigint block */ } = await wallet.createEntity({
  payload: jsonToPayload({ tags: ["on-time"] }),      // Uint8Array, REQUIRED (use new Uint8Array() if none)
  contentType: "application/json",                    // REQUIRED, lowercase MIME
  attributes: { project: str("bhaiyaplease"), type: str("run"), eta: u64(1760000000n), cap: i32(3) },
  flags: { readonly: true, permissionlessExtension: true },   // optional, both default false
  expires: ExpirationTime.fromMinutes(40),            // REQUIRED. NOT expiresIn. Relative to now.
  // salt?: bigint | NO_SALT  (defaults to 128 random bits)
});
```
`attributes` is a plain **object** `{name: value}` (not an array). Bare forms: `string->str`, `number->i32`,
`bigint->u256`, `boolean->bool`. Everything else (u64, dec, addr, key, bytes32) must use the constructor.

### ExpirationTime (full list; all return a plain `{minLifetime, expiresAt}` object)
`fromSeconds fromMinutes fromHours fromDays fromWeeks fromMonths(30d) fromYears(365d) fromBlocks(n)`
`atBlock(bigint, {atLeast?})`  `atDate(Date, {atLeast?})`  `permanent()` (= block 2^64-1).
Durations must be a multiple of 2 s (`fromSeconds(3)` throws `InvalidExpiryError`). Durations are converted to
blocks at 2 s/block (approximate). A bare number or hand-built literal for `expires` does not typecheck.

### patch / extend / transfer / delete
```ts
await wallet.patchEntity({ entityKey, set: { cap: i32(2) }, unset: ["eta"], payload?, contentType? }); // owner only, not on readonly; empty patch throws EmptyPatchError
await other.extendEntity({ entityKey, expires: ExpirationTime.fromDays(30) }); // returns {entityKey, txHash, expiresAt}
await wallet.changeOwnership({ entityKey, newOwner: "0x..." });                // returns {entityKey, txHash}
await wallet.deleteEntity({ entityKey });
```
`extendEntity` SETS a new expiry measured from now (not additive) and reverts `ExpiryNotExtended` if it would not
move later. A non-owner may call it only if the entity was created with `permissionlessExtension: true`.

### executeBatch: create + changeOwnership of the same entity
```ts
const [p] = await pub.predictEntityKeys({ owner: wallet.account.address, count: 1 }); // {key, salt}[]
const r = await wallet.executeBatch({
  creates: [{ salt: p.salt, payload: jsonToPayload({}), contentType: "application/json",
              expires: ExpirationTime.fromYears(1), flags: { readonly: true },
              attributes: { project: str("bhaiyaplease"), type: str("receipt"), rider: addr(riderAddr) } }],
  ownershipChanges: [{ entityKey: p.key, newOwner: riderAddr }],
});
// r = { txHash, createdEntities: Hex[], patchedEntities, deletedEntities, extendedEntities, ownershipChanges }
if (r.createdEntities[0] !== p.key) throw new Error("predicted key drifted");
```
Fields: `creates, patches, deletes, extensions, ownershipChanges` (all optional arrays; empty batch throws).
Result arrays are keys only. `createdEntities` is read from receipt events (authoritative); the others merely echo
your input. Predicted keys are valid only if no other create from that owner lands first (nonce). For a Run+Accept
or Request referencing a not-yet-created key, use `predictEntityKeys({owner,count:n})` and pass each `salt`.
`predictEntityKey({owner, nonce, salt, chainId})` is the pure low-level form (also exported); `pub.getEntityNonce(owner)`.

### Query (public client)
```ts
let page = await pub.select({ key: true, owner: true, creator: true, expiresAt: true, attributes: true, payload: true })
  .where(eq("project", "bhaiyaplease"), eq("type", "run"), gt("eta", u64(now)),   // varargs OR one array
         or(eq("dest_zone", "tdr5ru"), eq("dest_zone", "tdr5rv")))
  .ownedBy(addr)        // sugar for eq("$owner", addr(..)); also .createdBy(addr) ($creator)
  .limit(50)            // max 200
  // .atBlock(123n) .cursor(c)
  .fetch();
for (const e of page.entities) { e.key; e.attributes!.eta.value; e.toJson(); }
while (page.hasNextPage()) page = await page.next();   // or: for await (const e of builder) {...}
const raw = await pub.query("project = str('bhaiyaplease') AND type = str('run')", { limit: 50, atBlock: 1n }); // {entities, cursor, blockNumber}
const n = await pub.getEntityCount();    // total chain count, takes no filter
const one = await pub.getEntity(key);    // throws NoEntityFoundError (has .entityKey) if absent/expired
```
- `.where()` is ANDed. At least one filter is required (`InvalidPredicateError`); there is no "match all".
- Queryable system attrs: `$key $owner $creator $expiresAt` only. `$createdAt/$updatedAt/$contentType` return in
  results but CANNOT be filtered (throws). Store your own `at` u64 attr if you need to filter by time.
- Range ops (`gt/gte/lt/lte`) only on i32/u64/u256/dec; strings/addr/key/bytes32/bool are equality-only.
  `startsWith` is str only.
- Type must match on both sides: `eq("eta", 5)` asserts i32 and silently matches a u64 attr never. Use `u64(..)`.
- Pagination cursor is bound to a block snapshot; can expire (`QueryError.kind === "cursor"`): restart.

### watchEntityEvents (public client; returns an `unwatch()` function)
```ts
const unwatch = pub.watchEntityEvents({
  onEntityCreated: (e) => {},   // {type, entityKey, owner, expiresAt:bigint, creationFlags:{readonly,permissionlessExtension,raw}, blockNumber, transactionHash, logIndex}
  onEntityPatched: (e) => {},   // {entityKey, owner, ...ctx}   (no diff)
  onExpiryExtended: (e) => {},  // {entityKey, owner (NOT the extender), expiresAt}
  onOwnershipTransferred: (e) => {}, // {entityKey, previousOwner, newOwner}
  onEntityDeleted: (e) => {},   // {entityKey, owner}
  onEvent: (e) => {},           // all events, fires before the specific handler
  onError: (err) => {}, fromBlock: 123n, pollingInterval: 1000, // default 1000 ms (half block)
});
```
Events carry NO attributes/payload: re-fetch with `getEntity`. Expiry produces no event.

### Reading values
`entity.attributes[name]` is `{ type, value }`. `value`: `i32 -> number`, `u64/u256 -> bigint`, `dec -> string`
("1.5"; use `decUnits()` for bigint 1e18 scale), `str -> string`, `addr/key/bytes32 -> hex string`, `bool -> boolean`.
`createdAt/updatedAt/expiresAt` are **bigint block numbers** (not unix time). `owner/creator` are EIP-55 checksummed.
Payload is `Uint8Array`; `toText()` / `toJson()` exist only if `payload` was selected.
Attribute names: `^[A-Za-z][A-Za-z0-9._-]*$`, <=32 bytes, no `--`, case-sensitive, reserved words (`and or not true false
startswith exists typeof bool i32 u64 u256 dec bytes32 bytes str addr key`) rejected. `key` IS reserved; `type`, `project` are NOT.
`str` max 128 bytes. Max attrs 32, payload 128 KiB.

## Answers to the specific questions
**(a) create + changeOwnership of the same entity in one executeBatch:** Yes, expected to work. Confidence ~85%.
Evidence: `entity/operations.ts` documents the engine as "an ordered, atomic batch ... operation n+1 observes operation n's
effects"; the SDK always emits creates first, ownership changes last; `predictEntityKey` docs explicitly describe a later op
referencing a key minted earlier in the same tx (the shown example uses it as a `key` attribute, not as an ownership target).
Owner at transfer time is the creator, so the owner check passes; `readonly` entities may still be transferred (flags doc).
Remaining 15%: engine is a closed node, no test in the SDK does exactly create+transfer; verify on Tiramisu first thing.
Fallback if it reverts: two txs (createEntity, then changeOwnership), losing atomicity.
**(b) watchEntityEvents filter:** None server-side. Only `fromBlock` and `pollingInterval`. Internally viem `watchEvent` with
`address: 0x4400...0044` + event ABI. Filter client-side on `e.owner` / attributes after fetch. Polling over HTTP, no WS needed.
**(c) numeric reads:** typed per declared type: i32 number, u64/u256 bigint, dec string. Never hex to the caller.
(RPC sends u64/u256 as 0x QUANTITY; SDK decodes.) Block fields bigint. Do not `JSON.stringify` entities (bigint throws).
**(d) browser build:** Yes. dist has no `node:` imports; zlib path guarded by `typeof process`; esbuild browser bundle OK.
Needs `globalThis.crypto.getRandomValues` (fine in browsers). Vite may need `target: es2020+` for bigint literals.
**(e) access key / custom RPC:** Docs: "append the access key to the end of the RPC URL" (format not shown):
`http("https://rpc.tiramisu.db-chain.testnet.arkiv.network/<KEY>")`. Header alternative via viem:
`http(url, { fetchOptions: { headers: { "X-API-KEY": key } } })`. Both verified on chain (friction finding 17); core uses the header. WS: `webSocket(url)` works as transport but
watch uses polling anyway. WARNING: a key in a static PWA is visible to every visitor.

## Corrections to our initial assumptions
1. **`ne()` / `!=` EXISTS in the SDK** (`ne`, ComparisonOperator `!=`), but docs say the current network rejects it. Use
   `not(eq(...))`. We assumed "no `!=`": right for the network (the node rejects it), but the SDK API surface differs.
2. **`expiresIn` does not exist; param is `expires`**, and it must be an `ExpirationTime.*` object (no raw numbers/Date).
3. **Max attributes is 32, not 30** (`MAX_ATTRIBUTES = 32`). Payload 128 KiB confirmed.
4. **`bool` attribute type exists** (`bool(true)` or bare boolean); also `bytes` is system-only.
5. **Query start is `pub.select(...).where(...)`**; no `buildQuery()`. `.where` takes varargs or an array. Mutations live on
   the wallet client; reads (`select/query/getEntity/predictEntityKeys/watchEntityEvents`) only on the public client.
6. **System attrs:** queryable are only `$key $owner $creator $expiresAt`. `$createdAt` and `$contentType` are NOT
   filterable. `$expiresAt` is a block number (u64), not time. Need own `at`/`eta` attrs for time filters.
7. **Expiry semantics:** extension REPLACES the expiry (counted from now), must move it later. Durations are blocks at 2 s
   (fractions of 2 s rejected). For "run expires ETA + 10 min": compute `fromSeconds(eta - now + 600)` rounded to even.
8. **Batch order** in the SDK is creates, patches, deletes, extensions, ownershipChanges (as assumed). Result shape is
   `{txHash, createdEntities, patchedEntities, deletedEntities, extendedEntities, ownershipChanges}` (key arrays).
9. **Arkiv is not literally EVM-free on the wire**: writes are `writeContract` calls to `0x4400...0044` `execute(...)`,
   signed EVM txs paid in GLM gas. Wallets need faucet funds; MetaMask works. No user smart contracts (as assumed).
10. **predictEntityKeys** is `pub.predictEntityKeys({owner, count|salts})` returning `{key, salt}[]`: you MUST pass each
    `salt` into the matching create (default create salt is random). Easy to miss: the salt is required.
11. Event handlers confirmed; extra `onEvent`, `onError`, `fromBlock`, `pollingInterval`. `onExpiryExtended.owner` is the
    entity owner, not the extender. Expiry produces no event (as assumed).
12. Permissionless extension by a non-owner: key concern is gas (extender pays GLM); sybil/spam extension is possible.
13. Reading numbers: tagged `{type,value}` objects, not raw numbers: `e.attributes.eta.value`.

## Friction candidates (for friction.md; version 0.8.1 unless noted)
1. **Docs vs SDK on `ne`/`!=`:** SDK exports `ne()` and renders `x != i32(1)` without error; docs say network rejects it. A
   typed API offering an operator that the node rejects only at runtime. Expected compile/construct-time failure.
2. **Wallet client lacks read actions** (`getEntity`, `select`, `predictEntityKeys`): `wallet.predictEntityKeys` is a TS
   error ("Property does not exist"). Surprising since viem wallet clients extend public actions; forces two clients.
3. **`predictEntityKeys` returns `{key, salt}` but `createEntity` default salt is random:** if you forget `salt: p.salt` the
   key silently differs (no error); only detectable by comparing `createdEntities[i]` to the prediction.
4. **`executeBatch` result lists patched/deleted/extended/ownership keys by echoing input**, not from chain, so it can claim
   success on ops it did not verify; only creates are read from logs. Also no per-operation expiresAt in batch result
   (create/extend single calls return `expiresAt`, batch does not).
5. **`$createdAt` is returned but not filterable; `$expiresAt` is block-height not time.** No time-range queries without a
   user attr; no helper to convert block <-> unix (`getBlockTiming()` exists, undocumented in guides).
6. **`expires` rejects fractional-block durations** (`fromSeconds(3)` throws) and `fromDays` is approximate; `fromMonths`
   = 30 d, `fromYears` = 365 d; `ExpirationTime.permanent()` = block 2^64-1 (never expires, abuse risk for demo data).
7. **Bare-number defaults are type-sensitive:** `eq("eta", 5)` means i32; against a u64 attribute it matches nothing
   (no error). Silent empty result. Same for bigint -> u256.
8. **No "match everything" query:** `select().fetch()` with no where throws; `getEntityCount()` takes no filter. Paging a
   whole project still needs a sentinel `project=...` attr.
9. **Access key docs don't show URL format** (docs: "append to the end of the RPC URL", no example) and warn it leaks in
   browser. For a no-backend PWA that conflicts with the recommended path.
10. **Attribute name `key` is reserved, `type` is not, `project` is not;** error is only raised client-side at write/query
    construction. Reserved list is not in docs (only in `attr/names.ts`).
11. **Entity attributes come back as `{type,value}` wrappers; JSON.stringify of an Entity throws (bigint).** Needs a mapper.
12. `watchEntityEvents` events carry no attributes/payload; no filter; extender address unavailable in `ExpiryExtended`.
13. Package ships `bun` export condition first (`"bun": "./src/index.ts"`); fine for Vite/Node, but worth noting for Bun users.

## Open questions (need Tiramisu + funded key)
1. Does create + changeOwnership of the same new key in ONE batch succeed? (Primary risk for Receipt flow.)
2. Does the node reject `ne()` / `!=` with a clear error, and which `QueryError.kind`?
3. Exact access-key format (URL suffix vs header) and rate limits without a key; can browsers hit the RPC (CORS)?
4. Does `permissionlessExtension` extension by a non-owner succeed, and does a `readonly` entity accept extend + transfer?
5. Gas cost (GLM) per op/batch; faucet amount; does `waitForTransactionReceipt` latency (2 s blocks) feel acceptable?
6. Predicted key correctness: `predictEntityKeys` vs actual `createdEntities` for 2+ creates in one batch.
7. Exact on-chain expiry vs `expiresAt` returned (drift between build and inclusion), and when expired entities vanish from queries.
8. Query consistency: how soon after tx receipt is the entity visible via `select` (indexer lag)? `$expiresAt` filter behaviour.
9. Max batch size / gas limit; is `$creator` filter correct after transfer (creator stays, owner changes)?
10. `attributes` containing `u64` vs `i32` for `eta` in range queries across mixed writers.

### Partially answered (16 Oct, read-only probe against Tiramisu with an unfunded key)
- `getBlockTiming()` returns `currentBlockTime` in **unix seconds** and `blockDuration: 2` (seconds). Core's block→unix
  conversion (`time + (block − currentBlock) · duration`) relies on this.
- Public RPC without access key served `select('*')`, `$key`/`$expiresAt`/`$owner`/`$creator` filters, `getEntity`
  (missing key → `NoEntityFoundError`), and `atBlock` historical queries. Owner/creator come back EIP-55; core lowercases.
- Tiramisu carries steady third-party traffic (an indexer load generator creates entities every block), so the shared
  watcher resolves foreign `EntityCreated` keys continuously; it caps at 10 `get`/s. If backlog grows, batch-resolve.
- All write-side questions above remain open: `scripts/spike` (`pnpm --filter @bhaiya-please/spike spike`) answers them
  once `.env` has a funded `SEED_PRIVATE_KEY` (+ optional `VERIFIER_PRIVATE_KEY` for the two-wallet checks).
