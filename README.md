# Bhaiya Please

*"Bhaiya, please le aana if possible."*

An open, app-neutral errand board on [Arkiv](https://arkiv.network). A **runner** who is already heading to an apartment society (a delivery rider on the return trip, a neighbour, a student) announces a short-lived **run**. A **resident** of that building attaches a **request** for one to three items from a local shop on the runner's route. They meet at the society gate, pay by UPI (off-chain), and the resident issues a **receipt** that is *transferred to the runner*. Reputation is the set of receipts a runner owns, so it travels with the runner instead of living in one platform's database.

Built 16-18 Oct 2026 during the hackathon. No pre-existing code (the first commit is the start of the work). Built for the **Best Indian Use Case** track.

- Live app (real Arkiv, Tiramisu testnet): **https://bhaiya-please.vercel.app**. Browse the live board read-only straight away; to post, get free test GLM from the [faucet](https://hub.arkiv.network/faucet).
- Sandbox (in-memory mock, no gas needed, every flow clickable): **https://bhaiya-please-sandbox.vercel.app**. Click **Start guided tour** (on a desktop it opens resident and runner side by side).
- **How to run and test everything** (sandbox, real chain, Android, test scripts): [`docs/TESTING.md`](docs/TESTING.md)
- Screen-by-screen product spec: [`docs/UI_SCREENS.md`](docs/UI_SCREENS.md)
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

## The app

One account, two modes: **Get things** (resident) and **Run errands** (runner), plus an invite-only **Society desk** for verifiers. The design is "Auto Meter Brutalism" (the `BhaiyaPlease-DesignSystem` kit): meter-digit ETAs, number-plate levels, mela-light alerts, rubber-stamped receipts, a dark brand map.

| Area | Screens |
|---|---|
| Onboarding | Welcome posters · how you'll use it · find your society (search / location / gate map) · public name + language · restore account |
| Resident | Map of runs coming here · runner sheet · pick a shop · add a shop · what do you need · review bill · live tracking (status road) · handoff code · rate (receipt print and stamp) · report a problem |
| Runner | Setup · start a run · active run (inbox, accept / decline, live location) · request detail · shopping list · at the gate · scan / paste code · handoff done · run summary |
| Shared | Activity · activity detail · my profile ("your crowd") · public profile · receipt + verified record · get verified · notifications · settings · back up / move phone · help and safety · not found / maintenance |
| Society desk | Scan a runner · check and vouch · vouches issued |
| Sandbox | Start page · guided tour · split view · how-it-works callouts · time and reset controls |

Languages: English, हिन्दी, ಕನ್ನಡ. Runner screens have a Sunlight mode. Every save shows Saving / Saved / Couldn't save on the button.

## Setup (reproducible)

Requirements: Node >= 20, pnpm 10.

```bash
pnpm install
cp .env.example .env        # needed for seed / spike / heartbeat / fund; the mock app needs none
pnpm test                   # core unit + e2e tests (in-memory chain, no network)
pnpm typecheck              # all workspaces
pnpm dev                    # the app in MOCK mode (EXPO_PUBLIC_CORE=mock): runs fully offline
pnpm live-check             # 23-step check of the full loop on Tiramisu (needs .env, see below)
```

Full walkthroughs (sandbox script, real chain with two accounts, Android): [`docs/TESTING.md`](docs/TESTING.md). Expo reads `EXPO_PUBLIC_*` from `apps/mobile/.env`, not the root `.env`.

Against the real chain you need a funded test key (faucet: <https://hub.arkiv.network/faucet>; optional access key from <https://hub.arkiv.network>):

```bash
# .env: SEED_PRIVATE_KEY=0x... (test key only), optionally ARKIV_ACCESS_KEY=...
pnpm spike                  # exercises every risky Arkiv primitive, prints PASS/FAIL (see arkiv/friction.md section B)
pnpm seed                   # funds persona wallets, replays the fixture plan through the REAL core, prints addresses
pnpm seed -- --dry          # print derived persona addresses only (no chain access)
pnpm seed -- --resume       # continue an interrupted seed without duplicating what is on chain
pnpm fund 0xADDR [0xADDR..] # top up any account (e.g. a judge's in-browser account) from the seed wallet
pnpm live-check             # full loop + cancel / decline / at-the-gate on chain (LIVECHECK_ANON=1: no access key)
EXPO_PUBLIC_CORE=real pnpm dev          # the app against Tiramisu
EXPO_PUBLIC_CORE=real EXPO_PUBLIC_TRUSTED_VERIFIERS=0x166efae608457303daf2af830d281922c5d6ee20 \
  EXPO_PUBLIC_ARKIV_ACCESS_KEY=<web key> pnpm build:web   # static web export against Tiramisu
```

**Access key in a static web build is public.** Anything in `EXPO_PUBLIC_*` ships in the JavaScript bundle. Use a *separate* hub.arkiv.network key for the web build and restrict its allowed Origins to the deployment domain on the hub (an Origin allowlist stops other websites from spending it from a browser; it does not stop scripts, so treat it as a rate-limit key, never as a secret). Core sends the key as the `X-API-KEY` header, not in the URL, so it never appears in error messages. The app also works without a key (anonymous limit observed: 600 requests per minute).

Set `EXPO_PUBLIC_TRUSTED_VERIFIERS=0x166efae608457303daf2af830d281922c5d6ee20` (the seeded demo verifier; also the default in `.env.example`). Persona wallets are derived deterministically from `SEED_PRIVATE_KEY` (keccak of key + persona id); keys are never printed or written. Seeding takes roughly 15-30 minutes (about five transactions per handoff, written one after another).

**To see the Arkiv usage as a judge:** open the app and a runner's profile (the seeded "trusted" runner has 30 receipts from 18 distinct residents), open a receipt, and read its **Verified record** (written by the resident, owned by the runner, can't be edited, handoff code matched); expand **Advanced** for the raw record and account IDs and the explorer link, read straight from Arkiv. The literal queries are in [`arkiv/schema.md`](arkiv/schema.md#5-queries-the-app-runs). To act, sign up in the app (an account is created on the device; "Look around first" browses without one) and fund it from the faucet: the address is under Profile → Settings → Advanced. Every write costs gas (one create is about 0.000125 GLM, so 0.01 GLM covers a full runner + resident + verifier flow many times over). If the faucet is inconvenient, send us the wallet address and we top it up with `pnpm fund <address>`; no private key is ever shipped in the app.

Note on seeded history: a real chain cannot be time-travelled, so seeded history is written "now". Counts, tiers and hash verification match the mock; timestamps and the "last 30 days" figures do not.

## Wallets that create entities on Tiramisu

Seeded on 16 Oct 2026 with `pnpm seed` (addresses only; persona keys are derived from the seed key and never printed or stored). The funding wallet `0x7975e591c26e6c6d9b0cfd9a81f6d61a921c080c` only sends GLM (and ran the chain spike); it creates no app entities.

| Role | Persona id | Address |
|---|---|---|
| Verifier (trusted by the app: `EXPO_PUBLIC_TRUSTED_VERIFIERS`) | `verifier` | `0x166efae608457303daf2af830d281922c5d6ee20` |
| Runner, Trusted tier | `runner-trusted` | `0x21f758e41831e8fed3486a8fa3d894a12f69cc1a` |
| Runner, Verified tier | `runner-verified` | `0x7b9c76f7d847dd5dd244507ce883fa51b8f2e33a` |
| Runner, New | `runner-new` | `0x280e00fd992aa5eec367846df3501858dcf955da` |
| Demo resident / shop confirmer | `resident-demo` | `0xe6cedb47644361328bdf7163889ebea122bfdc1f` |
| Seeded resident | `resident-01` | `0x24c071932da931dc9185a632da9fa9e1b27acb84` |
| Seeded resident | `resident-02` | `0x61cb00b358e95208e4ab5e12eccd40bf470c40de` |
| Seeded resident | `resident-03` | `0x2aec208b2e281c5b4b44dec5bbeb28a0ab9d1e33` |
| Seeded resident | `resident-04` | `0x6f4cb106b91023b29c10682a812c206aafcd04d1` |
| Seeded resident | `resident-05` | `0xf7c20fda02bfb06212a3d78e9052c8636e873596` |
| Seeded resident | `resident-06` | `0x12b18d662471b5734ee22d61891f08062380cad4` |
| Seeded resident | `resident-07` | `0x35b7d402dd62c2b0980193aa05d93862f1a3b443` |
| Seeded resident | `resident-08` | `0xf99e90100eecb25c4576dbba710b546467fd6070` |
| Seeded resident | `resident-09` | `0xd6c1cf034a1429181f750fd7805746cc39029c65` |
| Seeded resident | `resident-10` | `0x3c569ddb147cae1ab152ea52bb3bbaf28bba5fce` |
| Seeded resident | `resident-11` | `0x13be7bfb570ef7b1a136d7a3c19fb0ec454d8412` |
| Seeded resident | `resident-12` | `0x51d401ea76a1744033ffa4580d50b61278f481fa` |
| Seeded resident | `resident-13` | `0x89a4c82ffab9f3230aec1de1625d51c10871fd08` |
| Seeded resident | `resident-14` | `0x44297f9cdfd7680ac16c2df9ef65edf180036430` |
| Seeded resident | `resident-15` | `0xefe33df22f9106a31fd35093573a0c483712ae8e` |
| Seeded resident | `resident-16` | `0xcbc510005da0ac6a315358d78cbba459cddf64b3` |
| Seeded resident | `resident-17` | `0x6f229829008cbeb9bbfc6ff021852c4f1f4f9ca0` |
| Seeded resident | `resident-18` | `0xac70dc43cdd8fac1b34e620a197ac58806582108` |
| Judges' own burner wallets | n/a | created in the browser; they create entities when judges use the app |

Profiles recomputed from chain by an anonymous viewer after seeding (16 Oct), trusting only the verifier above:

| Runner | Valid receipts | Distinct residents | Invalid | Complaints | Verified | Tier |
|---|---|---|---|---|---|---|
| runner-trusted | 30 | 18 | 0 | 0 | yes | Trusted |
| runner-verified | 6 | 5 | 0 | 1 | yes | Verified |
| runner-new | 2 | 2 | 0 | 0 | no | New |

## Heartbeat cron (disclosure)

`.github/workflows/heartbeat.yml` runs `pnpm heartbeat` every 15 minutes (until the judging window ends). Each run announces 2-3 synthetic runs from the seeded demo runners with ETA 10-20 minutes and confirms one shop "still open" from a second wallet, so the board is never empty when a judge opens it. It is a **convenience operator for judges**: runs and requests are ordinary entities that anyone can create, the app does not depend on it, and it can be disabled without affecting anything else. Its keys are testnet-only GitHub secrets (`SEED_PRIVATE_KEY`, `ARKIV_ACCESS_KEY`, optionally `VERIFIER_PRIVATE_KEY`).

## Repository layout

```
apps/mobile/       Expo + Expo Router + react-native-web app (web: pnpm build:web)
  app/             routes (welcome, society, sandbox, (app)/(tabs) home·activity·profile, request, runner, desk, settings…)
  screens/         screen implementations per area (onboarding, resident, runner, shared, desk, sandbox) + BUILD.md
  components/bp/   UI kit implementing the design system (buttons, meters, plates, stamps, sheets, records…)
  components/map/  MapLibre map (web + native) with brand markers; schematic fallback in Expo Go
packages/core/     domain layer over Arkiv: codec, services, reputation, adapter, mock, tests
scripts/seed/      seed.ts (one-off history), heartbeat.ts (keeps the board live), fund.ts, live-check.ts
scripts/spike/     chain spike: PASS/FAIL for each risky SDK behaviour
arkiv/             schema.md and friction.md (judging deliverables)
docs/              TESTING (how to run/test), UI_SCREENS (screen spec), BRIEF, ARCHITECTURE, SDK_NOTES, PLAN, UX_SPEC, AUDIT, proposal
.github/workflows/ ci.yml (tests + typecheck), heartbeat.yml
```

## Team

`<TODO: names, GitHub handles>`

## License

MIT, see [`LICENSE`](LICENSE).
