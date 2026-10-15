# Bhaiya Please — Parallel Execution Plan (Thu 16 Oct 19:00 → Sat 18 Oct 21:00 IST)

Hard deadline: **Sun 19 Oct 04:29 IST** (Sat 23:59 London). We submit at **Sat 21:00 IST**; the 7.5 h after is
buffer only. **A** = Core/Arkiv (`packages/core`, `scripts/seed`, `arkiv/*`). **B** = App/UX (`apps/web`, deploy, video).

## Sync points (both stop, merge to main, 15 min call)

| # | When (IST) | Gate — both must agree before moving on |
|---|---|---|
| **S1** | **Thu 21:00** | **Interface frozen.** `types.ts` + `interface.ts` merged to main unchanged or amended once. Spike results in: each risky SDK primitive marked ✅/fallback in `docs/SDK_NOTES.md` + friction.md. After S1, contract changes need a 2-line note in the PR and both 👍; additive-only preferred. |
| **S2** | **Fri 14:00** | **Swap mock → real core.** `VITE_CORE=real` works on Tiramisu for shops, runs, requests, accept, watcher; seed v1 on chain; first Vercel prod deploy live. Remaining methods may throw `UNKNOWN('not implemented')` in real and B keeps using mock for those screens. |
| **S3** | **Sat 13:00** | **Feature freeze.** Full flow works on two real phones on the prod URL with real core; seed v2 (history) on chain; heartbeat running. After S3: bug fixes, copy, docs, video only. |

Extra check-ins (5 min, async OK): Fri 09:00, Fri 19:00, Fri 22:00 (cut triggers), Sat 08:00.

## Time blocks

### Thu 16 Oct
| Time | A — Core / Arkiv | B — App / UX |
|---|---|---|
| 19:00–19:45 | Create public GitHub repo: LICENSE (MIT) in **first commit**, pnpm workspace, `tsconfig.base.json`, `packages/core` with `types.ts`/`interface.ts`, `.gitignore` (`.env*`), `.env.example`. Get access key at hub.arkiv.network; fund 2 wallets at the faucet (**note faucet UX: login? captcha? amount?** → decides gas plan). | Read ARCHITECTURE + interface. `apps/web` Vite+React+TS+Tailwind, TanStack Query, router, PWA plugin. |
| 19:45–21:00 | **SDK spike** `scripts/seed/spike.ts`: create w/ attrs+expiry; query by attr, by `$owner`/`$creator`, range on u64/i32; patch (partial?); `executeBatch` create+patch; `predictEntityKeys` → create → keys match?; batch create+`changeOwnership` same key; permissionless extend from 2nd wallet; watch events payload shape. Log every surprise in `arkiv/friction.md`. | Burner wallet (`wallet/`): generate/store/export QR/import, `?persona=N`. Zone picker (DEMO_ZONES chips + GPS). Role switch (Runner / Resident / Verifier). |
| **21:00** | **S1** | **S1** |
| 21:00–01:00 | `codec/` (attrs table, zod schemas, handoff commit + QR), `services/` shops/runs/requests/accept, `mock/` (fake adapter + store + fixtures). **Deliver mock v0 by 01:00** (latest Fri 09:00). | App shell, nav, `core.ts` provider (mock/real switch), `live.ts` subscribe→invalidate, `useNow()` clock, design tokens, Run card with countdown. Start against a hand-stub until mock v0 lands. |
**DoD Thu:** repo public with LICENSE; spike answers recorded; mock v0 importable from web; web shows burner address + zone picker + mock live runs.

### Fri 17 Oct
| Time | A | B |
|---|---|---|
| 08:30–14:00 | Real `arkiv/adapter.ts` (create/query/get/patch/extend/batch/predict/balance, retry, write queue) + `watcher.ts`. Real impl of shops/runs/requests/accept. `scripts/seed/seed.ts` v1: 2 zones × ~6 shops, 1 verifier, 3 runners (keys from local `.env.seed`). | Runner: announce run, my run, incoming requests, accept. Resident: live runs, shop picker (on route), request form (items ≤3, cap by tier), my request status. "Still open" button on shops. Fund-me sheet. |
| **14:00** | **S2** — pair 30 min on the swap | **S2** — first Vercel prod deploy (env: access key, trusted verifiers, `VITE_CORE=real`) |
| 14:30–19:00 | Delivery (reveal verify), receipt batch + `two_tx` fallback, complaint batch, attestation issue/revoke, `verifyDelivery`. Mock parity tests (vitest) for the same flows. | Handoff: resident QR screen (code big), runner scanner (`qr-scanner`) → recordDelivery; resident "Delivered → issue receipt (tags)" / "Complain". Verifier page (scan address QR → attest, list + revoke). |
| 19:00–20:00 | Dinner | Dinner |
| 20:00–00:30 | `services/reputation.ts` real + tests (distinct creators, 30 d window, trust rules, tiers). Seed v2: history so Ravi = Trusted (≥25 valid receipts from ≥15 resident wallets, full run→request→accept→delivery→receipt chain, batched), one Verified runner, one New. `heartbeat.ts` + GitHub Actions cron (15 min). | Profile screen ("N handoffs from M residents", 30 d, complaints, attestations w/ verifier, tag chips), tier badge on run cards, "On-chain proof" panel (`inspect`: $creator/$owner/readonly/expiresAt + explorer link). E2E on two phones vs prod. |
| **22:00** | **Cut-trigger check** (table below) | **Cut-trigger check** |
**DoD Fri:** on prod URL, two phones complete announce → request → accept → scan → receipt → runner's count +1, with live updates; seeded Trusted runner visible.

### Sat 18 Oct
| Time | A | B |
|---|---|---|
| 08:00–08:30 | Joint bug-bash on prod, triage list | same |
| 08:30–10:30 | **Interview 3–5 real riders** outside a dark store (A is less loaded Sat morning; B covers if A is fixing a P0). Verbal consent on camera, no names/numbers recorded, 10-s clip for video + quotes for README. | Polish: empty/loading/error states, pending tx UX, PWA manifest/icons, mobile layout. |
| 10:30–13:00 | `arkiv/schema.md` final (entities, attrs, flags, expiry, owner/creator, every query, feature→screen table, trust model, known limits). `friction.md` cleanup. README: setup, `pnpm i && pnpm seed && pnpm dev`, wallet addresses. Optional atBlock dispute view (only if trigger passed). | Fix bug-bash list. Optional items only if green. Rehearse video flow twice on two phones. |
| **13:00** | **S3 — feature freeze** | **S3** |
| 13:00–16:00 | Fresh seed check, heartbeat verified, support video takes (second phone, explorer shots). | **Record ≤3-min video** per proposal §11 (real core, prod URL). Edit, captions, upload (YouTube unlisted/public). |
| 16:00–18:00 | Fix-only buffer. | Fix-only buffer. |
| 18:00–21:00 | **Submission checklist** (below) | **Submission checklist** |
| **21:00** | **Submit.** | Keep deployment + heartbeat + funded personas up through 22 Oct. |

## File ownership (avoid merge conflicts)

| Path | Owner | Rule |
|---|---|---|
| `packages/core/**` (except contract) | A | B never edits; file issues/asks |
| `packages/core/src/types.ts`, `interface.ts` | A edits, B approves | Additive changes after S1; announce in chat |
| `scripts/seed/**`, `arkiv/**`, `docs/SDK_NOTES.md`, `.github/workflows/heartbeat.yml` | A | |
| `apps/web/**`, `vercel.json`, video assets | B | A never edits |
| `README.md` | A (Sat), B adds deploy/video section | Edit different sections |
| root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json` | A | B adds web deps only via `pnpm --filter web add`; on lockfile conflict: take main, re-run `pnpm i` |
| `docs/PLAN.md`, `docs/ARCHITECTURE.md` | either, small edits | |

## Git convention
- `main` = always deployable; Vercel prod builds `main`, previews build branches.
- Branches: `a/<topic>`, `b/<topic>` (e.g. `a/receipt-batch`, `b/handoff-screen`). Short-lived; merge to main at least
  every ~3 h and at every sync point. `git pull --rebase` on your own branch only.
- **Never force-push or rewrite `main`** (judged SHA at deadline; history must not be rewritten). No squash of
  others' commits. Small conventional commits (`feat(core): …`, `fix(web): …`) — commit history is our "built Oct 9–18" evidence.
- No secrets ever: pre-commit glance at `git diff --cached` for `0x` + 64 hex.

## Must ship vs cut

**Must ship (non-negotiable):** Run / Request / Accept (batch) / Delivery / Receipt (readonly + transfer to runner)
with live updates · Attestation + verifier page · Complaint · tier badge + profile (distinct residents, 30 d) · Shop seed
+ "still open" permissionless extend · inspect panel · deployed URL · schema.md · friction.md · video.

**Cut from the start:** map view (list only), Hindi/Kannada strings, no-show complaints against residents, MetaMask.

| Trigger (checked at time) | If not working | Then |
|---|---|---|
| Thu 21:00 spike: same-batch create+transfer fails | — | Receipt uses `two_tx` path permanently; schema.md says "create, then transfer" (don't claim same-batch) |
| Thu 21:00 spike: faucet unusable for judges | — | Enable demo personas (ARCHITECTURE §6.2) now, not Saturday |
| Fri 14:00 S2: real core for runs/requests/accept | — | A pairs with B until it works; push Delivery/Receipt real impl to 20:00; drop seed history to 1 runner |
| Fri 18:00: Accept atomic batch (create+patch) | — | Two sequential txs; remove "atomic" claim from README/schema |
| Fri 20:00: watchEntityEvents reliable | — | Polling only (`refetchInterval` 4 s); remove watchEntityEvents from feature table |
| Fri 22:00: QR camera scan on Android Chrome | — | Fallback: resident taps "Share code" → runner pastes `bhaiyaplease:h1:…` text; keep 4-digit display |
| Fri 22:00: receipt flow end-to-end on chain | — | Everything optional is cut; Sat morning = receipt only; interviews shrink to 2 |
| Fri 23:59: seed v2 history | — | Seed one Verified runner with ~5 receipts; Trusted tier shown only in mock + unit tests, and README says so (not claimed live) |
| Sat 11:00: all must-ship green | — | atBlock dispute view, successor attestation, transferAllReceipts are cut (keep design in schema.md as "future", not claimed) |
| Sat 13:00 S3 | anything not done | Cut it. Video records what exists. |

## Final submission checklist (Sat 18:00–21:00)

| Gate | Check | Owner |
|---|---|---|
| Public deployment, no access request | Incognito + a phone on mobile data: open prod URL, burner created, board shows heartbeat runs, Fund me / persona path works | B |
| Reproducible setup | Fresh clone in a temp dir: `pnpm i`, copy `.env.example`, `pnpm seed`, `pnpm dev` works exactly as README says | A |
| Public repo, MIT | Repo public; `LICENSE` MIT present since first commit | A |
| `/arkiv/schema.md` | Every entity/attr/flag/expiry/owner matches `codec/attrs.ts`; every claimed feature maps to a screen; cut features removed or marked "not implemented" | A |
| `/arkiv/friction.md` | Each item: SDK version, exact call, error text, workaround, time lost | A |
| Tiramisu wallet addresses | README lists verifier, seed runners, seed residents, heartbeat, demo personas (addresses only) | A |
| Demo video ≤3 min | Length ≤ 3:00, real prod app, shows $creator vs $owner on a receipt + expiry + extend; link in README + form | B |
| Built Oct 9–18 | First commit ≥ Oct 9; no imported prior code; commit history intact | both |
| Synthetic data only | grep chain-facing fixtures + seed for real names/phones/addresses; shop names fictional; interview clips not on chain | A |
| No secrets on Arkiv / in repo | `git log -p | grep -E '0x[0-9a-fA-F]{64}'` reviewed (entity keys OK, private keys not); `.env*` ignored | A |
| SDK meaningfully queried | Network tab shows real Arkiv queries on prod (not mock): `VITE_CORE=real` in Vercel env | B |
| Indian national on team | Declared on form | both |
| Form | Why India (interview quotes), Why Arkiv ("asset not feature"), feature table, friction link | A writes, B reviews |
