# Bhaiya Please — UX Spec (hackathon PWA, ~1.5 dev-days)

Source of truth for product: `docs/BRIEF.md`. This doc = screens, states, components, copy, demo path, build order.
Method names are aligned to `packages/core/src/interface.ts` (the frozen contract). See "Interface alignment" at the end.

## 0. Design principles (cut anything that breaks these)
1. **One-handed, thumb zone.** Primary CTA is a sticky bottom bar, min 48px tall. No hamburger, no modals-in-modals.
2. **Low-end Android / patchy 4G.** Initial JS <= 250 KB gz; lazy-load scanner + wallet-export routes. System font stack. No map, no images, no animation except a 1s countdown tick and a spinner. High-contrast (sun on a bike). PWA shell cached; offline = read-only banner "Offline — can't post".
3. **Every write has 4 states**: idle -> `pending` (button disabled + spinner + "Sending… ~3 s") -> `confirmed` (toast + UI updates) -> `failed` (inline red banner + [Try again]). Never double-submit (see §3 `useTx`).
4. **Every Arkiv feature is visible** (expiry, ownership, readonly, permissionless extend, tiers). Each screen below lists its "Arkiv you can see" line; put a tiny `ⓘ` link on it opening a one-line explainer sheet (judges read these).
5. **Pseudonymous.** Identity = `AliasChip` ("Saffron Tiger · 0x3f…a1"). Never ask for name/phone/flat. Meeting point is always "the gate".

## 1. Navigation map

Top bar (all screens): `[Bhaiya Please]  [Role ▾ Resident|Runner]  [avatar -> Wallet]`. In Demo mode a thin amber **DemoBar** sits under it (see §1.2).
Role is per-tab (`sessionStorage`), so two windows can hold different roles.

```
Welcome ──> Wallet setup ──> Zone picker ──> (role home)
                                              │
 RESIDENT tabs:  [Runs] [My requests] [Me]
   Runs ─> Run detail+Shop picker ─> Request form ─> Request status ─> Handoff QR ─> Rate/Complaint
 RUNNER tabs:    [Run] [Requests] [Scan] [Me]
   Run (announce / my active run) ; Requests (accept) ; Scan (QR+manual) ; Me
 VERIFIER tabs:  [Scan] [Issued]        (demo mode, or ?verifier=1)
 Anywhere: Profile(addr) via tapping any AliasChip ; Wallet via avatar
```
### 1.1 Screen list (route -> screen)
`/` Welcome · `/wallet/setup` Wallet setup · `/zone` Zone picker · `/r` Resident home (Runs) · `/r/run/:key` Run detail + Shop picker · `/r/request/new?run=` Request form · `/r/request/:key` Request status · `/r/request/:key/handoff` Handoff QR · `/r/request/:key/rate` Rate (Receipt) / Complaint · `/u/run` Runner home (announce) · `/u/requests` Runner incoming + accept · `/u/scan` Runner scan · `/p/:addr` Profile · `/v` Verifier console · `/wallet` Wallet.

### 1.2 Demo mode (judges, desktop, outside India)
- Welcome has two buttons: **[Try demo (no setup)]** (primary) and [I'm a resident / runner] (real flow).
- Demo start = one tap: set `demo=1`, pick zone (default "Lotus Heights, Demo Zone A"), create **three role wallets** (`sl.wallet.resident|runner|verifier` in localStorage; verifier wallet is the env demo verifier or a pre-funded one), run Wallet-setup "fund" step for each in parallel with one progress list, land on Resident home.
- **DemoBar**: `DEMO · Zone A · [Runner][Resident][Verifier] · ⧉ Open in new window`. Switching role swaps active wallet instantly (no reload). `⧉` opens `/?demo=1&zone=A&role=resident` in a new window (same localStorage wallets, role from query -> sessionStorage). Rule: **never keep a global "active wallet" in localStorage**, only per-role wallets + per-tab role.
- DemoBar shows `Runner: Saffron Tiger · ₹ – · 0.012 ETH` style balance chips so judges see who is who. A [Reset demo] link wipes `sl.*` keys.
- Outside demo mode DemoBar and Verifier role are hidden (Verifier visible only if wallet address is in the trusted-verifier config or `?verifier=1`).

## 2. Screens

Legend: **Data** (core method) · **Does** (core method) · **States** · **Arkiv visible**.

### S1 Welcome / Onboarding `/`
Purpose: 5-second pitch + demo entry.
```
┌──────────────────────────┐
│ Bhaiya Please  साथ लाओ?        │
│ Someone's already going   │
│ to your gate. Ask them.   │
│ [ Try demo (no setup)  ]  │
│ [ I live in a society  ]  │
│ [ I'm heading that way ]  │
│ No names. No phone no.    │
└──────────────────────────┘
```
Does: Try demo -> §1.2. Others -> Wallet setup with role preselected. Returning user with ready wallet skips to role home.
Arkiv visible: footer "Runs vanish on their own. Your receipts are yours." ⓘ.

### S2 Wallet setup `/wallet/setup` (slot for architect's funding mechanism)
Purpose: get a working funded burner wallet with <= 2 taps. One component `<WalletGate>` wraps every write screen: if state != ready it renders this screen inline.
```
State A no wallet      State B unfunded            State C ready
[ Create my wallet ]   Saffron Tiger 0x3f…a1       ✓ Wallet ready
 "Stays on this phone" [QR of address] [Copy]      Saffron Tiger
 [Import from QR]      Balance 0 · waiting…        Balance 0.05
                       [ Get test funds ]  <-SLOT  [ Continue ]
                       (error: [Try again] [Open faucet ↗])
```
Data: wallet module (local keystore); balance via `getBalance` poll every 3 s while on State B. Does: `createWallet`, `importWallet` (wallet module, not core); **[Get test funds] opens the faucet link and polls `getBalance` (no `fundWallet` in core; see ARCHITECTURE.md wallet funding). UI contract: returns pending -> ready | failed(reason) within ~10 s.**
States: B shows pending spinner on button; failed shows reason + fallback link to hub.arkiv.network/faucet with the address auto-copied. Auto-advances to C when balance > 0.
Arkiv visible: "Your wallet is a key on this phone. Back it up (Wallet)." nudge on C with [Back up now] (-> S15), dismissible.

### S3 Zone picker `/zone`
Purpose: choose the building zone (resident) or the from-zone/dest-zone defaults (runner).
```
Where are you?
( ) Lotus Heights, Zone A  tdr1wx
( ) Green Park Apts, Zone B tdr1wq
[ Use my location ] (optional)
[ Continue ]
```
Data: static `ZONES` config (name, geohash-6, geohash-5). Demo: two cards only. [Use my location] = `navigator.geolocation` -> geohash-6 on device, nearest zone snap; **cuttable**. Copy: "Only a rough area leaves your phone."
Arkiv visible: shows the geohash string in grey next to the name ("this is all the chain ever sees").

### S4 Resident home — Runs `/r`
Purpose: see live runs heading to my zone; the "board".
```
Lotus Heights ▾            ● live
┌──────────────────────────┐
│ Saffron Tiger · 0x3f…a1  │
│ [VERIFIED] cap ₹500      │
│ Arrives in 08:42   ▓▓▓░  │
│ 2 slots left · 212 handoffs│
│ Going via: Sharma Kirana │
│              [ Ask ▸ ]   │
└──────────────────────────┘
(no runs) "Nobody's heading your way. Runs appear here live."
```
Data: `listLiveRuns(destZone)` + `subscribe('runs', zone)` (polling watchEntityEvents; refetch on event). Per card: `getProfile(runner)` for tier + handoff count (batch, cached 30 s). Countdown from `eta` (client tick 1 s): >10 min "in 24 min", <=10 min "mm:ss", past ETA "At the gate now" until expiry.
Does: tap card -> S5. Pull-to-refresh = manual refetch.
States: loading skeleton (2 cards); empty (above); live; **expired**: client computes `$expiresAt` (no expiry event exists) -> card greys with "Run ended", removed after 3 s; capacity 0 -> card hidden. Offline banner.
Arkiv visible: **countdown ends and the card disappears with no one deleting it** (expiry = ETA+10 min); tier badge + price cap from attestation/receipts; handoff count = receipts owned by runner. Footer link "Why did it vanish?" ⓘ.

### S5 Run detail + Shop picker `/r/run/:key`
Purpose: choose the shop on the runner's route; keep the shop map truthful.
```
< Saffron Tiger's run · in 08:42
Shops on the way (Zone from-5)
(•) Sharma Kirana   grocery
    Last confirmed 3 d ago  [Still open ✓]
( ) Fresh Bakes     bakery
    Expires in 2 d ⚠        [Still open ✓]
[ Continue with Sharma Kirana ]
```
Data: `listShops(from5, category?)` (category chips: grocery/bakery/stationery/household/OTC pharmacy; no tobacco/alcohol/Rx — not offered), shop `$expiresAt` -> "Last confirmed N d ago" and amber warning when < 3 d left.
Does: **[Still open ✓] -> `confirmShopOpen(shopKey)`** (any wallet; extend 30 d). Pending: chip shows spinner; confirmed: "Thanks — confirmed just now" and expiry label resets; failed: chip red "Couldn't confirm [retry]". Per-wallet 1 tap per shop per session (disabled after success).
States: loading; empty "No shops listed for this route. [Add a shop]" (**Add shop = cuttable**: category + name tag, `listShop`); 
Arkiv visible: **"Still open?" extends the shop's life by anyone (permissionlessExtension); shops nobody confirms disappear.** Show "Confirmed by neighbours" sublabel.

### S6 Request form `/r/request/new?run=`
Purpose: 1–3 items, max price (tier-capped), tip.
```
From Sharma Kirana · via Saffron Tiger
Items (1–3)
[ 1 litre curd            ] [x]
[ + add item ]
Max price   [ − ] ₹ 150 [ + ]   cap ₹500 (Verified)
Tip         [ ₹10 ][ ₹20 ][ ₹30 ][ other ]
You pay by UPI at the gate, after you see it.
[ Send request ]  ← sticky
```
Data: run tier -> cap and `capacity_left`; items/notes are free text kept in request payload (max 140 chars each; warn "Don't write your flat number or name").
Does: `postRequest(run, shop, items, maxPrice, tip)`; generates 4-digit code + 16-byte salt **at submit**, uses predicted key for commit (core handles); app stores `{code,salt}` in localStorage `sl.handoff.<reqKey>` BEFORE sending.
States: validation (price > cap -> stepper stops, hint "Cap is ₹500 for this runner"); pending (button "Sending… ~3 s", form inputs disabled); confirmed -> S7; failed (banner "Request didn't go through. Nothing was sent. [Try again]" — secret stays stored so retry reuses it); run expired mid-form -> banner "This run just ended" + [Back to runs]; capacity filled -> same.
Arkiv visible: price cap = runner tier; "Locked after sending — nobody can edit your request (read-only)" under the button.

### S7 Request status `/r/request/:key`
Purpose: live timeline posted -> accepted -> delivered -> rated.
```
Curd ×1 · Sharma Kirana · ≤₹150 +₹20 tip
●─────○─────○─────○
Posted Accepted Delivered Rated
Posted 2 s ago · waiting for Saffron Tiger
Run arrives in 07:10
[ Show handoff code ]  (enabled once Accepted)
```
Data: `getRequest` + `getAcceptForRequest` + `getDeliveryForRequest` (status derived in the screen hook) + `subscribe('request', key)`. Run ETA countdown from run.
Does: [Show handoff code] -> S8; when Delivery appears (runner revealed code) a full-width card pops: "Delivered ✓ Saffron Tiger confirmed the handoff. [Rate it]" -> S10. [Cancel] **cuttable** (deleteEntity on request).
States: posted (pending, spinner dot); accepted (alias chip of runner, tap -> profile); delivered; run expired before accept -> "Run ended, request expired. [See other runs]"; failed tx n/a (read-only).
Arkiv visible: each step is its own on-chain record; step labels link "see on Explorer ↗" (for judges, small).

### S8 Handoff QR `/r/request/:key/handoff`
Purpose: at the gate, prove handoff without revealing anything in advance.
```
        Show this to Saffron Tiger
      ┌───────────────┐
      │  ▓▓ QR ▓▓     │
      └───────────────┘
            4 8 2 7        ← 72px mono
   Say this if the scan won't work
   [ Copy handoff text ]   (desktop demo)
   Pay ₹150 + ₹20 by UPI after you see the curd
```
Data: `sl.handoff.<reqKey>` {code,salt}; QR text = `bhaiyaplease:h1:<reqKey>:<code>:<saltHex>`. Max brightness hint ("Turn brightness up"), screen stays awake (`navigator.wakeLock`, best-effort).
Does: nothing on-chain here. Auto-navigates back to S7 on Delivery event.
States: missing secret (cleared storage) -> "Can't show code on this device. [Raise a problem]" (rare; no recovery).
Arkiv visible: caption "Only a fingerprint of this code is on the chain until you show it" ⓘ.

### S9 Rate / Receipt / Complaint `/r/request/:key/rate`
Purpose: resident issues a receipt owned by the runner, or a complaint owned by the resident.
```
How was the handoff?
[👍 Good]            [⚠ Problem]
Tags: [ on time ][ right item ][ polite ]
[ Give receipt to Saffron Tiger ]
——— after confirm ———
RECEIPT
Issued by Saffron Tiger? no: by YOU (Resident Lotus Mango · 0x91…2c)
Owned by Saffron Tiger · can't be edited · valid 1 year
```
- **Good** -> positive tags only (no stars, no text). `issueReceipt(delivery, rider, tags)` = create + changeOwnership atomic batch. Pending: "Handing receipt over…"; confirmed: receipt card above with "Issued by [you alias] · Owned by [runner alias] · Read-only — nobody can edit it"; failed: [Try again] (batch is atomic, safe to retry; button locked while pending).
- **Problem** -> reasons: no_show / wrong_item / rude. `fileComplaint(rider, request, reason)`. Confirmed copy: "Filed. You own this record; Saffron Tiger can't delete it. It fades after 6 months."
- States: delivery not yet revealed -> disabled, "Waiting for handoff…"; already rated -> shows existing receipt/complaint (read-only).
Arkiv visible: **the receipt card literally shows `$creator` = me, `$owner` = runner, readonly**; complaint card shows "belongs to you".
Runner-side variant (no-show complaint against resident): **cut**.

### S10 Runner home — Announce / My run `/u/run`
Purpose: announce a short-lived run for a trip already being made.
```
You're heading to…  [Lotus Heights ▾]
From (where you are) [Green Park ▾]
Arriving in  ──●────  25 min   (10–60)
Can take     [ − ] 2 [ + ]   (your tier max 2)
Your tier: VERIFIED · ₹500 cap
This must be a trip you're already making.
[ Announce run ]  ← sticky
```
Data: `getProfile(me)` -> tier, max capacity (slider clamps); tier explainer link -> S12. Default from-zone from zone picker.
Does: `announceRun(destZone, fromZone, etaUnix, capacity)`. **After confirm the screen becomes "My active run"**: countdown, `capacity_left`, list of incoming requests count -> tab Requests, [End run early] **cuttable** (`deleteEntity`).
States: pending (disabled, "Announcing… ~3 s"); failed [Try again]; active run exists -> form hidden (1 active run per wallet; core enforces/ui hides); run expired -> "Run ended. [Announce another]".
Arkiv visible: "This run disappears by itself 10 min after you arrive" under button; tier badge/caps shown as the limits.

### S11 Runner incoming requests `/u/requests`
```
Your run · 12:03 left · 1 slot left
┌─────────────────────────────┐
│ Lotus Mango · 0x91…2c  NEW  │
│ Curd ×1 · Sharma Kirana     │
│ ≤ ₹150 · tip ₹20            │
│ Complaints vs this wallet: 0│
│ [ Accept ]                  │
└─────────────────────────────┘
```
Data: `getRequestsForRun(runKey)` + `subscribe`; resident `getProfile` for complaints filed *by* them (cuttable; show just alias). Items shown here.
Does: **[Accept] -> `acceptRequest(request)`** (batch: create Accept + patch Run.capacity_left). Pending: card "Accepting…" (other Accept buttons disabled — single in-flight); confirmed: card moves to "Accepted — meet at gate"; failed (e.g. capacity just hit 0 / run expired): "Couldn't accept — [reason]".
States: empty "No requests yet. Residents see your run live."; capacity 0 -> remaining pending cards dim "Run full"; run expired -> list read-only.
Arkiv visible: capacity counter drops live on resident's card (atomic patch) — point at it in demo.

### S12 Runner scan `/u/scan`
Purpose: at the gate, scan resident's handoff QR -> record delivery.
```
┌───────────────────────┐
│     camera viewfinder │
└───────────────────────┘
Point at the resident's QR
[ Enter code instead ]
— manual —
Handoff text  [ bhaiyaplease:h1:… ] [Paste]
 or  4-digit [____]  salt [____]  request [pick ▾]
[ Confirm handoff ]
```
Data: accepted requests of my run (for manual picker). Scan result parsed -> auto-selects request.
Does: `recordDelivery(request, code, salt)` — core verifies commit locally first; mismatch -> "Code doesn't match. Ask them to refresh" (no tx sent). Pending "Recording handoff…"; confirmed full-screen green "Handoff done ✓ Waiting for receipt…" then listens for receipt owned by me -> "+1 handoff" toast; failed [Try again].
States: camera denied/not available (desktop w/o webcam) -> manual panel auto-expands; camera error text "Allow camera, or type the code".
Arkiv visible: "Anyone can verify this handoff later" + count increments on S13 after receipt.

### S13 Profile `/p/:addr` (and `Me` tabs)
Purpose: the portable, runner-owned reputation; also what a resident checks before trusting.
```
Saffron Tiger · 0x3f…a1   [TRUSTED]
Cap ₹1,000 · 3 requests/run
212 handoffs from 140 residents
Last 30 days: 18 from 12
Vouched by
 ✓ Welfare Assoc. Lotus Heights (verifier)   until Apr 2027
Complaints (30 d): 1   [see]  ← belongs to residents
Recent receipts  (list: issued by Lotus Mango · Oct 12)
How tiers work ▾   New ₹200/1 · Verified ₹500/2 · Trusted ₹1000/3
[ Show my runner QR ]  (Me only)
```
Data: `getProfile(addr)` -> {tier, receiptCount, distinctResidents, last30, attestations[{verifier,level,at,expires}], complaints[{reason,at}], receipts[]}. Verifier name = `TRUSTED_VERIFIERS` config label (synthetic), else alias; **only attestations from trusted verifiers show as vouching**; others "Unknown verifier (ignored)" greyed.
Does: [Show my runner QR] -> full-screen QR `bhaiyaplease:w1:<address>` (for verifier scan). Runner Me tab also has [Extend my receipts] **cuttable** (extendEntity).
States: loading skeleton; new wallet "No handoffs yet — you're New: ₹200, 1 request per run"; revoked attestation just vanishes (tier drops) — toast on Me: "Verification removed by <verifier>"; complaint detail sheet: "Filed by Lotus Mango. You can't delete this."
Arkiv visible: **tier badge + cap, distinct-resident count, 30-day window, verifier name, complaint immutability, receipts expiring in 1 year**; "No score is stored. Every app can compute its own" ⓘ.

### S14 Verifier console `/v`
```
Scan a runner's QR
┌───────────────────────┐
│ camera                │
└───────────────────────┘
[ Paste runner address ]   (desktop demo)
——— after scan ———
Saffron Tiger · 0x3f…a1  (current: New)
Level: (•)ID checked ( )Resident
[ Issue attestation ]  (valid 6 months)
Issued tab:  Saffron Tiger — ID checked  [ Revoke ]
```
Data: `getProfile(runner)` current attestations; Issued tab = `getMyIssuedAttestations()`. Does: `issueAttestation(subject, level)`; revoke = `revokeAttestation` (delete). Pending/confirmed ("Saffron Tiger is now Verified") /failed; Revoke asks one confirm sheet. Duplicate (already attested by me) -> button "Already issued".
Arkiv visible: **runner's card flips to VERIFIED live on the other window**; "You own this record so you can revoke it. 180-day expiry."
Copy: "Check their ID in person. Don't write it anywhere here."

### S15 Wallet `/wallet`
```
Saffron Tiger
0x3f…a1c2 [Copy]   [QR]
Balance 0.048 [Get more funds]
[ Back up (show key QR) ]   ⚠ "Anyone who scans this controls your handoffs"
[ Import wallet (scan / paste) ]
[ Switch to MetaMask ] (cuttable)
[ Sign out of this phone ]
```
Data: wallet module + `getBalance`. Backup requires tap-and-hold 1 s to reveal key QR + 30 s auto-hide. Import overwrites current only after confirm "This replaces your current wallet; back it up first." Import = lazy-loaded scanner (reuse S12 `QrScanner`) or paste text. Demo mode: shows 3 role wallets, no sign-out.
Arkiv visible: "Lose your phone? Import your key to keep your receipts." (changeOwnership story); successor attestation: **cut**.

## 3. Component inventory (`apps/web/src/components`)
| Component | Props | Notes |
|---|---|---|
| `AppShell` | `role, tabs, children` | top bar, role switcher, bottom tabs, DemoBar slot |
| `DemoBar` | `zone, role, onRole, onOpenWindow` | demo only |
| `WalletGate` | `children, need:'ready'` | renders S2 states inline when not ready |
| `AliasChip` | `address, showHandle=true, onClick->profile` | alias from `aliasFor(addr)`: 64 colour+spice words × 64 animals from address bytes (e.g. "Saffron Tiger"); handle `0x3f…a1` |
| `TierBadge` | `tier:'new'\|'verified'\|'trusted', showCap` | colour + text, never colour only |
| `Countdown` | `to:number(unix s), onEnd, format:'auto'` | one shared 1 s ticker (`useNow()`); "in 24 min" / `08:42` / "At the gate" |
| `RunCard` | `run, profile, onAsk` | S4, S11 header |
| `ShopRow` | `shop, selected, onSelect, onConfirmOpen` | shows `ExpiryLabel`, owns still-open tx |
| `ExpiryLabel` | `expiresAt` | "Last confirmed 3 d ago" / "Expires in 2 d" |
| `RequestCard` | `request, actions` | runner + resident views |
| `StatusTimeline` | `steps, current` | S7 |
| `PriceStepper` | `value, cap, step=10, onChange` | clamps at cap |
| `QrDisplay` | `value, size, caption` | S8, wallet QR |
| `QrScanner` | `onResult(text), onError, facing='environment'` | lazy; includes manual fallback slot |
| `ManualHandoffEntry` | `requests, onSubmit({code,salt,requestKey})` | paste text or code+salt |
| `ReceiptCard` | `receipt` | "Issued by X · Owned by Y · Read-only" |
| `ComplaintRow` | `complaint, viewerIsRunner` | immutability line |
| `TxButton` | `onTx:()=>Promise, labels{idle,pending,done}, variant` | wraps `useTx`; disabled while pending |
| `TxBanner` | `state, error, onRetry` | failed state, inline |
| `ArkivNote` | `text, explainer` | the small `ⓘ` line; opens `Sheet` |
| `Sheet`, `EmptyState`, `Skeleton`, `OfflineBanner` | — | |

Hooks: `useTx(fn)` -> `{state:'idle'|'pending'|'confirmed'|'failed', run, reset, error}`; ref-guard ignores calls while pending (no double submit); on failure shows `TxBanner`, retry reuses the same client-generated inputs (code/salt, tags). `useLive(queryFn, subscribeTopic)` = initial fetch + `subscribe` refetch + 5 s poll fallback + stale-while-revalidate. `useNow()` shared ticker. `useWallet()`, `useRole()`.
**Optimistic rule:** after a write, show the new item immediately with dashed border + "pending", replace on confirmation/event; remove with failure banner if it fails.

### Libraries (keep to these three + hand-rolled rest)
- **`qr-scanner`** (nimiq, ~16 KB, worker-based): works on Android Chrome and desktop webcams, camera selection, lazy-loadable. Pair with a manual fallback always.
- **`qrcode.react`** (`QRCodeSVG`, ~5 KB): crisp SVG QR at any size, no canvas, SSR-free.
- **`sonner`** (~4 KB): accessible toasts, stackable, trivial API, good on mobile.
Hand-roll: countdown (`useNow` + `Intl.RelativeTimeFormat`), alias generator, `Intl.NumberFormat('en-IN')`, routing via `react-router-dom` (already assumed) — no date library, no state library (React context + `useLive`). Geohash only if "use my location" is built (`ngeohash`, 2 KB) else skip.

## 4. Copy guidelines
- Plain English, short, second person, active. Hinglish only in warmth moments: welcome "Bhaiya, please le aana?", empty states ("Abhi koi run nahi — jaldi aayega"), success toasts ("Ho gaya ✓"), never in errors, prices or legal/safety text.
- Rupees: `₹1,000` via `Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0})`. Tips "₹20". Never decimals.
- Time: relative ("in 24 min", "3 d ago"); under 10 min use mm:ss; absolute dates only in profile ("Oct 2026").
- Errors: say what happened + whether anything was sent + one action. "Didn't go through. Nothing was sent. [Try again]". Chain jargon never ("transaction", "gas", "nonce" appear only in a collapsed "Details" line).
- Pending copy: "Sending… ~3 s"; confirmed: past tense, one line.
- Safety lines (fixed): "Meet at the gate." "Pay by UPI after you see the item." "Don't write names, flat numbers or phone numbers."
- All strings in `apps/web/src/strings/en.ts` as a flat typed object `S`, used as `S.runs.empty` / `fmt(S.run.slotsLeft,{n})`. No i18n library; leave `hi.ts` as `Partial<typeof en>` stub for later. ESLint rule or review check: no string literals in JSX except punctuation.

## 5. Demo path (3 minutes, two browser windows)
Setup before recording (not shown): two windows side by side, **L = Runner** (`/?demo=1&zone=A&role=runner`), **R = Resident** (`...role=resident`); verifier is a third tab or flip L's role. Seeded shops exist; demo wallets funded. Use a fresh **New** runner wallet so verification visibly changes it; the Trusted profile at 2:25 is a seeded runner.

| Time (§11) | Window | Clicks | Shown |
|---|---|---|---|
| 0:00–0:20 | voiceover + interview clip | Welcome screen visible | problem |
| 0:20–0:45 | L then R/third tab | L (Runner): Me -> **[Show my runner QR]**, tap Copy address. Third tab or DemoBar -> **Verifier**: paste address (or scan if filming a phone) -> **[Issue attestation: ID checked]** | L profile and R's run cards flip NEW ₹200 -> VERIFIED ₹500 live (toast "Saffron Tiger is now Verified") |
| 0:45–1:20 | L Runner tab Run | **Announce run** (dest Zone A, 20 min, capacity 2) -> confirm | R (Resident, Runs) card appears live with countdown + VERIFIED badge + cap ₹500 |
| | R | tap card -> Shop picker, tap **[Still open ✓]** on Sharma Kirana (expiry label resets) -> Continue -> Request form: "1 litre curd", price ₹150, tip ₹20 -> **Send request** | status "Posted" |
| | L | Requests tab -> **[Accept]** | R timeline -> Accepted; capacity on card 2 -> 1 |
| 1:20–1:50 | R | **Show handoff code** (QR + 4 digits) | |
| | L | Scan tab -> (webcam on R's screen) or **Enter code instead -> Paste** copied handoff text -> **Confirm handoff** | "Handoff done ✓" ; R shows "Delivered ✓" |
| | R | **Rate it -> Good -> tags -> Give receipt** | ReceiptCard "Issued by you, owned by Saffron Tiger, read-only"; L Me: "1 handoff from 1 resident" ticks |
| 1:50–2:25 | R/L + Explorer tab | tap ReceiptCard "see on Explorer ↗": `$creator`=resident, `$owner`=runner, readonly. Back: Problem -> complaint on a second prefilled request (or show seeded one): "You can't delete this — it belongs to the resident". Show Run card vanishing at expiry (use a pre-announced 1-min run staged before filming) | Arkiv features |
| 2:25–3:00 | any | Profile of a seeded Trusted runner (212 handoffs / 140 residents) | closing line "Bhaiya, please le aana if possible." |

Staging tips: pre-announce a second run with ETA in ~1 min so the expiry vanish happens on camera; one browser per role with window titles; zoom 125% for video.

## 6. Build order (frontend, vs mock core; target: end-to-end flow by Friday midday)
Must have, in this order:
1. **Shell + infra (2 h):** Vite/Tailwind/PWA manifest, routes, `AppShell`, role-per-tab, `strings/en.ts`, `useTx`, `useLive`, `useNow`, `AliasChip`, `TierBadge`, `Countdown`, toasts. Wallet module + S2 with *mock* fund (instant).
2. **Demo mode + Zone picker (1 h):** DemoBar, 3 role wallets, role switch, `⧉ new window`.
3. **Runner announce (S10) + Resident Runs (S4):** first live cross-window moment (mock subscribe via BroadcastChannel/in-memory is fine if core mock supports it).
4. **Shop picker + still-open (S5), Request form (S6), Request status (S7), Runner requests/accept (S11).**
5. **Handoff QR (S8) + Runner scan with manual fallback (S12) + Rate/Receipt (S9).** Do the manual paste path *first*, camera second.
6. **Profile (S13)** with tier, distinct-count, 30-day, vouched-by, complaints.
7. **Verifier console (S14)** (paste path first, scanner second) + runner QR on Me.
8. **Wallet screen (S15)** export/import.
9. Swap mock for real core; real funding in S2; empty/failed/expired states pass; PWA install + offline banner; test on a real low-end Android.

Cuttable (in this order of cutting): Add-shop · request cancel / end-run early · Use-my-location + geohash lib · MetaMask · camera scanning in wallet import (paste instead) · Hinglish extras · complaint detail sheet · explorer deep links (keep for S9 only) · successor/key-loss UI · wake-lock · category chips (hard-code grocery).
Never cut: the 4 tx states, countdown/expiry vanish, tier badge + cap, receipt ownership card, still-open tap, complaint immutability line, Demo mode.


## Interface alignment (added after interface.ts was frozen)
| UX spec originally assumed | Use instead (interface.ts) |
|---|---|
| `fundWallet` | none. Faucet link + poll `getBalance` (funding approach: ARCHITECTURE.md) |
| `getRequestStatus` | `getRequest` + `getAcceptForRequest` + `getDeliveryForRequest`, derived in a `useRequestStatus` hook |
| `listRequestsForRun` | `getRequestsForRun` |
| `listAttestationsBy(me)` | `getMyIssuedAttestations` |
| (not in spec) | `inspect(key)` for the on-chain proof panel on Receipt/Complaint, `verifyDelivery`, `encodeHandoffQR`/`decodeHandoffQR`, `encodeAddressQR`/`decodeAddressQR` |
| Run tier badge | compute from `getProfile(runner)`; never trust the run's `claimedTier` |


## 7. Maps and live location (added 16 Oct)
Supersedes principle 2's "No map" for these screens only; the map chunk (MapLibre GL + OpenFreeMap vector tiles, no API key) is lazy-loaded on web so first paint is unchanged. Native: `@maplibre/maplibre-react-native` in a dev/production build; Expo Go shows a schematic SVG map (same pins and routes).
- **Resident home `/r`**: map-first, like order tracking. Society gate pin, shops in the area as category pins, each runner heading here as a tier-ringed marker (pulse while fresh, faded when the last ping is > 60 s old, gone when it expires) gliding between pings, dashed route arc to the gate, "N min away · Ns ago" chip on the focused runner plus its breadcrumb trail. Draggable bottom sheet keeps the existing run list. Top bar: society + geohash, `● LIVE · updated Ns ago` (grey "Reconnecting…" when refreshes stall).
- **Request status `/r/request/:key`**: live tracking card above the timeline (ETA countdown chip, LIVE badge, "Last seen Ns ago · ping deletes itself in Ns"), shown while posted/accepted.
- **Shop picker `/r/run/:key`**: shops on the route on a map; tapping a pin selects the shop (synced with the list).
- **Runner home `/u/run`** (active run): own position, gate, shops on route; card "Sharing live location · deletes itself in 2 min · only a ~150 m cell" with an on/off switch, last-sent time and cell; demo mode adds **Simulate route** (synthetic movement for judges on desktop). Sharing runs app-wide for the runner role (`PingBeacon`), every 20 s, coarsened on the device.
- Live refresh: ping events invalidate only map queries; everything else still invalidates on any event; 5 s polling as backup.
- Arkiv visible: "Live location deletes itself in 2 min" note (resident sheet) with explainer; positions are ~150 m cells and say so on the map.

## Visual system

- **Tokens** live in `apps/mobile/global.css` (HSL CSS variables, light + dark) and `tailwind.config.js`. Saffron `#e2591b` is `primary` (fills, CTAs); `primary-ink` is a darker saffron for small text on light surfaces; ink `#1a1d24` is text; teal `#0f766e` is `secondary` (trust, verified); `success` is green, `warning` amber, `destructive` red. Surfaces are warm off-white (`background`) with white `card`.
- **Shape and depth**: cards `rounded-card` (20 px), sheets `rounded-sheet` (28 px), controls 12 px, chips and badges full. Shadows are single-layer so they render on web and Android: `shadow-card`, `shadow-lift`, `shadow-float`, `shadow-sheet`, `shadow-cta`.
- **Type**: Plus Jakarta Sans (400 to 800) through `expo-font` (`lib/fonts.ts`). One family per weight; `Text` maps the `font-*` utility to it. Web paints in the system sans first (`font-display: swap`). Scale: `text-display` 34, `text-title` 22, `text-eta` 32, then the Tailwind defaults.
- **Motion** (`components/Motion.tsx`, `components/ui/pressable-scale.tsx`): `Reveal` stagger for list rows, `PressScale` on buttons, tabs and selectable cards, `AnimatedNumber` for counts, `Shimmer` skeletons, `SuccessBurst` (check plus confetti-lite) on a completed handoff or receipt, `Pulse` on the LIVE dot. Everything honours the OS reduced-motion setting. Haptics (`lib/haptics.ts`) fire on buttons, tab changes, chip selection, sheet snaps and success; they are silent on web.
- **Patterns**: sticky bottom CTA bar (`Page footer`), `ChipRow`/`Chip` filters, illustrated `EmptyState`, skeletons that mirror the real card layout.
