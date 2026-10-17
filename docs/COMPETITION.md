# Competitive landscape: Arkiv Global Tour Stop (snapshot 17 Oct 2026)

Source: the Devfolio gallery https://arkiv.devfolio.co/projects (27 projects listed on 17 Oct, read with a browser) and each project's public page and repo. Rules and rubric: https://github.com/Arkiv-Network/global-tour-stop-pre-devcon. **Bhaiya Please is not in the list yet: submit before 18 Oct 23:59 BST.**

## How we are scored

Every project must pass the gates (live deployment on Tiramisu usable without asking, public MIT repo, `arkiv/schema.md`, `arkiv/friction.md`, wallet addresses, video ≤ 3 min, Devfolio questions). Then four criteria, 25 points each:

| Criterion | What earns a 5 |
|---|---|
| **Why India?** (Best Indian Use Case) | "Names who in India uses it and what changes for them, **and the app works for them today**" |
| **Why Arkiv?** | "The project falls apart without the Arkiv property it relies on, and it says what deliberately stays off Arkiv" |
| **How you use Arkiv** | "Every feature used changes something the user sees, and the team explains why." A feature claimed but not found counts against you. |
| **Friction report** | Each issue has expected vs actual, versions and reproduction steps, and points at a fix |

Best Indian Use Case ($2,000 + Devcon ticket) is decided first, among teams with an Indian-national member, and that team cannot also take a global prize.

## The field

### India-focused entries (our direct competition for Best Indian Use Case)

| Project | What it is | Tracks | Arkiv use (as described) | Notes |
|---|---|---|---|---|
| **ScamWatch India** | Paste an investment link and see whether it's reported, how severe, and who confirmed it | CR, Security, India | Signed reports, read-only + permissionless extension, confirm + extend in one batch, absolute-block extension | Cites I4C loss figures; normaliser refuses phone/UPI/email; static page reads straight from chain; strong friction (quota, attribute case, `$createdAt`) |
| **Asli (असली)** | Institutions publish notices from their own wallet; anyone checks a WhatsApp forward (real / altered / withdrawn / expired / unverified issuer) | (India likely) | Issuer wallets vouched by `.well-known` / DNS, historical `atBlock` lookbacks, document fingerprints | Very polished verdicts with a diff; read relay after `ANON_COST_LIMITED`; measured the cost model (100 units per query) |
| **BijliLog** | Neighbour-kept power-cut log per PIN code, Hindi/English, complaint export | CR, OS, Security (+1) | Per-device signed confirmations, records sealed to a keyless address, relay wallet pays fees | **No wallet needed for users** (relay pays gas); one-person team; demo video |
| **Switched Off** | India's internet-shutdown register: orders, durations, the law's clocks as entity expiry | (CR / India likely) | Expiry = the legal lapse of an order, archive transferred to `0x…dEaD`, permissionless extension, relay + mirror + CLI | 111 sourced orders; offline queueing; very strong narrative |
| **AbhiChahiye** | Flood-relief needs board where needs expire unless the camp reconfirms; pledges expire | CR, OS, Security (+India likely) | Urgency-based expiry, `$creator` filtering, district vouches, block-pinned reads, read relay | Cites the Assam 2026 floods; Hindi/Assamese; hostile-data handling |
| **DeadlineGuard** | Tracks changing Indian exam/application deadlines with revision chains | CR, OS, India | Revision links, pinned-block sibling checks, evidence packs | Narrower audience; honest "observer, not official" framing |
| **Under the Table** | A name-free district ledger of bribes, failures and rights violations | (India / CR likely) | Closed vocabularies (no free text), records handed to a keyless address, 3-wallet agreement | Bold topic; strong anti-PII design |
| **SlotBazaar** *(repo only, not yet in the gallery)* | Map marketplace for expiring industrial capacity (CNC hours, freight) for MSMEs | India, CR | Slots expire at `ends_at`, two-sided completion receipts as reputation, `extendEntity`, WebSocket events | **Closest to us** (expiring local listings + portable reputation), but B2B MSME, not residents |
| OpportunityScout AI | AI scout for hackathons and internships | — | No visible Arkiv integration (Python/MongoDB) | Likely fails the "meaningful Arkiv use" gate |
| Arkiv Graph + AI Passport | Graph evidence for AI tools, plus a UPI-safety learning game | — | Typed nodes/edges, signed manifests, SDK/CLI/MCP | Infrastructure-heavy; India is secondary |

### Other entries (global CROPS tracks)

Warrant canaries (Lapse, CROPS Canary, Arkiv Canary), evidence and audit logs (Receipt Log, SiteLog, Tacho, Arkiv Vault, Door Ledger, Fine Print Ledger, TagWitness, Mirrorlease, On the Clock, Arkify, Beacon, Officially), registries (LCRD Open Registry), reputation (ProofGraph). Mostly verification and transparency tools. **No other entry is a two-sided marketplace with a consumer mobile app**, and none ships an automation layer like Arkiv Triggers.

## Where we stand

**Strengths (what to lead with):**
- **Daily, two-sided, Indian:**
  - A resident in a gated society and a runner already heading there is a real interaction that repeats every day, rather than a once-a-year verification check.
  - UPI at the gate, the kirana on the route, Hindi and Kannada, a "bhaiya" culture that everyone recognises.
- **Product quality:**
  - A full mobile-first app (Android and web from one codebase), a designed brand system, live map tracking, motion, and states for offline, expired and quota.
  - Most entries are single-purpose web pages.
- **Depth of Arkiv use, each tied to something the user sees:**
  - Receipt `$creator` vs `$owner` with `changeOwnership` in one atomic batch.
  - Read-only records.
  - Per-type expiry: runs ETA+10 min, location 2 min, shops 30 d with permissionless "still open".
  - Typed range queries for the live board.
  - Atomic accept + capacity.
  - `predictEntityKeys` for the handoff commit.
  - `atBlock` re-verification of no-shows.
- **Arkiv Triggers:**
  - A genuinely new, reusable layer ("Zapier for expiring data", listed as unexplored on the hub): subscriptions are entities, one shared watch replaces N polling phones, and every action gets a signed receipt.
  - It makes no-shows provable, closing a limit every reputation project has.
  - It ran live on Tiramisu (see `TRIGGERS_LIVE_TEST.md`).
- **Friction report:** 23 findings, with measured numbers (536 → 10 calls/min), reproductions and suggested fixes.

**Gaps vs the strongest India entries (fix or address in the narrative):**

| Gap | Who does it better | Action |
|---|---|---|
| Users must get test GLM before acting on the real app ("works for them today", "usable without asking") | BijliLog (relay wallet pays fees) | **P0:** add an automatic small top-up for new accounts from a funded wallet (rate-limited per IP / per address, signed request), or a fee-paying relay. Until then, point judges to the sandbox for acting and the real app for reading. |
| No cited Indian evidence in the README | ScamWatch (I4C), Asli (MHA, Indeed), AbhiChahiye (press), Switched Off (Access Now), SlotBazaar (survey n=46) | Add a short "Why India" section with sources (quick-commerce delivery fees, gated-community population, gig-worker reputation lock-in) and, if possible, 3–5 quotes from riders and residents (consented, anonymised). |
| Public key in the browser bundle, so a single busy hour can exhaust it | Asli, Switched Off, AbhiChahiye (read relays) | **P0:** a read-only relay function on Vercel with caching (`SUBMISSION.md` §3.1) |
| Demo video not recorded | BijliLog, Switched Off, DeadlineGuard have one | Record per `SUBMISSION.md` §6 |
| Track choice | Most India entries also enter CR / Security / OS | Enter **Best Indian Use Case** + **Security**. We filter everything by `$creator` and re-verify evidence, and Security's rubric asks for exactly that. Only add more tracks if the "Why this pillar" answer is strong. |

**Positioning line for judges:** *"Every other India entry is a ledger you check. Bhaiya Please is a market you use every evening: the resident asks, the neighbour brings it, and the trust that makes it work belongs to the runner, on Arkiv, with alerts and no-show proofs run by an open trigger network anyone can reuse."*
