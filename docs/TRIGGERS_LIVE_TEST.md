# Arkiv Triggers: live test record (Tiramisu, 17 Oct 2026)

This is what we ran on the **real Arkiv Tiramisu testnet** (chain id 7738577) to prove Arkiv Triggers end to end: a resident and a runner in two separate browser profiles, the real-chain web build, and the Triggers worker on its own funded wallet. Every hash and key below is a public testnet identifier that can be checked on the explorer (`tiramisu.explorer.arkiv.network`). No private key appears here.

Design and contract: [`TRIGGERS.md`](TRIGGERS.md). Protocol package: [`packages/triggers/README.md`](../packages/triggers/README.md). Worker: [`packages/triggers-worker/README.md`](../packages/triggers-worker/README.md).

## Setup

| Item | Value |
|---|---|
| Branch / commit | `feat/arkiv-triggers` @ `c3e62ea` |
| Web build | `EXPO_PUBLIC_CORE=real`, `EXPO_PUBLIC_TRIGGERS_URL=http://localhost:8787`, `EXPO_PUBLIC_TRIGGERS_WORKER=0x2da1bea8ec53f4dc01720f64cdc29ce3a5028ba0` |
| Worker | `pnpm triggers:worker` with `TRIGGERS_POLL_MS=30000`, `TRIGGERS_REFRESH_MS=60000`, VAPID keys from `pnpm triggers:vapid` |
| Worker wallet | `0x2da1bea8ec53f4dc01720f64cdc29ce3a5028ba0` (persona `triggers-worker`, derived from the seed key, funded with `pnpm fund`: 0.0197 GLM at start) |
| Resident ("Honey Falcon") | `0x955D07c8Ae422BaC95Ed23F20a4F17Da53b81c17`, society Lotus Heights |
| Runner ("Copper Rhino") | `0xfC2F97960292EC61C15C91E685b7d100d8d56D06`, New level |
| Browser | Headless Chromium (two persistent profiles), driven step by step |

## Timeline (UTC)

| Time | Step | Result |
|---|---|---|
| 14:44:46 | Worker starts | `/health` ok. It loaded the push channel saved on disk from the earlier registration. |
| earlier | Resident: Settings → Notifications → **Turn on push** | Service worker registered, `PushManager.subscribe` with the worker's VAPID key, channel message signed by the resident's account key. The worker verified the EIP-191 signature and stored it (`channels: 1`). |
| ~14:47 | Runner: **Start a run**, Lotus Heights, 30 min, **Go live** | Run on chain in **13 s**. The runner has no push channel in this profile, so the app correctly skipped the runner-side alerts. |
| ~14:48 | Resident: Ask → Chai Patti Provisions → Eggs, 6 → Review → **Send request** | Request `0x7a251d6d…a177` on chain in **17 s**. The app then wrote the 4 resident alerts in one batch (below). |
| ~14:49 | Worker refresh | `triggers: 4, watches: 4`. Settings → "Active alerts" lists Runner at the gate, Handoff saved, Request accepted and Request declined, each "ends in 2 h" with the request. |
| ~14:49:57 | Runner: **Accept** | Accept entity `0x271499b1…5e4e` created. |
| 14:50:09 | Worker fires *Request accepted* (`created`) | Push "Copper Rhino accepted your request · Eggs, 6. Open to see when they arrive." **outcome `delivered`**: the browser push service accepted it, **12 s** after the accept. |
| 14:50:22 | Worker writes the receipt | Firing receipt entity `0x5a877e93…dbb8`, tx `0x503335c60b2e87894f9637d0f4eba76bc15a1d1c05381768fe1f25a35495ac33`, evaluated at block **699419**. |
| — | Resident: Notifications | The row reads "Copper Rhino accepted your request · Eggs, 6 from Chai Patti Provisions. Arriving in 26 min." with **via Arkiv Trigger**. |
| ~14:51:07 | Runner: **I'm at the gate** | Run `0xcd52c86b…f5f` patched with `at_gate`. |
| 14:51:19 | Worker fires *Runner at the gate* (`patched`) | **outcome `delivered`**, **12 s** after the tap. |
| 14:51:32 | Worker writes the receipt | tx `0x758ed870e1ac3d4aeec73e8d6945b095257283cfc66f79685fa765a58414b9ee`. |

Keys involved:

| What | Key |
|---|---|
| Run | `0xcd52c86bcb2adc6d44e8855035fb39440b7fdcd483731437e6b5ab894cd4af5f` |
| Request | `0x7a251d6de02a36700370407d49865734e007160beeb44e1620c759d3be40a177` |
| Accept | `0x271499b1bc6147782a0c60547eead4e5550bc6bb14e9b0941c5f6d8a36395e4e` |
| Trigger "Request accepted" | `0xa760c9e1aaed315220b49e8b6e478c2ff481c3595b7dd81602d3a5421a9c311d` |
| Trigger "Runner at the gate" | `0xfc847f5abc9f167854ae95cb454c2708b787d2d9b3d69f78e3523382240f9787` |
| Firing id (stable, sent in the push) | `0x7be1acb9912e9e304a158cbe0193954b27dd2006562018087e8fecf1ca2f73e6` |
| Firing receipt entity | `0x5a877e938499cb5c2af24eb461c19ce87520239fa01eb7608e7b3c26086fdbb8` |

Worker `GET /firings?owner=<resident>` returned that firing with `outcome: delivered`, `block: 699419`, the label, body, deep link `/request/0x7a25…` and the receipt key. That is the same data the app shows.

An earlier smoke run fired a probe trigger with an unknown channel and wrote a `skipped` receipt (tx `0x8a1f…3e38`, block 691746, `$creator` = worker), which shows that refusals are receipted too.

## What this proves

1. **Subscriptions are Arkiv entities.** The resident's alerts are `trigger` entities in project `arkivtriggers`, created and owned by the resident's wallet, and they expire with the request (no unsubscribe job).
2. **One worker watches for everyone.** The worker ran one query per distinct watch every 30 s. The resident's phone did not poll for "accepted" or "at the gate".
3. **Push without exposing anything.** The push endpoint never touched the chain. The channel id on chain is useless without the resident's signature, because the worker only delivers when `trigger.$creator == channel.owner`.
4. **Every action is receipted.** The worker's own wallet signs a `firing` entity with the block it evaluated at, so anyone can audit what it did and when.
5. **Latency is about one poll tick.** 12 s accept → push and 12 s gate → push, with a 30 s tick.

## Not run live (covered elsewhere)

- **No-show proof** needs a real run to expire (about 40 min). It is covered by:
  - worker tests: `packages/triggers-worker/test/noshow.test.ts`, including the late-window case where no tick lands inside the 90 s lead and the evidence is still built at a block before expiry and verifies;
  - core tests: `packages/core/test/noshow.test.ts`;
  - the sandbox, where the in-browser engine writes the proof and the report flow offers "Runner didn't show up".
- **Seeing the notification pop up**: the test browser is headless. "Delivered" means the push service accepted the message; on a real phone or desktop browser it shows as a system notification.
- Expo push for native apps, and webhooks (unit-tested only).

## Incidents during the test (and fixes)

| Incident | Cause | Fix (committed) |
|---|---|---|
| Earlier keys returned `429 QUOTA_EXCEEDED`, and anonymous reads `ANON_COST_LIMITED` | Each `arkiv_query` costs about 100 cost units. An idle app tab made **536 calls/min**. Most of them were retries stacked three deep (viem → core → React Query) once the quota ran out, plus a global event watcher paying a read per foreign entity on the shared testnet. | Read cost cut to **10/min** (resident) and **2/min** (runner). Quota errors are `QUOTA_EXHAUSTED` and never retried. The key falls back to anonymous, then a 60 s breaker. No global watcher in real mode. (`3c47364`) |
| The shop picker said "the run ended" while the run was live | Failed reads were treated as empty or missing | Screens show "Couldn't check the network right now · Try again" (`12e4dc7`, also on `feat/product-ui`) |
| A worker outage could miss the 90 s no-show window | `expiring` only fired while the entity was live | A late `expiring` is evaluated at the last block before expiry, and the proof still verifies (+2 tests) (`c3e62ea`) |

## Reproduce

```bash
git checkout feat/arkiv-triggers && pnpm install
pnpm triggers:vapid >> .env            # once; keep the private key secret
pnpm triggers:worker                   # prints the worker address
pnpm fund 0x<worker address>           # gas for receipts
# web build pointed at the worker (separate terminal)
cd apps/mobile
EXPO_PUBLIC_CORE=real EXPO_PUBLIC_TRIGGERS_URL=http://localhost:8787 \
EXPO_PUBLIC_TRIGGERS_WORKER=0x<worker address> \
EXPO_PUBLIC_ARKIV_ACCESS_KEY=<web key> npx expo start --web
```

Then follow [`TESTING.md`](TESTING.md) §3b with two browser windows. Turn on **Profile → Settings → Notifications → Push to this phone** in the resident window first. Watch `curl localhost:8787/health` (`triggers`, `watches`, `firedTotal`) and `curl "localhost:8787/firings?owner=0x<resident>"`.
