# Bhaiya Please

*"Bhaiya, please le aana if possible."*

An open, app-neutral errand board on [Arkiv](https://arkiv.network). A **runner** who is already heading to an apartment society (a delivery rider on the return trip, a neighbour, a student) announces a short-lived **run**. A **resident** of that building attaches a **request** for one to three items from a local shop on the runner's route. They meet at the society gate, pay by UPI (off-chain), and the resident issues a **receipt** that is *transferred to the runner*. Reputation is the set of receipts a runner owns, so it travels with the runner instead of living in one platform's database.

Built 16-18 Oct 2026 during the hackathon. No pre-existing code (the first commit is the start of the work). Built for the **Best Indian Use Case** track.

- Live app: **`<DEPLOYMENT URL, TODO before submission>`** (works in a browser, no sign-up; Tiramisu testnet)
- Demo video (<= 3 min): **`<VIDEO URL, TODO>`**
- Schema (entities, attributes, expiry, queries, trust model): [`arkiv/schema.md`](arkiv/schema.md)
- Friction report: [`arkiv/friction.md`](arkiv/friction.md)

## The problem, for India

In a gated society the last 50 metres is the expensive part. Residents need one forgotten item; riders and neighbours are already going there. Today that trust lives inside delivery platforms: a rider's ratings are not theirs to take elsewhere, a neighbour has no reputation at all, and "please bring one thing" falls back to a WhatsApp group with no memory and no accountability. Payment is already solved (UPI at the gate) and the neighbourhood kirana is already there. What is missing is a **neutral, portable record of who has reliably handed things over to real residents**, without exposing anyone's name, phone number or flat.

## How it works

1. **Announce.** A runner picks a destination zone and ETA. This creates a `run` entity that expires 10 minutes after the ETA.
2. **Request.** A resident of that zone picks a shop on the route and 1-3 items. The app generates a 4-digit code and a random salt on the device and stores only `keccak256(code ‖ salt ‖ requestKey)` on Arkiv.
3. **Accept.** The runner accepts. One atomic batch creates the `accept` and decrements the run's `capacity_left`. Limits (₹ cap, requests per run) come from the runner's *computed* tier, not from anything the runner claims.
4. **Handoff.** At the gate the resident shows a QR (code + salt). The runner scans it and writes a `delivery` containing the reveal. Anyone can re-hash it against the request's commit.
5. **Receipt.** The resident issues a read-only `receipt` and transfers it to the runner in the same batch. The resident stays the unforgeable `$creator`; the runner is the `$owner`.
6. **Reputation.** Any viewer recomputes a runner's profile from chain: valid receipts, distinct residents, complaints, and attestations from verifiers *the viewer* trusts. Nothing is stored as a score.

Off-chain on purpose: names, phone numbers, flat numbers, ID documents, exact GPS (only a geohash-6 cell), chat, payments, and the handoff secret until the runner reveals it. All demo data is synthetic.

## Why Arkiv

> **On Firebase, reputation is a feature of our app. On Arkiv, it's an asset of the runner.**

What each Arkiv feature does for the user (full mapping and the honest "core only" list in [`arkiv/schema.md`](arkiv/schema.md#8-feature--what-the-user-sees)):

| Arkiv feature | What would break on Postgres / IPFS / a subgraph / our own API |
|---|---|
| `$creator` (immutable) + `$owner` + `changeOwnership` | A receipt authored by the resident and **owned by the runner** needs both facts to be unforgeable and the runner to hold the asset. With our own DB, we would own it and could edit or lose it. IPFS has no owner or revocation. |
| `readonly` flag | A receipt, a delivery reveal and a complaint cannot be edited by anyone, including us. A database admin can. |
| Attribute expiry | Runs vanish by themselves 10 minutes after ETA; shops fade after 30 days unless someone says "still open". No cleanup job. IPFS never forgets. |
| `permissionlessExtension` | Any neighbour keeps a shop listing alive, without being its owner. Needs custom access control elsewhere. |
| Typed attribute queries | "Runs to this building with ETA after now and capacity left" is a native range query, with no indexer or subgraph to run. |
| Atomic `executeBatch` | Accept + capacity decrement, and receipt + transfer, cannot half-happen. |
| `predictEntityKeys` | The handoff commit includes the request's own key, so it must be known before the request exists. |
| No operator | The board has no backend of ours. If we vanish, the receipts and the app's data stay readable and owned by their holders. |

## Architecture

```
 apps/mobile  (Expo + Expo Router + react-native-web; Android and web from one codebase)
      │   only talks to the BhaiyaPlease interface; EXPO_PUBLIC_CORE = mock | real
      ▼
 packages/core  (@bhaiya-please/core, plain TypeScript, no React)
   types / interface ─ codec (attribute table, zod, handoff commit) ─ services (runs, requests,
   handoff, receipts, complaints, attestations, shops, reputation, trust filters)
      │                                   │
      ▼                                   ▼
 arkiv/adapter.ts  (the ONLY file         mock/  in-memory chain, same services,
 importing @arkiv-network/sdk)            same fixtures (offline dev, tests)
      │  createEntity / patch / extend / changeOwnership / executeBatch
      │  select().where() / predictEntityKeys / watchEntityEvents
      ▼
 Arkiv Tiramisu testnet (chain id 7738577)  ◀── scripts/seed (seed + heartbeat, operator tooling)
```

## Setup (reproducible)

Requirements: Node >= 20, pnpm 10.

```bash
pnpm install
cp .env.example .env        # only needed for seed / spike / heartbeat; the app needs none
pnpm test                   # core unit + e2e tests (in-memory chain, no network)
pnpm typecheck              # all workspaces
pnpm dev                    # the app in MOCK mode (EXPO_PUBLIC_CORE=mock): runs fully offline
```

Against the real chain you need a funded test key (faucet: <https://hub.arkiv.network/faucet>; optional access key from <https://hub.arkiv.network>):

```bash
# .env: SEED_PRIVATE_KEY=0x... (test key only), optionally ARKIV_ACCESS_KEY=...
pnpm spike                  # exercises every risky Arkiv primitive, prints PASS/FAIL (see arkiv/friction.md section B)
pnpm seed                   # funds persona wallets, replays the fixture plan through the REAL core, prints addresses
pnpm seed -- --dry          # print derived persona addresses only (no chain access)
EXPO_PUBLIC_CORE=real pnpm dev          # the app against Tiramisu
EXPO_PUBLIC_CORE=real pnpm build:web    # static web export (apps/mobile, expo export --platform web)
```

Set `EXPO_PUBLIC_TRUSTED_VERIFIERS` (and optionally `EXPO_PUBLIC_ARKIV_ACCESS_KEY`, which is public in the bundle) to the demo verifier address that `pnpm seed` prints. Persona wallets are derived deterministically from `SEED_PRIVATE_KEY` (keccak of key + persona id); keys are never printed or written. Seeding takes roughly 15-30 minutes (about five transactions per handoff, written one after another).

**To see the Arkiv usage as a judge:** open the app and a runner's profile (the seeded "trusted" runner has 30 receipts from 18 distinct residents), open a receipt, and expand the on-chain proof panel: it shows the raw `$creator` (resident), `$owner` (runner), `readonly` flag and expiry read straight from Arkiv. The literal queries are in [`arkiv/schema.md`](arkiv/schema.md#5-queries-the-app-runs). To act, create a burner wallet in the app and fund it from the faucet (browsing needs no funds).

Note on seeded history: a real chain cannot be time-travelled, so seeded history is written "now". Counts, tiers and hash verification match the mock; timestamps and the "last 30 days" figures do not.

## Wallets that create entities on Tiramisu

Filled after `pnpm seed`. (The funding wallet only sends GLM and creates no entities.)

| Role | Persona id | Address |
|---|---|---|
| Verifier (trusted by the app) | `verifier` | `<TODO>` |
| Runner, Trusted tier | `runner-trusted` | `<TODO>` |
| Runner, Verified tier | `runner-verified` | `<TODO>` |
| Runner, New | `runner-new` | `<TODO>` |
| Demo resident / shop confirmer | `resident-demo` | `<TODO>` |
| Seeded residents (18) | `resident-01` ... `resident-18` | `<TODO, paste table from seed output>` |
| Judges' own burner wallets | n/a | created in the browser; they create entities when judges use the app |

## Heartbeat cron (disclosure)

`.github/workflows/heartbeat.yml` runs `pnpm heartbeat` every 15 minutes (until the judging window ends). Each run announces 2-3 synthetic runs from the seeded demo runners with ETA 10-20 minutes and confirms one shop "still open" from a second wallet, so the board is never empty when a judge opens it. It is a **convenience operator for judges**: runs and requests are ordinary entities that anyone can create, the app does not depend on it, and it can be disabled without affecting anything else. Its keys are testnet-only GitHub secrets (`SEED_PRIVATE_KEY`, `ARKIV_ACCESS_KEY`, optionally `VERIFIER_PRIVATE_KEY`).

## Repository layout

```
apps/mobile/       Expo + Expo Router + react-native-web app (web: pnpm build:web)
packages/core/     domain layer over Arkiv: codec, services, reputation, adapter, mock, tests
scripts/seed/      seed.ts (one-off history) and heartbeat.ts (keeps the board live)
scripts/spike/     chain spike: PASS/FAIL for each risky SDK behaviour
arkiv/             schema.md and friction.md (judging deliverables)
docs/              BRIEF, ARCHITECTURE, SDK_NOTES, PLAN, UX_SPEC, proposal (working docs; the code wins on any disagreement)
.github/workflows/ ci.yml (tests + typecheck), heartbeat.yml
```

## Team

`<TODO: names, GitHub handles>`

## License

MIT, see [`LICENSE`](LICENSE).
