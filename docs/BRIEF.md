# Bhaiya Please — Build Brief (source of truth for all agents)

Full proposal: `docs/Bhaiya Please_Arkiv_Proposal.pdf` (10 pages). This brief is the condensed, locked version.

## Context
- Hackathon: Arkiv Global Tour Stop (pre-Devcon 8), **Best Indian Use Case** track ($2,000 + Devcon ticket).
- **Deadline: Sat 18 Oct 2026, 23:59 London = Sun 19 Oct 04:29 IST.** Today is Thu 16 Oct. Two developers, ~2.5 days.
- Rules: https://github.com/Arkiv-Network/global-tour-stop-pre-devcon (repo governs). Judged on 4×25 pts:
  Why India / Why Arkiv / How you use Arkiv (every feature must change something the user sees; claimed-but-absent features count *against*) / friction report.
- Gates: public deployment openable by judges without access requests, reproducible setup, public MIT repo,
  `/arkiv/schema.md`, `/arkiv/friction.md`, Tiramisu wallet addresses, demo video ≤3 min.
- **Disqualifiers:** real personal data on Arkiv (plaintext OR hashed), private keys/secrets on Arkiv, SDK installed but not meaningfully queried, non-working app. Use synthetic data only.

## Arkiv facts (from docs.arkiv.network)
- Web3 database ("DB-chain"). **No EVM, no smart contracts.** Data = entities: payload (≤128 KiB) + up to 30 typed attributes + mandatory expiry. 2-second blocks.
- SDK: `@arkiv-network/sdk` 0.8.x. `createPublicClient` (read, frontend-safe) / `createWalletClient` (write). Chain `tiramisu` from `@arkiv-network/sdk/chains`, chain ID 7738577,
  RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`, WS `wss://rpc.tiramisu.db-chain.testnet.arkiv.network`. Default RPC is rate-limited; free access key from hub.arkiv.network. Faucet: hub.arkiv.network/faucet.
- Writes: `createEntity`, `patchEntity` (owner only, partial), `extendEntity`, `changeOwnership`, `deleteEntity`, `executeBatch` (atomic; order creates→patches→deletes→extensions→ownershipChanges), `predictEntityKeys`.
- Creation flags (immutable): `readonly` (no patches; still extend/transfer/delete), `permissionlessExtension` (any wallet can extend).
- Attribute types via `@arkiv-network/sdk/attr`: `str`, `i32`, `u64`, `u256`, `dec`, `addr`, `key`, `bytes32`, bool. Numbers-as-strings cannot be range-queried.
- System attrs: `$key`, `$owner`, `$creator` (immutable, unforgeable), `$createdAt`, `$expiresAt`, `$contentType`.
- Query language: `type = str('run') AND eta > u64(123)`, operators AND/OR/NOT, = < > <= >=, STARTSWITH. No `!=`. Max 200/page, cursor pagination, `atBlock` historical queries, `getEntityCount`.
- Live events: `publicClient.watchEntityEvents({ onEntityCreated, onEntityPatched, onExpiryExtended, onOwnershipTransferred, onEntityDeleted })` — polling, **no server-side filter, no expiry event**.
- Best practice: every entity carries `project = "bhaiyaplease"`; trust filters via `$creator`.

## Product (locked)
Open, app-neutral board. A **runner** (platform rider on return trip, neighbour, student) already heading to a building announces a short-lived **Run**. A **resident** of that building attaches a **Request** for 1–3 items from a local **Shop** on the runner's route. Handoff at the society gate; payment by UPI **off-chain**. Resident issues a read-only **Receipt** and transfers it to the runner → runner-owned portable reputation.

## Entities (all carry `project=str('bhaiyaplease')`, `type=str(<name>)`)
| Entity | Key attributes | Flags | Expiry | Owner / creator |
|---|---|---|---|---|
| Attestation | subject(addr), level(str: id_checked/resident/successor), prev(addr, successor only), at(u64) | readonly | 180 d | verifier / verifier (verifier revokes by delete) |
| Shop | zone(geohash-6), zone5(geohash-5), category, name_tag | permissionlessExtension | 30 d, anyone extends ("still open") | lister |
| Run | dest_zone, from_zone, eta(u64 unix s), capacity_left(i32), tier(i32) | – | ETA + 10 min | runner |
| Request | run(key), shop(key), dest_zone, max_price(i32 ₹), tip(i32 ₹), code_commit(bytes32) | readonly | = run | resident |
| Accept | request(key), run(key), rider(addr) — created in atomic batch with patch of Run.capacity_left | – | = run | runner |
| Delivery | request(key), rider(addr), resident(addr), zone; payload = {code, salt} reveal | readonly | 1 y | runner |
| Receipt | rider(addr), delivery(key), zone, at(u64); payload = positive tags | readonly | 1 y (runner may extend) | **runner** / resident (create + changeOwnership in one batch) |
| Complaint | rider(addr), request(key), reason(str: no_show/wrong_item/rude), at(u64) | readonly | 180 d | resident |

## Handoff proof
Resident app generates 4-digit code + 16-byte random salt; Request stores `keccak256(code ‖ salt ‖ request_key)`. At the gate the resident shows a QR (code+salt, 4 digits also visible); runner scans; Delivery reveals both; anyone verifies. Salt prevents brute-forcing 10k codes.
Note: request_key must be known before the commit is computed → use `predictEntityKeys`.

## Reputation (computed client-side, never stored as a score)
- Count Receipts with `$owner = rider` whose Delivery reveal verifies; display **distinct `$creator` count** ("212 handoffs from 140 residents"), plus last-30-day window.
- Complaints shown separately (resident-owned; runner cannot delete; expire 180 d).
- Attestations count only from verifier addresses the viewer trusts (app config list).
- Tiers: New (any wallet) ₹200 cap, 1 req/run · Verified (trusted attestation) ₹500, 2 req/run · Trusted (verified + ≥25 receipts from ≥15 distinct residents + <3 complaints/30 d) ₹1,000, 3 req/run.
- Key loss: changeOwnership of receipts; or verifier issues `successor` attestation.

## Off-Arkiv (deliberate)
Names, phone numbers, flat numbers, ID documents, exact GPS (only geohash leaves device), chat, payments (UPI), any delivery-platform data.

## Tech decisions (locked)
- **Mobile-first PWA**, Vite + React + TypeScript + Tailwind, deployed static on Vercel. **No backend server.**
- Wallet: burner private key generated in browser, stored in localStorage, export/import via QR. Optional MetaMask.
- Verifier page: scan runner wallet QR → issue Attestation. Demo verifier key in env for seeding only (never committed).
- Seed script (Node): synthetic shops in two zones, a verifier, three runners with history.
- Monorepo: `packages/core` (domain layer over Arkiv: entity builders, queries, verification, reputation) consumed by `apps/web`. Core exposes a domain interface + an in-memory mock so UI work never blocks on chain work.

## Team split
- **Person A — Core / Arkiv:** `packages/core`, seed script, schema.md, friction.md.
- **Person B — App / UX:** `apps/web` against the core interface (mock first, real later), deploy, demo video.
- Must ship vs cut list: see proposal §10.
