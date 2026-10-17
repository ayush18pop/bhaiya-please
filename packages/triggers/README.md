# Arkiv Triggers: Zapier for expiring data

Arkiv entities expire. Apps built on them want to know when something **appears**, **changes**, is **about to expire**, **has expired** or **was deleted**, and want to react: notify a phone, call a webhook, or write evidence before the facts disappear.

Without a shared service, every client polls the chain for the same data. Arkiv Triggers turns this into a protocol:

- A **trigger** is an Arkiv entity. It says: "when an entity matching this query is created / patched / expiring / expired / deleted, unless this other query has results, do this action".
- A **worker** watches triggers, runs **one query per distinct watch**, executes the actions, and writes a signed **firing receipt** back to Arkiv.

Triggers are project-agnostic: any Arkiv app can use them. Bhaiya Please is the first client. It uses them for push notifications and for trustless no-show evidence.

| Package | What it is |
|---|---|
| `@arkiv-triggers/core` (this package) | Codec, client helpers and the engine. Pure TS over core's `ArkivPort`, so it runs in Node, browsers and React Native. |
| `@arkiv-triggers/worker` (`packages/triggers-worker`) | Node service: HTTP API, Web Push, Expo push, webhooks, JSON persistence. Runs the engine against the real chain. |

The design contract is [`docs/TRIGGERS.md`](../../docs/TRIGGERS.md).

---

## 1. Entities (project tag `arkivtriggers`)

Every entity carries `project = str('arkivtriggers')` and `type = str(<type>)`.

### `trigger`: written by a subscriber (any wallet)

| Attribute | Type | Meaning |
|---|---|---|
| `watch_project` | str | Project tag of the watched entities, e.g. `bhaiyaplease`. |
| `watch_type` | str | Entity type watched, e.g. `accept`. |
| `on` | str | `created` \| `patched` \| `expiring` \| `expired` \| `deleted` |
| `action` | str | `push` \| `webhook` \| `attest` |
| `channel` | bytes32 | push/webhook: the id of a channel registered with a worker (never the endpoint itself). attest: zero. |
| `worker` | addr | The worker asked to run it. Zero address = any worker. |
| `lead` | u64 | `expiring` only: seconds before `$expiresAt` to fire (default 120). |

The payload is JSON, zod-validated by every reader:

```ts
{
  match: { where: Predicate[]; owner?: Address; creator?: Address }, // core QueryAst, without project/type
  unless?: { project, type, where, owner?, creator? },                // fire only if this returns 0 rows
  label?: string,                // push title, <= 80 chars
  body?: string,                 // push body, <= 200 chars, {placeholders} filled from the entity's attributes
  href?: string,                 // deep link: an app path "/…" or an https URL
  attester?: string,             // attest only: plugin id, e.g. 'bhaiyaplease.noshow'
  params?: Record<string,string> // plugin params (<= 16 entries)
}
```

`u64` predicate values travel as decimal strings in JSON and decode back to `bigint`.

Other limits:
- at most 16 predicates per query, with nested `or` counted;
- `or` nests at most 3 levels deep;
- string values are at most 128 bytes;
- the payload is at most 8 KB;
- `lead` is at most 30 days.

The owner can patch a trigger or delete it to unsubscribe. The subscriber chooses its expiry. Set it to the watched subject's lifetime and subscriptions clean themselves up, with no unsubscribe job.

### `firing`: the worker's signed receipt

| Attribute | Type | Meaning |
|---|---|---|
| `trigger` | key | The trigger that fired. |
| `entity` | key | The watched entity that caused it. |
| `event` | str | The `on` value. |
| `outcome` | str | `delivered` \| `failed` \| `attested` \| `skipped` |
| `at` | u64 | Unix seconds. |
| `block` | u64 | The head block the condition (including `unless`) was evaluated at. Anyone can re-check it with an `atBlock` query. |

Payload: `{ detail?: string; attestation?: EntityKey }`. Receipts are readonly and expire after 30 days. `$creator` is the worker, so a receipt is the worker's signed claim: "I evaluated this at block B and did X".

---

## 2. Delivery channels and the security model

Push endpoints, Expo tokens and webhook URLs **never go on chain**. A subscriber registers them with a worker over HTTP and receives an opaque 32-byte channel id. The trigger references only that id.

The registration is signed with EIP-191 (`personal_sign` / viem `signMessage`) by the owner wallet:

```
arkiv-triggers channel\n<kind>\n<sha256(target)>\n<issuedAt>
```

- `kind` is `webpush`, `expo` or `webhook`.
- `sha256` is 0x-prefixed lowercase hex of the UTF-8 target string.
- `issuedAt` is unix seconds and must be within ±10 minutes of the worker's clock.
- Unregistering signs the same message with kind `delete` and the channel id as the target.

`channelMessage()` builds this string, so clients never hand-format it.

Security rules:
- **A push or webhook trigger runs only if `trigger.$creator === channel.owner`.** Knowing someone's channel id gets you nothing: the worker records the firing as `skipped` ("channel owner mismatch").
- Re-registering the same `(owner, target)` returns the same channel id.
- Each owner can have at most 20 channels.
- The mutating endpoints are rate-limited per IP.
- Webhook targets must be `https` URLs and must not point at localhost or private IP literals.
- Dead channels are removed automatically: Web Push 404/410, Expo `DeviceNotRegistered`, webhook 404/410.
- A trigger pinned to a specific `worker` trusts only that worker's receipts for idempotency, so nobody can suppress it by forging receipts. Any-worker triggers accept a receipt by anyone (see limitations).

---

## 3. Engine semantics

`createTriggerEngine()` implements the following.

- **Trigger set:** every `triggerRefreshMs` (30 s), the engine queries live `trigger` entities with `worker = me OR worker = 0x0`. Malformed triggers are dropped.
- **Watches:** triggers are grouped by `(watch_project, watch_type, match)`. The `watchId` is stable and ignores predicate order. Each watch is **one query per tick** (`pollMs`, default 10 s), shared by every subscriber.
- **Diff** against the previous snapshot of the watch:
  - **New key** created at or after the trigger → `created`. Entities older than the trigger never fire, so there are no historical firings. A trigger picked up late still fires for entities created after it.
  - **New key** created before the previous tick (an older entity that started matching after a patch) → `patched`. This is how "run got `at_gate`" works: match `[$key = run, at_gate >= 1]` with `on = patched`.
  - **Attributes, payload or owner changed** → `patched`.
  - **`expiresAt - now <= lead`** → `expiring`. This is evaluated from the first tick on.
  - **Key gone, with `expiresAt <= now`** → `expired`.
  - **Key gone before its expiry, and `get()` confirms it no longer exists** → `deleted`. An entity that only stopped matching is dropped silently.
- **Idempotency:** each `(trigger, entity, event)` fires at most once. The engine checks three things:
  - a local seen set, which is persisted;
  - an existing `firing` with those three attributes on chain;
  - a dedupe within the tick.
- **`unless`** is evaluated at the head block, and that block is recorded in the receipt. A suppressed firing writes no receipt and costs no gas.
- **Actions:**
  - `push` → `PushSender` with `{ title, body, href, trigger, firing, entity, event }`. `firing` is `keccak256(trigger|entity|event)`, the same id across workers, so clients can dedupe.
  - `webhook` → `WebhookSender` POSTs `{ trigger, entity, event, block, at, attributes, firing }`. The timeout is 5 s, with one retry on network errors and 5xx.
  - `attest` → `plugins[attester](port, ctx)` returns a `CreateSpec` or `null`. The engine writes the spec **in the same batch** as the receipt and records its key as `attestation`, using predicted keys. If key prediction is unavailable, the engine writes the attestation first.
- **Receipts** are written in batches of at most 20 creates per tx, at most every `flushMs` (5 s). Failed writes are retried, up to 5 attempts.
- **Isolation:** a bad trigger, a failing watch query, a throwing plugin or a dead push service affects only itself. Transient read errors are retried on the next tick, up to 5 times.
- **Persistence:** a pluggable `EngineStore` (`load` / `save` of JSON) holds the snapshots, the seen set and the retries. `createMemoryStore()` is provided, and the worker uses a file.

### Cost model

Without Triggers, N clients each poll the chain for the same subject: N × (queries per minute). With Triggers, one worker issues **one query per distinct watch per tick**, plus one receipt lookup when something actually fires. A thousand residents watching "runs heading to my society" for 20 societies cost 20 queries every 10 s instead of 1 000 phones polling. Gas is paid only for receipts and attestations.

---

## 4. Using it from an app

```ts
import { buildTriggerSpec, pred, val, channelMessage, registerChannel, webPushTarget,
         listMyTriggers, deleteTriggers, listFiringsFor, fetchVapidKey } from '@arkiv-triggers/core';

// 1. Register a delivery channel with a worker (once per device).
const sub = await registration.pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey: (await fetchVapidKey(WORKER_URL)).publicKey });
const target = webPushTarget(sub);
const issuedAt = Math.floor(Date.now() / 1000);
const signature = await account.signMessage({ message: channelMessage('webpush', target, issuedAt) });
const { channel } = await registerChannel(WORKER_URL, { kind: 'webpush', target, owner: account.address, issuedAt, signature });

// 2. Subscribe: a trigger is just an entity you write (batch it with the action that needs it).
const spec = buildTriggerSpec({
  watchProject: 'myapp', watchType: 'order', on: 'created', action: 'push', channel,
  match: { where: [pred.str('shop', 'lakshmi-stores')] },
  label: 'New order', body: 'Order for {item}', href: '/orders',
  expiresInSeconds: 24 * 3600,
});
await port.write((w) => w.batch({ creates: [spec] }));

// 3. Manage.
await listMyTriggers(port, me);  await deleteTriggers(port, [key]);  await listFiringsFor(port, me);
```

### Example triggers

Generic:
- **Expiring lease:** `watch_type = lease`, `on = expiring`, `lead = 3600`, `match = [$key = <lease>]`, `action = webhook`. This calls your renewal service an hour before a lease lapses.
- **Watch a feed:** `watch_type = listing`, `on = created`, `match = [category = 'bikes', price <= 5000]`, `action = push`.
- **Deletion audit:** `on = deleted`, `match = [$owner = <org wallet>]`, `action = webhook`.

Bhaiya Please (see `apps/mobile/lib/triggersProtocol.ts`):
- **Request accepted:** `accept` `created` with `match = [request = key(r)]`, `creator = runner`. Push "accepted".
- **At the gate:** `run` `patched` with `match = [$key = run, at_gate >= 1]`. Push "at the gate".
- **Someone heading here:** `run` `created` with `match = [dest_zone = <my society>]`. Push, with a 24 h expiry.
- **No-show proof:** `accept` `expiring` (lead 90), `unless delivery(request) by runner`, `action = attest`, `attester = 'bhaiyaplease.noshow'`. The worker writes a core `noshow` entity that anyone can verify at its block.

### In-page engine (sandbox)

```ts
const channels = createMemoryChannelDirectory();
const { id } = channels.register('webpush', me);              // use as the trigger's channel
const engine = createTriggerEngine({
  port: mockCore.dev.port(SANDBOX_WORKER), workerAddress: SANDBOX_WORKER,
  actions: { channels, push: createCallbackPushSender((_c, m) => showToast(m)) },
  onFiring: (f) => …, onReceipt: (r) => …,
});
engine.start();   // or call engine.tick() yourself
```

---

## 5. Writing a plugin

```ts
import type { AttestPlugin } from '@arkiv-triggers/core';

export const paidLate: AttestPlugin = async (port, ctx) => {
  // ctx: { trigger, entity (as last seen), event, block (head), now, params }
  const invoice = await port.get(ctx.entity.key);
  if (!invoice || invoice.attributes.paid) return null;  // nothing to attest
  return {                                                // written by the worker in the receipt's batch
    attributes: { project: val.str('myapp'), type: val.str('late'), invoice: val.key(ctx.entity.key), block: val.u64(ctx.block) },
    payload: '{}', readonly: true, permissionlessExtension: false, expiresInSeconds: 180 * 86400,
  };
};
createTriggerEngine({ …, plugins: { 'myapp.late': paidLate } });
```

Rules:
- Make evidence **verifiable without trusting the worker**: record the block, and let readers re-check it with `port.at(block)`.
- Return `null` when the facts do not hold.
- Throw only for transient errors (`retryable` / `NETWORK`). The engine retries those on the next tick.

---

## 6. Running a worker

```sh
pnpm triggers:vapid             # once: prints TRIGGERS_VAPID_* lines for .env (Web Push)
pnpm triggers:worker            # reads the repo-root .env; prints the worker address
pnpm fund 0x<worker address>    # receipts cost gas
curl localhost:8787/health
```

### Environment

| Variable | Default | |
|---|---|---|
| `TRIGGERS_WORKER_PRIVATE_KEY` | derived from `SEED_PRIVATE_KEY` (persona `triggers-worker`) | Worker wallet. Test wallets only. |
| `ARKIV_RPC_URL`, `ARKIV_ACCESS_KEY` | Tiramisu public RPC | If the key's quota runs out, the core adapter falls back to anonymous reads. |
| `TRIGGERS_PORT` (or `PORT`) | 8787 | |
| `TRIGGERS_POLL_MS` | 10000 (min 5000) | One query per watch per tick. |
| `TRIGGERS_REFRESH_MS` | 30000 | Trigger-set refresh interval. |
| `TRIGGERS_DATA_DIR` | `./.triggers-data` | `worker.json` (mode 0600): channels, engine state, firing log. |
| `TRIGGERS_ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins. Set your app's origin in production. |
| `TRIGGERS_VAPID_PUBLIC` / `_PRIVATE` / `_SUBJECT` | none | Without them, `/vapid` returns 503 and Web Push is off. |
| `TRIGGERS_LOG_LEVEL` | info | |
| `TRIGGERS_ALLOW_INSECURE_WEBHOOKS` | off | Dev only: allows `http://` and private hosts. |

Logs are JSON lines. Private keys, the access key and the VAPID private key are redacted. Channel targets are never logged.

### HTTP API

| Endpoint | |
|---|---|
| `GET /health` | `{ ok, worker, triggers, watches, uptime, channels, pendingReceipts, lastTickAt, firedTotal, balance }` |
| `GET /vapid` | `{ publicKey }` |
| `POST /channels` | `{ kind, target, owner, issuedAt, signature }` → `{ channel }` |
| `DELETE /channels/:id` | `{ owner, issuedAt, signature }` → `{ ok: true }`. Returns 404 if the channel is missing or not yours. |
| `GET /firings?owner=0x…&since=unix` | `{ firings }` for that owner's triggers, from the worker's 7-day log. The chain is the source of truth. |

### Deploying

Browsers allow Web Push and service workers only from secure origins. Put the worker behind **HTTPS**, then set `EXPO_PUBLIC_TRIGGERS_URL` and `EXPO_PUBLIC_TRIGGERS_WORKER` in the app.

- **Render:** use the Blueprint in `packages/triggers-worker/render.yaml`. It sets up a Docker web service with health check `/health` and a 1 GB persistent disk at `/data`. Set the secrets in the dashboard.
- **Fly.io:**
  - `fly launch --dockerfile packages/triggers-worker/Dockerfile --no-deploy`
  - `fly volumes create triggers_data --size 1`
  - In `fly.toml`, mount the volume at `/data` and set `internal_port = 8787`.
  - Run `fly secrets set TRIGGERS_WORKER_PRIVATE_KEY=… TRIGGERS_VAPID_PRIVATE=…`, then `fly deploy`.
- **Any VM:**
  - Run `docker build -f packages/triggers-worker/Dockerfile -t arkiv-triggers-worker .` from the repo root.
  - Run `docker run -d -p 8787:8787 -v triggers-data:/data --env-file .env arkiv-triggers-worker`.
  - Put Caddy or nginx in front for TLS.

Run one instance per data directory. For redundancy, run several workers, each with its own wallet and disk. Receipts make them cooperate: whoever fires first, the others see the receipt and skip.

---

## 7. Limitations

- **Polling, not streaming:** firing latency is up to `pollMs` (10 s), plus up to `triggerRefreshMs` (30 s) for a brand-new trigger. `expiring` with `lead` below `pollMs` can be missed.
- **`created` vs `patched` for newly matching keys** uses `$createdAt`, with 6 s of slack, because Arkiv exposes no `$updatedAt` on reads. `patched` fires at most once per (trigger, entity). Write `match` so that the patch you care about makes the entity match, such as `at_gate >= 1`.
- **Exactly-once is best effort.** Two workers racing on an any-worker trigger can both fire within one tick. Pushes carry the same `firing` id for client-side dedupe. Any-worker triggers also accept receipts written by anyone, so pin `worker` for anything that matters.
- **Workers are trusted for delivery, not for facts.** A worker can lie about a push it sent. Attestations must be independently verifiable (see `bhaiyaplease.noshow`).
- **Gas:** the worker pays for every receipt, including `skipped` ones caused by misconfigured triggers that name it. Any-worker triggers it cannot serve (an unknown channel or plugin) are ignored at no cost.
- **Webhook SSRF guard** checks literal hosts only. A DNS name that resolves to a private address is not caught. Run the worker on a network without sensitive internal services.
- **Large watches:** a watch is capped by the adapter's 2 000-row pagination limit. Keep `match` selective.
