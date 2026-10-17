# Submission and deploy guide (Arkiv Global Tour Stop)

**Deadline: Sat 18 Oct 2026, 23:59 London time (BST) = 22:59 UTC = 04:29 IST Sun 19 Oct.** Late entries are not accepted. At the deadline the organisers record the repo's commit SHA and judge that commit; **rewriting history after the deadline disqualifies the entry**. Deployments must stay up through judging (19–22 Oct) until winners are announced on 23 Oct.

Canonical rules: https://github.com/Arkiv-Network/global-tour-stop-pre-devcon (`RULES.md`, `docs/scoring-rubric.md`, `docs/submission-checklist.md`). As of 17 Oct, Bhaiya Please is **not yet in the Devfolio projects list**: the entry still has to be created.

---

## 0. Decide what you submit (do this first)

| Branch | Contains | Recommendation |
|---|---|---|
| `feat/product-ui` | New UI on the design system, 98% read reduction, quota-safe core, read-error fix | Safe baseline |
| `feat/arkiv-triggers` | Everything above **plus** Arkiv Triggers (protocol, worker, push alerts, provable no-shows), friction findings 21–23, these docs | **Submit this.** It is the stronger "Why Arkiv" and "How you use Arkiv" story and closes a documented limit (no-shows). |

The judged commit must be on the default branch that judges open, so merge the chosen branch into `main` and push **before** the deadline:

```bash
git checkout main && git pull
git merge --no-ff feat/arkiv-triggers   # or feat/product-ui
pnpm install && pnpm test && pnpm typecheck
git push origin main
```

Then deploy from `main` (section 2). After the deadline, do not force-push, rebase or amend `main`.

---

## 1. Keys and accounts you need

| Key / account | Where it goes | Notes |
|---|---|---|
| **Web key** (hub.arkiv.network access key) | Vercel env `EXPO_PUBLIC_ARKIV_ACCESS_KEY` of the **real** project | Public once bundled. On the hub, restrict its allowed Origins to the Vercel domain. Better still: serve reads through a relay (section 3.1) so no key ships. |
| **Worker key** | Worker host env `ARKIV_ACCESS_KEY` | The worker runs non-stop, so keep it off the web key. |
| **Cron key** | GitHub secret `ARKIV_ACCESS_KEY` (heartbeat workflow) | The current secret may be the exhausted key: **replace it**. |
| `SEED_PRIVATE_KEY` | GitHub secret + your `.env` only | Funds wallets (`pnpm fund`). Never in Vercel, never in the app. |
| `VERIFIER_PRIVATE_KEY` | GitHub secret + `.env` | The trusted demo verifier. |
| `TRIGGERS_WORKER_PRIVATE_KEY` (optional) | Worker host | If unset, the worker derives it from `SEED_PRIVATE_KEY` (address `0x2da1bea8ec53f4dc01720f64cdc29ce3a5028ba0`), which means the seed key would sit on the worker host. Prefer a dedicated key: `node -e "console.log(require('viem/accounts').generatePrivateKey())"`, then `pnpm fund <its address>`. |
| VAPID keys (`TRIGGERS_VAPID_PUBLIC/PRIVATE/SUBJECT`) | Worker host | Already generated into `.env` (`pnpm triggers:vapid`). Keep the private one secret. Changing it invalidates push subscriptions. |

Before judging, ask the Arkiv team (Discord: https://nsb.dev/discord) for a higher quota or a hackathon key. Every serious browser app in this event hit `ANON_COST_LIMITED` (see `arkiv/friction.md` #21).

---

## 2. Deploy

### 2.1 Web app: two Vercel projects from the same repo

Both use **root directory `apps/mobile`**.

| Setting | Real app (`bhaiya-please.vercel.app`) | Sandbox (`bhaiya-please-sandbox.vercel.app`) |
|---|---|---|
| Install command | `cd ../.. && pnpm install --frozen-lockfile` | same |
| Build command | `npx expo export --platform web` | same |
| Output directory | `dist` | `dist` |
| `EXPO_PUBLIC_CORE` | `real` | `mock` |
| `EXPO_PUBLIC_ARKIV_RPC_URL` | `https://rpc.tiramisu.db-chain.testnet.arkiv.network` | — |
| `EXPO_PUBLIC_TRUSTED_VERIFIERS` | `0x166efae608457303daf2af830d281922c5d6ee20` | — |
| `EXPO_PUBLIC_ARKIV_ACCESS_KEY` | web key (or empty with the relay) | — |
| `EXPO_PUBLIC_TRIGGERS_URL` | `https://<worker host>` | — (the sandbox runs the engine in the browser) |
| `EXPO_PUBLIC_TRIGGERS_WORKER` | worker address | — |
| `EXPO_PUBLIC_REAL_APP_URL` / `EXPO_PUBLIC_SANDBOX_URL` | the two URLs | the two URLs |

**Deep links:** routes like `/request/0x…` and `/p/0x…` must serve `index.html`. Add `apps/mobile/vercel.json`:

```json
{ "rewrites": [{ "source": "/((?!_expo|assets|sw\\.js|favicon).*)", "destination": "/index.html" }] }
```

Check after deploy: `/sw.js` returns the service worker (not HTML), and a hard refresh on `/settings/notifications` loads the app.

### 2.2 Arkiv Triggers worker

It needs an **always-on** host with **HTTPS** (browsers refuse to register push with an http origin). Free tiers that sleep (Render free) would stop alerts and no-show proofs.

- **Render** (`packages/triggers-worker/render.yaml`): web service, Starter plan or above, health check `/health`, persistent disk mounted at `TRIGGERS_DATA_DIR` (channels and engine state live there). Set env from `.env.example` → TRIGGERS section.
- **Any VM / Fly.io**: `docker build -f packages/triggers-worker/Dockerfile -t arkiv-triggers .`, run with a volume for the data dir, put Caddy or another TLS proxy in front. *The Dockerfile has not been built yet: Docker was unavailable on the dev machine. Build it once before relying on it.*
- **Fallback for the demo**: run `pnpm triggers:worker` on a laptop and expose it with `cloudflared tunnel --url http://localhost:8787` (HTTPS URL), then set `EXPO_PUBLIC_TRIGGERS_URL` to it and redeploy the web app.

Env: `TRIGGERS_POLL_MS=30000`, `TRIGGERS_REFRESH_MS=60000` (gentle on the quota), `TRIGGERS_ALLOWED_ORIGINS=https://bhaiya-please.vercel.app`, `ARKIV_ACCESS_KEY=<worker key>`, plus the VAPID keys and the worker key.

Verify:
- `curl https://<worker>/health` shows `ok` and a balance > 0.
- `curl https://<worker>/vapid` returns the public key.
- `pnpm fund <worker address>`: receipts cost gas.

### 2.3 Heartbeat cron

`.github/workflows/heartbeat.yml` runs every 15 minutes, so the board always has runs for judges. Update the `ARKIV_ACCESS_KEY` secret to the cron key. Keep `SEED_PRIVATE_KEY` funded: `pnpm fund` prints the seed balance. If quota is tight, change the cron to `*/30 * * * *`.

### 2.4 Smoke test after deploying (10 minutes)

1. Sandbox URL → **Start guided tour** → complete the loop in the split view.
2. Real URL → sign up in two browsers (one incognito) → `pnpm fund` both addresses (from Profile → Settings → Advanced) → runner goes live → resident requests → accept → at the gate → paste link → handoff → receipt.
3. With the worker: resident turns on Push before requesting. The notification arrives on accept, and the inbox row shows "via Arkiv Trigger".
4. `pnpm live-check` (23 chain steps) passes.

---

## 3. Make it robust before judges arrive

### 3.1 P0: server-side read relay (strongly recommended)

Judges and visitors all read through the public key in the bundle, so one busy hour can exhaust it. Other teams (Asli, Switched Off, AbhiChahiye) solved this with a small read-only relay. Do the same:

- Add a Vercel function `apps/mobile/api/arkiv.ts`:
  - allowlist read methods only (`arkiv_query`, `arkiv_getEntity*`, `eth_blockNumber`, `eth_getBlockByNumber`, `arkiv_getBlockTiming`, `eth_chainId`, `eth_getBalance`);
  - add the key server-side;
  - cache identical query bodies for 3–5 s;
  - per-IP rate limit.
- Point reads at `/api/arkiv`: set `EXPO_PUBLIC_ARKIV_RPC_URL=/api/arkiv` for reads, keep writes on the public RPC (the core adapter takes one `rpcUrl`; add a `readRpcUrl` option).
- With the relay in place, leave `EXPO_PUBLIC_ARKIV_ACCESS_KEY` empty, so no key ships in the browser at all.

### 3.2 Also before the deadline

- [ ] README: replace `<VIDEO URL, TODO>` and `<TODO: names, GitHub handles>`.
- [ ] README wallet table: add the Triggers worker (`0x2da1…8ba0` or your dedicated key) and note that judges' in-browser accounts also create entities.
- [ ] `arkiv/schema.md`: confirm it lists `trigger`, `firing` (project `arkivtriggers`) and `noshow`, with expiry per type and the queries. Add a pointer from schema.md to `docs/TRIGGERS.md`.
- [ ] `arkiv/friction.md`: findings 21–23 and section C are in. Re-read it for anything now stale.
- [ ] Check that no secret is committed: `git log -p | grep -E "ark_live|PRIVATE_KEY=0x"` returns nothing.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm --filter mobile build:web` are green on `main`.
- [ ] CI is green on the final commit.

---

## 4. Gates checklist (all must pass to be scored)

| Gate | Status / action |
|---|---|
| Public deployment on Tiramisu, usable without asking | Real app + sandbox on Vercel. Redeploy from `main` after merge. |
| Reproducible (steps + exact queries) | `docs/TESTING.md`, `pnpm live-check`, queries in `arkiv/schema.md` §5 |
| Public repo, MIT, setup in README | ✓ (check the repo is public) |
| `/arkiv/schema.md` | ✓ (add trigger/firing pointer, 3.2) |
| On-chain evidence: wallet addresses | README table (+ worker, 3.2) |
| `/arkiv/friction.md` | ✓ (23 findings) |
| Demo video ≤ 3 min | **To record** (section 6) |
| Track(s) chosen on Devfolio | Best Indian Use Case (+ optionally Censorship Resistance / Security) |
| All required Devfolio questions | Drafts in section 5 |
| Team ≥ 1 Indian national (for the India prize) | Answer "Yes" on the form |

Disqualifier self-check:
- **No real personal data on chain:** names, phones and flats are never collected, the demo is synthetic, and the push endpoint stays off chain.
- **No secrets on chain.**
- **Meaningful Arkiv use:** Arkiv is the only datastore.

---

## 5. Devfolio form: draft answers (edit before pasting)

**Project name:** Bhaiya Please · **Tagline:** "Bhaiya, please le aana: errands from neighbours already on the way, with reputation the runner owns."

**The problem it solves.** In Indian gated societies the last 50 m is the expensive part:
- A resident who forgot milk or medicine pays a delivery fee and waits 30 minutes, while riders, neighbours and students are already heading to the same gate.
- The trust that would let them help lives inside platforms. A rider's ratings belong to the app, a neighbour has no record at all, and "please bring one thing" falls back to WhatsApp groups with no memory.

Bhaiya Please is an open errand board on Arkiv:
- Runners announce trips, and residents of that society ask for 1–3 items from a shop on the route.
- They meet at the gate and pay by UPI. A scanned handoff code proves the handoff.
- The resident gives a receipt that the runner owns. Reputation is the receipts a runner holds, so it moves with them to any app.

**Challenges I ran into.**
- The cost-based read quota (`QUOTA_EXCEEDED` / `ANON_COST_LIMITED`), which retries amplified to 536 calls/min per tab. We cut it to 10/min and made it fail safe.
- Classifying chain events on a shared testnet.
- Proving a no-show without a trusted server. We built Arkiv Triggers and re-verify evidence at a past block.
- Atomic receipt + ownership transfer, and predicting keys for the handoff commit.

All of these are in `arkiv/friction.md`.

1. **Live app URL:** https://bhaiya-please.vercel.app (sandbox: https://bhaiya-please-sandbox.vercel.app)
2. **Indian nationality:** Yes.
3. **Why Arkiv?** On Firebase, reputation is a feature of our app; on Arkiv it is an asset of the runner:
   - **Receipts:** a receipt is created by the resident (immutable `$creator`), transferred to the runner (`$owner`) in the same atomic batch, and `readonly`. Neither of us can edit it, and if we disappear it is still readable and owned.
   - **Expiry:** runs vanish 10 minutes after ETA, shops fade unless neighbours extend them (`permissionlessExtension`), and live location deletes itself in 2 minutes. There is no cleanup job.
   - **No-shows:** they are provable without trusting anyone, by re-reading the chain at a recorded block (`atBlock`).
   - **Kept off Arkiv on purpose:** names, phones, flat numbers, exact GPS (only a ~150 m cell), chat, payments, push endpoints, and the handoff secret until the runner reveals it.
4. **How do you use Arkiv?** (with code links)
   - `$creator`/`$owner` + `changeOwnership` in one batch for receipts: `packages/core/src/services/receipts.ts`
   - `readonly` for receipts, deliveries, complaints and no-show evidence: `packages/core/src/codec/entities.ts`
   - Per-type expiry (runs ETA+10 min, pings 2 min, shops 30 d, requests run+1 h): `packages/core/src/services/context.ts`
   - Permissionless extension ("still open" shops): `packages/core/src/services/shops.ts`
   - Typed range queries for the live board (`dest_zone`, `eta > now`, `capacity_left > 0`): `packages/core/src/services/runs.ts`
   - Atomic accept + capacity decrement: `packages/core/src/services/requests.ts`
   - `predictEntityKeys` for the handoff commit: same file
   - `atBlock` historical reads for trustless no-show verification: `packages/core/src/services/noshow.ts`
   - Arkiv Triggers, subscriptions as entities with signed firing receipts: `packages/triggers/src/engine.ts`
5. **friction.md:** `https://github.com/ayush18pop/bhaiya-please/blob/main/arkiv/friction.md`
6. **Wallets (roles):** paste the README table (verifier, three seeded runners, demo resident, 18 seeded residents, the funding wallet that sends GLM only, the Triggers worker, and judges' in-browser accounts).
7. **schema.md:** `https://github.com/ayush18pop/bhaiya-please/blob/main/arkiv/schema.md`
8. **How judges can reproduce:**
   - Open the sandbox for the full loop with no setup.
   - Open the real app to see live runs.
   - Run `pnpm install && pnpm live-check` for the 23-step chain check.
   - The exact queries are in schema.md §5; `docs/TESTING.md` has step-by-step instructions.
9. **Pre-existing work:** None (first commit 16 Oct 2026; libraries only).
10. **Surfaces used:** TypeScript SDK, Direct JSON-RPC (probing), Docs, Hub, Faucet, Access keys, Block Explorer.
11. **Time to first entity:** *(fill honestly: check `arkiv/friction.md` §B / the spike date)*.
12. **LLMs used:** Claude (Anthropic) via Claude Code *(state the models you actually used)*.
13. **One thing Arkiv should improve first:** make the read budget visible and safe to hit:
    - publish costs and quotas;
    - show the remaining budget per key;
    - answer a spent quota with an error clients don't retry;
    - add project-scoped event filtering.
14. **Feedback call:** your choice. **Built 9–18 Oct with third-party work disclosed:** Yes. **Repo public under MIT:** Yes.

---

## 6. Demo video (≤ 3:00): shot list

Record in the sandbox split view (it is immune to quota problems), plus 20 s on the real app.

| Time | Shot |
|---|---|
| 0:00–0:20 | The problem: a society gate, a rider heading back empty, "please bring one thing" on WhatsApp. Title: *reputation that belongs to the runner*. |
| 0:20–0:45 | Resident: map of runners coming to Lotus Heights → Ask → shop → items → review bill → Send. |
| 0:45–1:10 | Runner: the request arrives (alert) → Accept → shopping list → **I'm at the gate** (the resident's yellow strip lights up). |
| 1:10–1:35 | Handoff: QR / code → runner scans or pastes the link → HANDED OVER stamp → collect ₹. |
| 1:35–1:55 | Receipt prints, stamps and flies to the runner. The runner's profile: "your crowd", receipts, level. |
| 1:55–2:25 | **Why Arkiv:** open a receipt's Verified record (created by the resident, owned by the runner, readonly); runs vanish on expiry; Arkiv Triggers sends alerts and writes signed receipts; a no-show is proven and re-verifiable. |
| 2:25–2:45 | Real chain: the live app with real runs; a firing receipt on the explorer. |
| 2:45–3:00 | What stays off chain (names, phones, flats, GPS). Close on the line *On Firebase, reputation is a feature of our app; on Arkiv, it's an asset of the runner.* |

Upload it (YouTube unlisted is fine), then put the link in the README and on Devfolio.

---

## 7. Final hour (before 22:59 UTC, 18 Oct)

1. Merge into `main`, push, and confirm CI is green.
2. Redeploy both Vercel projects from `main`, then run the smoke test (2.4).
3. Make sure the worker is up (`/health`) and funded, and the heartbeat is running with the new key.
4. Fill in every Devfolio field, select tracks, add the video link, and submit.
5. Note the final commit SHA. Don't touch history afterwards.
