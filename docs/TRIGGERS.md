# Arkiv Triggers: design spec (build contract)

**Arkiv Triggers is "Zapier for expiring data".** A trigger is an Arkiv entity that says "when an entity matching this query is created / patched / about to expire / expired / deleted, unless this other query has results, do this action". A worker network watches those queries, executes the actions, and writes a signed **firing receipt** back to Arkiv.

It is project-agnostic: any Arkiv app can use it. Bhaiya Please is the first client. It uses Triggers for:
- **push notifications**, replacing phones polling the chain;
- **trustless no-show evidence**, closing the "a no-show can't be proven after the run expires" limit in `arkiv/schema.md`.

This file is the contract three workstreams build against. If something here is wrong, fix it here first.

## 1. Entities (project tag `arkivtriggers`)

Every entity carries `project = str('arkivtriggers')` and `type = str(<type>)`.

### `trigger`: written by a subscriber (any wallet)

| Attribute | Type | Meaning |
|---|---|---|
| `watch_project` | str | project tag of the entities watched, e.g. `bhaiyaplease` |
| `watch_type` | str | entity type watched, e.g. `accept` |
| `on` | str | `created` \| `patched` \| `expiring` \| `expired` \| `deleted` |
| `action` | str | `push` \| `webhook` \| `attest` |
| `channel` | bytes32 | push/webhook: id of a delivery channel registered off-chain with a worker (never the endpoint itself); attest: zero |
| `worker` | addr | worker asked to run it (zero address = any worker) |
| `lead` | u64 | `expiring` only: seconds before `$expiresAt` to fire (default 120) |

Payload (JSON, zod-validated):

```ts
{
  match: QueryAst,          // core's ArkivPort QueryAst: { where: Predicate[]; owner?; creator? } — WITHOUT the project/type predicates (implied by watch_project / watch_type)
  unless?: {                // optional guard: fire only if this query returns ZERO rows when evaluated
    project: string; type: string; where: Predicate[]; owner?: Address; creator?: Address;
  };
  label?: string;           // push title, <= 80 chars
  body?: string;            // push body, <= 200 chars; may contain {placeholders} filled from the matched entity's attributes
  href?: string;            // deep link path in the client app, e.g. /request/0x…
  attester?: string;        // attest only: plugin id, e.g. 'bhaiyaplease.noshow'
  params?: Record<string, string>; // plugin params
}
```

Flags: not readonly (the owner can patch it or delete it to unsubscribe). Expiry: chosen by the subscriber. Bhaiya Please sets it to the watched subject's lifetime, so subscriptions clean themselves up through Arkiv expiry with no unsubscribe job.

### `firing`: written by a worker (the signed receipt)

| Attribute | Type | Meaning |
|---|---|---|
| `trigger` | key | the trigger that fired |
| `entity` | key | the watched entity that caused it |
| `event` | str | the `on` value |
| `outcome` | str | `delivered` \| `failed` \| `attested` \| `skipped` |
| `at` | u64 | unix seconds |
| `block` | u64 | block the condition was evaluated at (`unless` included), so anyone can re-check it with an `atBlock` query |

Payload: `{ detail?: string; attestation?: EntityKey }`. Readonly, expires after 30 days. `$creator` is the worker: the receipt is the worker's signed claim "I evaluated this at block B and did X".

**Idempotency:** a worker fires a given `(trigger, entity, event)` at most once. Before acting it checks for an existing `firing` with those three attributes (by any worker). Several workers may run; duplicates are bounded to a race window and are harmless (push dedupes by the same id).

## 2. Delivery channels (off-chain, never on chain)

The worker HTTP API:

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{ ok, worker: address, triggers: n, uptime }` |
| `GET /vapid` | `{ publicKey }` for Web Push |
| `POST /channels` | body `{ kind: 'webpush' \| 'expo' \| 'webhook', target, owner, issuedAt, signature }`. `target` is a PushSubscription JSON, an Expo push token, or an https URL. `signature` is EIP-191 `personal_sign` by `owner` over `arkiv-triggers channel\n<kind>\n<sha256(target)>\n<issuedAt>` (`issuedAt` within ±10 min). Returns `{ channel: 0x<32 random bytes> }`. Re-registering the same `(owner, target)` returns the same channel. |
| `DELETE /channels/:id` | signed the same way; removes it |
| `GET /firings?owner=0x…&since=unix` | recent firings for that owner's triggers (convenience for clients; the source of truth is the chain) |

Rule: a push/webhook trigger is executed only if `trigger.$creator === channel.owner`. Knowing someone's channel id lets you nothing.

## 3. Engine semantics (worker)

- **Trigger set:** every 30 s, query live `trigger` entities, filtered to `worker = <me>` or `worker = 0x0`.
- **Watching:** group triggers by `(watch_project, watch_type, match)`. Each distinct watch is ONE Arkiv query per poll tick, shared by all subscribers.
- **Poll tick:** default 10 s. Diff each watch's result against the previous tick:
  - new key → `created`;
  - `$updatedAt` / `$lastModifiedAt` changed → `patched`;
  - `expiresAt - now <= lead` → `expiring` (once);
  - key gone with `expiresAt <= now` → `expired`;
  - key gone before its expiry → `deleted`.
  The first tick for a new watch only primes it: no historical firings, except `expiring` and `expired`, which are evaluated from the first tick on.
- **`unless`:** evaluated at the current head block. Fire only if it returns 0 rows. Record the block in the firing.
- **Actions:**
  - `push`: look up the channel and send via Web Push (VAPID) or the Expo push API. Payload `{ title: label, body (filled), href, trigger, firing }`.
  - `webhook`: POST JSON `{ trigger, entity, event, block, at, attributes }`. 5 s timeout, no retries beyond one.
  - `attest`: run a registered plugin `(port, ctx) => CreateSpec | null`. If non-null, the worker writes it and records `attestation` in the firing payload.
- **Receipts:** firings are written in batches (`executeBatch`, ≤ 20 creates per tx) at most every 5 s.
- **Persistence:** channels, seen state and the last-tick snapshot live in a JSON file (`TRIGGERS_DATA_DIR`), so a restart neither re-fires nor loses channels.
- **Cost model:** one worker query per distinct watch every 10 s replaces every subscriber's phone polling the same data.

## 4. Bhaiya Please plugin: `bhaiyaplease.noshow`

- **Trigger:** created by the resident when their request is accepted: `watch_type = accept`, `on = expiring` (lead 90 s), `match = { where: [request = key(<request>)] , creator: <runner> }`, `unless = { project: 'bhaiyaplease', type: 'delivery', where: [request = key(<request>)], creator: <runner> }`, `action = attest`, `attester = 'bhaiyaplease.noshow'`.
- **The plugin** calls core `buildNoShowEvidence(port, 'bhaiyaplease', requestKey)`. It returns a `noshow` CreateSpec only if, at the current block:
  - a valid accept by the run's runner exists for the request;
  - no delivery exists;
  - the run's ETA has passed.
- **Core entity `noshow`** (project `bhaiyaplease`, readonly, 180 d):
  - Attributes: `request` (key), `run` (key), `rider` (addr), `accept` (key), `block` (u64), `at` (u64).
  - Payload: `{}`.
- **Verification is trustless:** `verifyNoShow(noshow)` re-reads at `block` with `atBlock`. It checks the request exists, the accept by rider exists and is valid, no delivery exists, and `block`'s time is ≥ the run's ETA. It also fails as `delivered_later` if the rider has since recorded a valid delivery for the request, so a late handoff cancels a no-show. Duplicate evidence is harmless: the earliest valid one counts. The worker is not trusted: anyone could write the same evidence, and only re-verification counts.
- **Complaints:** a `no_show` complaint counts toward reputation only if a verified `noshow` exists for its request (the existing rule for other reasons stays: they need a delivery).
- **Profile:** `noShows30d` and the list are shown on profiles.

## 5. Bhaiya Please client usage (app)

The app talks to a worker at `EXPO_PUBLIC_TRIGGERS_URL` (and its address `EXPO_PUBLIC_TRIGGERS_WORKER`, or zero for any).

- **Settings → Notifications → "Push to this phone":** registers a service worker (`public/sw.js`, web) or gets an Expo push token (native), signs the channel registration with the account key, and stores the channel id device-locally.
- **Triggers the app creates (batched into one write after the action that needs them; each expires with its subject):**

  | When | Resident triggers | Runner triggers |
  |---|---|---|
  | Request sent | `accept` created for my request → push "accepted" · `run` patched with `at_gate` for that run → push "at the gate" · `delivery` created for my request → push "handed over" · `decline` created → push "declined" | |
  | Request accepted (seen) | `bhaiyaplease.noshow` attest trigger (above) | |
  | Run started | | `request` created on my run → push "new request" · my run `expiring` (lead 300) → push "run ending" |
  | Notify me on (B1) | `run` created with `dest_zone = my society` → push "someone is heading here" (expires in 24 h, renewed on app open) | |

- **The sandbox (mock core)** runs the engine IN the browser (an in-page worker over the mock chain port). Triggers fire as in-app notifications, so the demo works with no server.
- **UI:**
  - Notifications show "via Arkiv Trigger" with a link to the firing receipt.
  - Settings shows active triggers (list and delete).
  - Report a problem offers "Runner didn't show up" when a verified `noshow` exists.
  - Profiles show no-shows.

## 6. Packages

- `packages/triggers` (`@arkiv-triggers/core`): codec (trigger and firing), client helpers (`buildTrigger`, `listMyTriggers`, `registerChannel`), engine (pure TS over core's `ArkivPort`; runs in Node and in the browser), action interfaces and plugin registry, tests.
- `packages/triggers-worker` (`@arkiv-triggers/worker`): Node service with the HTTP API, Web Push, Expo push, webhook, JSON persistence, `.env` config, Dockerfile and `render.yaml`. Run it with `pnpm triggers:worker`.
- Core exposes `arkivPort(): ArkivPort` on the BhaiyaPlease instance for companion protocols, plus `buildNoShowEvidence(port, project, requestKey)`, `verifyNoShowEvidence`, `verifyNoShow`, `getNoShowsFor`, `getNoShowForRequest`. The subpath `@bhaiya-please/core/port` exports the port types, `createArkivAdapter` and attribute helpers `strV/u64V/i32V/addrV/keyV/bytes32V`. On the mock, `createMockPort({ address, shareWith })` or `mock.dev.port(address)` gives a worker its own wallet on the same chain.
