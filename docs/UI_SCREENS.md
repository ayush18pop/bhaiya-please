# Bhaiya Please — Product UI Screen Set

Design brief for the production app (not the hackathon demo). It defines **every screen, what it is for, what it contains, what the user can do there, and every state it must handle**. It deliberately says nothing about visual theme (colour, type, illustration, motion style): that is the designer's call.

Read sections 1–4 first; they set the rules every screen follows.

---

## 1. Product in one paragraph

A **runner** who is already heading to a gated apartment society (a delivery rider on the return trip, a neighbour, a student) announces a short-lived **run**. A **resident** of that society asks them to bring 1–3 items from a local shop on the runner's route. They meet at the society gate, the resident pays by UPI, the runner scans the resident's handoff code to prove the handoff happened, and the resident gives the runner a **receipt**. The runner's reputation is the set of receipts they hold. It belongs to the runner, not to the app, so it travels with them. Names, phone numbers and flat numbers are never collected.

### Who uses it

| Person | Context | What they want |
|---|---|---|
| **Resident** | At home in a gated society, forgot one thing, doesn't want a ₹50 delivery fee or a 30-minute wait | Know who is coming, ask quickly, know it's safe, pay at the gate, done |
| **Runner** | A delivery rider riding back empty, a neighbour coming home, a student. Often outdoors, on a cheap Android phone, one hand on a scooter, in bright sun, low data | Earn a tip on a trip they're already making, build a reputation that unlocks bigger orders, minimum taps |
| **Society desk (verifier)** | Society office, RWA volunteer, security supervisor | Check a runner's ID once and vouch for them; revoke if needed |
| **Judge / first-time visitor** | Desktop, outside India, 3 minutes | See the whole loop work without setup (sandbox, section 11) |

One person can be both a resident and a runner. They are **modes of one account**, not separate accounts.

---

## 2. Product rules every screen follows

1. **No blockchain words in the main UI.** The chain is how it works, not what the user sees. Use the glossary in section 3. Technical detail lives in exactly two places: the **Verified record** sheet (D5) and **Settings → Advanced** (D8).
2. **The user never pays or sees network fees.** The app sponsors writes. There is no balance, faucet or "fund your wallet" screen in the normal flow.
3. **Privacy is a feature, so say it at the moments it matters.** Short reassurance lines at signup, when posting a request, and when turning on location: "No phone number, no flat number." / "Only a rough ~150 m area is shared, and it deletes itself in 2 minutes."
4. **Ask for permissions just in time.** Location when a runner first goes live, camera at the first scan, notifications after the first request or run. Every system prompt comes after an in-app explainer.
5. **Back up at the moment of value.** No recovery-key screen at signup. Prompt after the user earns their first receipt (runner) or after their first completed request (resident).
6. **Runner screens are built for the road.** Primary actions reachable with one thumb, large tap targets (minimum 48 dp), key information readable at a glance (ETA, slots, amount to collect), no typing during a run except item checklists.
7. **Everything is time-bound, so show time.** Runs, requests and location expire on their own. Any screen showing one of them shows a countdown or "ends in" label, and handles the moment it expires while the user is looking at it.
8. **Writes take a few seconds.** Every action that saves something has three visible states: *saving*, *saved*, *couldn't save + retry*. Never a spinner with no words.
9. **Languages:** English, Hindi, Kannada at launch (first society is in Whitefield, Bengaluru). All copy lives in one strings file; designs should allow ~30% longer text.
10. **Works offline-tolerant:** an offline banner, cached last-known data marked "as of 2 min ago", queued actions are not allowed (time-bound data makes queued writes dangerous): disable write buttons while offline and say why.

---

## 3. Copy glossary (use the right column everywhere)

| Don't say | Say |
|---|---|
| Wallet, address, private key | Account, account ID (only in Advanced), **recovery key** |
| Transaction, tx, gas, GLM, faucet | "Saving…", "Saved", "Couldn't save" (fees never mentioned) |
| Entity, Arkiv, on-chain, readonly | "Verified record", "can't be edited by anyone", "yours, not the app's" |
| Run (as jargon) | "Trip" in runner copy is fine; "Run" stays as the product noun ("Ravi's run to Lotus Heights") |
| Geohash, zone6, cell | "Your society", "a rough ~150 m area" |
| Salt, commit, reveal | "Handoff code" |
| Attestation | "Vouch" / "Verified by Lotus Heights society desk" |
| Complaint | "Report a problem" (button), "Report" (record) |
| Tier New / Verified / Trusted | Keep these three names; always pair with what they unlock |
| Alias ("Saffron Tiger") | "Public name" |

---

## 4. App structure and navigation

### 4.1 Modes
- **Get things** (resident) and **Run errands** (runner) are two modes of one account.
- Switch with a two-option toggle at the top of Home. The app remembers the last mode.
- First time someone switches to Run errands they go through runner setup (C1) once.
- **Society desk** (verifier) is not a visible mode. It unlocks only for accounts on the society's trusted-desk list, or through an invite link, and then appears as a third option in the toggle (or in Settings).

### 4.2 Tabs (same in every mode)
| Tab | Get things | Run errands | Society desk |
|---|---|---|---|
| **Home** | B1 map of runs coming here | C2 idle / C4 active run | E1 desk home |
| **Activity** | D1 (requests first) | D1 (runs first) | E3 vouches issued |
| **Profile** | D3 | D3 (reputation emphasis) | D3 (desk identity) |

### 4.3 Live strip (global)
While anything is in progress, a compact bar sits directly above the tabs **on every screen**, tappable to jump back:
- Resident: "Ravi · 4 min away · **Show code**" → B8, or the code button → B9.
- Runner: "Run to Lotus Heights · 12 min · 2 of 3 slots · **2 waiting**" → C4.
- Turns into an attention state when action is needed: runner at the gate, request accepted, receipt received.

### 4.4 Header
Screen title (or society name on Home), notification bell with unread count (D7) on Home screens only. No role switch, no balance, no theme toggle in the header.

### 4.5 Status legend used below
- **[Exists]** the screen exists today and needs redesign only.
- **[Redesign]** exists but its purpose or content changes materially.
- **[New]** doesn't exist; core already supports the data.
- **[New · needs core]** needs a small addition in `packages/core` before it can ship (listed in section 12).

---

## 5. Core journeys (what the screens must make effortless)

**J1 Resident, happy path:** Home (B1) → tap a runner (B2) → pick shop (B3) → write items (B6) → review & send (B7) → track (B8) → runner at the gate → show code (B9) → pay by UPI → rate (B10) → done.

**J2 Runner, happy path:** Home (C2) → start run (C3) → active run (C4) → accept a request (C5) → shopping list at the shop (C6) → at the gate (C7) → scan (C8) → collect payment (C9) → receipt arrives → run summary (C10).

**J3 New user:** Intro (A2) → mode (A3) → society (A4) → public name (A5) → Home.

**J4 Runner gets verified:** Profile (D3) → Get verified (D6) → walks to the society desk → desk scans (E1) → vouches (E2) → runner gets a notification, tier goes up.

**J5 Something went wrong:** request tracking (B8) or after handoff → Report a problem (B11).

**J6 New phone:** Restore (A6) with the recovery key → reputation and history are back.

---

## 6. A — Entry and onboarding

### A1 Splash  [Exists]
**Serves:** brand moment while the app restores the account and loads fonts.
**Contents:** logo, product name.
**Behaviour:** returning user → straight to Home in their last mode. New user → A2. No more than ~1 s on a normal phone.

### A2 Intro  [Redesign]
**Serves:** in 15 seconds, explain the idea and why it's safe, then get the user started. Replaces today's welcome screen whose primary button is "Try demo".
**Contents:** 3 swipeable slides:
1. "Someone's already coming your way." Neighbours and riders heading to your society.
2. "Ask for 1–3 things from the shop on their way." You set the max price and tip.
3. "Pay at the gate. Reputation that belongs to the runner." No phone numbers, no flat numbers.
**Actions:** **Get started** (primary) → A3. *I already have an account* → A6. *Look around first* (text link) → B1 in read-only browse (any write action prompts to finish signup).
**Not here:** demo button. The sandbox lives on its own URL (section 11).

### A3 How will you use it?  [New]
**Serves:** sets the default mode and tailors the first Home the user sees.
**Contents:** three choices with a one-line description each:
- *Get things delivered* "I live in a society."
- *Run errands* "I'm often heading to societies."
- *Both*
**Actions:** pick one → A4. Can be changed any time via the Home toggle.

### A4 Find your society  [Redesign]
**Serves:** sets where runs are shown for (resident) and the default destination (runner). Replaces the geohash radio list.
**Contents:**
- Search field ("Search your society or area").
- **Use my location** button. Location is used once on the device to find nearby societies; only the society is saved.
- List of nearby / matching societies with area name and distance.
- After choosing: a small map confirming the **gate pin** ("This is where you'll meet runners").
- *My society isn't listed* → request form (society name, area, pin on map) with "We'll let you know when it's live".
**Actions:** choose → confirm gate → A5.
**States:** location denied → search only; no results → request society; offline → retry.
**Data:** society list (see section 12, item 6); `zoneFromLatLng` for location.

### A5 Your public name  [New]
**Serves:** gives the user an identity others will see, without personal data. Creates the account silently on this step.
**Contents:** generated public name + avatar (e.g. "Saffron Tiger"), **Shuffle** button, language picker, reassurance: "This is all anyone sees. No phone number, no flat number."
**Actions:** **Continue** → Home (B1 or C2). Behind the scenes the account key is created and stored securely on the device.
**States:** saving name (if stored) → error retry.

### A6 Restore your account  [New]
**Serves:** bring an existing account (and all receipts) to a new phone.
**Contents:** two options: **Scan recovery QR** (from the old phone's D9) or **Enter recovery key** (paste field). Clear warning: "Never share this key with anyone, including a runner or the society desk."
**Actions:** restore → shows the found account (public name, handoffs count) → **This is me** → Home.
**States:** invalid key, camera denied (fall back to paste), restoring.

---

## 7. B — Get things (resident)

### B1 Home — runs coming to your society  [Exists, Redesign]
**Serves:** the main resident screen. Answers "Is anyone coming here soon, and can I ask them?" Modelled on order-tracking apps.
**Contents:**
- Header: society name (tap → change society), notification bell.
- Mode toggle: Get things / Run errands.
- **Map** (top ~55%): the society gate, nearby shops by category, each runner heading here as a marker with their tier, moving as their location updates, faded if their last update is old. Focused runner shows "4 min away".
- **Bottom sheet** (draggable, ~45% by default): list of run cards sorted by arrival. Each card: public name, tier, handoffs count, arriving in (countdown), coming from (area), slots left, **Ask** button.
- Small map note: "Runner positions are rough (~150 m)".
**Actions:** tap a marker or card → B2. **Ask** → B3 directly. Tap society → A4.
**States:**
- Loading: skeleton cards, map placeholder.
- **Empty:** "No one's heading to Lotus Heights right now." + **Notify me when someone is** toggle + "Most runs happen 6–9 pm" style hint if data exists.
- A run fills up or ends while visible: card shows "Full" / "Arrived at gate" then leaves the list.
- Read-only browse (not signed up): Ask → sign-up prompt.
- Offline: last-known list marked "as of N min ago", Ask disabled.
**Data:** `getLiveRuns`, `getLatestPings`, `getRunTrail`, `getShops`, `getProfile` per runner.

### B2 Runner sheet / run detail  [New]
**Serves:** helps the resident decide "Do I trust this person with ₹300?" before asking.
**Contents:** public name, avatar, tier badge with what it means ("Verified: ID checked by your society desk"), **N handoffs · M different residents**, top compliments (On time ×12, Exact item ×9), reports in last 30 days, arriving in, coming from, slots left, max order value they can take (tier cap), link **View full profile** → D4.
**Actions:** **Ask Ravi to bring something** → B3. Close.
**States:** run fills/ends while open → banner "Ravi's run is full", button becomes "See other runs".
**Data:** `getRun`, `getProfile`.

### B3 Pick a shop  [Exists, Redesign]
**Serves:** choose which shop on the runner's route the items come from.
**Contents:**
- Compact map of the route: shops as pins, runner position, gate. Tapping a pin selects that shop (synced with the list).
- Category filter chips: Grocery, Bakery, Pharmacy (OTC), Stationery, Household.
- Shop list rows: name, category, area, "Confirmed open 3 days ago", selected state.
- Footer: **Continue with Sharma Kirana**.
- Link at the bottom: **Shop not listed? Add it** → B5.
**Actions:** select → **Continue** → B6. Tap a row's info → B4.
**States:** no shops on route ("No shops listed on this route yet" + Add a shop), run ended while choosing.
**Data:** `getShops` (by area), `getShop`.

### B4 Shop sheet  [New]
**Serves:** lets neighbours keep the shop directory accurate without anyone owning it.
**Contents:** name, category, rough location on a small map, "Last confirmed open N days ago", "Disappears in N days unless someone confirms", who listed it (public name).
**Actions:** **Still open** (confirms and keeps it listed), **Select this shop**.
**Data:** `getShop`, `confirmShopOpen`.

### B5 Add a shop  [New]
**Serves:** residents and runners add the local kirana so it can be used. Core supports this today (`listShop`) but no screen exposes it.
**Contents:** shop name (free text, max length), category (5 options), pin on map (prefilled from area), note: "Shops stay listed for 30 days. Anyone can tap Still open to keep it."
**Actions:** **Add shop** → back to B3 with it selected.
**States:** saving / saved / couldn't save; duplicate warning if a shop with a similar name is already nearby.
**Data:** `listShop`.

### B6 What do you need?  [Exists, Redesign]
**Serves:** write the request fast and clearly enough that the runner buys the right thing.
**Contents:**
- Context strip: "From Sharma Kirana · via Ravi (Verified)" with arriving-in countdown.
- Item fields (1–3), each with a placeholder like "Amul Taaza 500 ml". Quick-pick chips for common items (milk, bread, eggs, curd, paracetamol strip…) that fill a field.
- **Max price** stepper with the runner's limit shown: "Ravi can take orders up to ₹500".
- **Tip** chips: ₹10 / ₹20 / ₹30 / Other.
- Guidance line: "Don't write your name, phone or flat number. You'll meet at the gate."
**Actions:** **Review** → B7.
**States:** run full or ended while writing (keep what they typed; offer "Send to another runner" → B1 with items kept), price at cap (explain why it stops).
**Data:** `getRun`, `getProfile` (cap).

### B7 Review and send  [New]
**Serves:** a clear commitment moment before anything is posted. Removes the "did I just order?" doubt.
**Contents:** items, shop, runner, arriving in, **You pay at the gate: up to ₹150 + ₹20 tip, by UPI**, how it works in 3 lines (Ravi accepts → you show your code at the gate → you pay and rate), privacy line.
**Actions:** **Send request** (saving / sent), **Edit**.
**After sending:** a secret handoff code is created on this phone only → go to B8.
**States:** run filled up in the meantime ("Ravi just filled up" + other runs), couldn't send + retry.
**Data:** `postRequest` (stores only a fingerprint of the handoff code).

### B8 Request tracking  [Exists, Redesign]
**Serves:** the "where is my stuff" screen. The resident should never need to message anyone.
**Contents:**
- Live map (top): runner position, route to gate, "Last seen 12 s ago", "Arriving in 6 min".
- Status card with steps: **Sent → Accepted → At the gate → Handed over → Rated**, the current step written in plain words ("Ravi accepted. Meet at the Lotus Heights main gate.").
- Runner card: public name, tier, handoffs (tap → D4).
- Order summary: items, shop, max price + tip.
- **Show handoff code** (primary): disabled with "Available once Ravi accepts" until accepted; becomes prominent when the runner is near or has marked "At the gate".
- Secondary: **Cancel request** (before acceptance only), **Report a problem** (after handoff), **Verified record** link (→ D5).
**States:**
- Waiting for acceptance: "Waiting for Ravi to accept · run ends in 14 min". If the run ends with no acceptance: "Ravi didn't accept in time." + **Send to another runner** (prefill items).
- Accepted.
- **Runner at the gate** (from C7): attention state, sound/vibration, code button front and centre.
- Handed over: success, **Rate Ravi** → B10.
- Runner stopped sharing location: map shows last known area, faded, "Location sharing off. ETA still shown."
- Request expired.
**Data:** `getRequest`, `getAcceptForRequest`, `getDeliveryForRequest`, `getLatestPings`, `getRunTrail`, live updates via `subscribe`.

### B9 Handoff code  [Exists]
**Serves:** proves at the gate that the right person received the items. The runner scans it.
**Contents:** large QR, the 4-digit code in very large digits ("Or read out this code"), amount to pay "Pay Ravi up to ₹150 + ₹20 tip by UPI", tip line "Turn your brightness up", **Share handoff link** (fallback for when the runner's camera fails: sends a link via WhatsApp/SMS/copy).
**Behaviour:** keeps the screen awake; closes itself and returns to B8 (handed-over state) the moment the runner's scan is saved.
**States:** code not on this phone (request made on another device): "This code only exists on the phone that sent the request." + help.
**Data:** handoff secret from device storage.

### B10 Rate the handoff  [Exists, Redesign]
**Serves:** turns a good handoff into reputation for the runner. This is the receipt the whole product is built around.
**Contents:** "How was it with Ravi?", compliment chips (On time, Exact item, Polite, Good price, Careful packing; multi-select, optional), explanation in one line: "Your receipt goes to Ravi. It's his to keep, and nobody can edit it."
**Actions:** **Give receipt** (saving / saved) → success animation showing the receipt "going to" the runner → receipt card (D5 summary) → **Done**. Secondary link: **Something went wrong?** → B11.
**States:** already rated (read-only receipt), couldn't save + retry.
**Data:** `issueReceipt`.

### B11 Report a problem  [Redesign]
**Serves:** a calm, serious path when a handoff went badly. Separate from rating so it is never an accidental tap.
**Contents:** reason (Wrong item, Rude behaviour, Other problem with handoff), what happens next: "Your report is a permanent record on Ravi's profile for 6 months. It counts against his trust level. Ravi can see it but can't delete it.", safety contacts for anything serious (society security, police 112).
**Actions:** **Submit report** (saving / saved) → confirmation with the report record → Done.
**Rule:** reports are only possible after a recorded handoff (a no-show before handoff can't be proven; say so in Help).
**Data:** `fileComplaint`.

---

## 8. C — Run errands (runner)

### C1 Runner setup (first time only)  [New]
**Serves:** sets expectations and gets consent before someone's first run. Reduces bad handoffs and support load.
**Contents (3–4 short steps):**
1. How it works: announce your trip → accept requests → buy → meet at the gate → scan the code → get paid by UPI → get a receipt.
2. **Your level sets your limits.** New: up to ₹200 per order, 1 request per run. Verified (ID checked by a society desk): ₹500, 2 per run. Trusted (Verified + 25 receipts from 15 residents, under 3 reports in 30 days): ₹1,000, 3 per run.
3. Rules: meet only at the gate, never ask for a flat number, buy only what's asked, keep the shop bill.
4. Live location: what's shared ("a rough ~150 m area, every 20 s, deleted after 2 min, only during a run"), on/off per run. In-app explainer before the system location prompt.
5. Optional: **Save your UPI QR** (stored only on this phone, shown at the gate in C9). Can be skipped.
**Actions:** **Start running** → C2.

### C2 Runner Home (no active run)  [Redesign]
**Serves:** start a run in as few taps as possible, and show the runner their progress.
**Contents:**
- Mode toggle.
- Primary card: **Going somewhere?** → C3.
- **Recent trips:** one-tap rows like "Whitefield → Lotus Heights · 20 min · 2 slots" that prefill C3.
- **Your level:** tier badge, limits, progress to the next level ("Get verified to take ₹500 orders" or "8 more receipts from 3 more residents to Trusted").
- This week: handoffs, receipts, tips (tip total is a sum of tips from requests; label it "Tips from requests").
- Demand hint (if available): "3 people in Lotus Heights wanted something in the last hour."
**Actions:** start, open recent trip, **Get verified** → D6, view profile → D3.
**Data:** `getProfile`, `getMyRuns`, `getReceiptsFor`.

### C3 Start a run  [Exists, Redesign]
**Serves:** announce a trip the runner is already making.
**Contents:**
- **Going to:** society (search/list, defaults to recent).
- **Coming from:** area (search, or "Use my location"; shops on that route are shown to residents).
- **Arriving in:** stepper, 5–60 min.
- **Can take:** 1–N requests, N set by level, with the limit explained.
- **Share live location** toggle (default on, with one-line privacy note).
- Review summary: "Residents of Lotus Heights will see your run for the next 30 min."
**Actions:** **Go live** (saving / live) → C4.
**States:** same place picked twice, location denied (toggle turns off, run still works with ETA only), couldn't save.
**Data:** `announceRun`.

### C4 Active run  [Exists, Redesign]
**Serves:** the runner's dashboard during a run: incoming requests, where to go, what's next.
**Contents:**
- Header: "Run to Lotus Heights", countdown to arrival, slots used ("1 of 2 taken").
- Map: own position, shops on route, gate.
- **Incoming requests list** (inline, newest first): resident public name, items (first line), shop, max price + tip, **Accept** / **Decline**. Accepted ones grouped above with status.
- Location sharing chip: "Sharing · last sent 8 s ago" (tap → toggle and details).
- **Next step** button that changes with progress: "Open shopping list" (C6) → "I'm at the gate" (C7).
- Overflow: **End run** (confirm: "Requests you've accepted will be cancelled" if any).
**States:**
- No requests yet: "Residents of Lotus Heights can see you. Requests will appear here."
- Run full: remaining requests shown greyed "Run full".
- Accept failed (someone else filled the last slot, run ended): inline error on that card.
- Location permission lost / sending failing: chip turns to warning with a fix action.
- Run about to end (ETA passed): "You have 10 minutes left to finish handoffs."
**Data:** `getRequestsForRun`, `acceptRequest`, `getLatestPings` (own), `publishPing` (background), `cancelRun`, `subscribe`.

### C5 Request detail (runner)  [New]
**Serves:** read one request fully before accepting or while shopping.
**Contents:** items (full text), shop with map pin and "Directions" (opens maps app), max price, tip, total to collect, resident public name, how long ago it was sent.
**Actions:** **Accept** / **Decline** (if not accepted), **Mark items bought** (if accepted), back.
**Data:** `getRequest`, `acceptRequest`.

### C6 Shopping list  [New]
**Serves:** the runner is standing in a shop with 2–3 requests. They need a checklist, not a list of cards.
**Contents:** grouped by shop: each shop → its items as checkboxes, labelled with which resident it's for ("for Neem Owl"), each request's max price. Footer: **Total to collect at gate: ₹340**.
**Actions:** tick items (saved on the device only), **Done shopping** → C4 next step "I'm at the gate".
**States:** a request cancelled by the resident while shopping (shows struck-through with a note).
**Data:** accepted requests of the active run; ticks are device-local.

### C7 At the gate  [New · needs core for the signal]
**Serves:** tells residents "I'm here", then lists who to hand over to.
**Contents:** **I'm at the gate** button (sends the signal that turns residents' B8 into the "at the gate" state), then a list of accepted requests waiting for handoff: resident public name, items, amount to collect, **Scan code**. Delivered ones move to a "Done" group.
**Actions:** scan → C8.
**Data:** at-gate signal (section 12, item 3), accepted requests, deliveries.

### C8 Scan handoff code  [Exists, Redesign]
**Serves:** proves the handoff. Today it exposes manual code + salt entry; that goes away.
**Contents:** full-screen camera with a frame, "Point at the resident's code", torch toggle, which request is being handed over (if opened from a specific row), fallback **Paste handoff link** (for when the camera fails; the resident shares it from B9).
**Behaviour:** on a valid scan: checks the code matches that request before saving → confirm sheet "Hand over to Neem Owl? Items: …" → **Confirm handoff** (saving / saved) → C9.
**States:** camera permission (explainer first), code for a different request ("This code is for another request" → switches to it if it's in this run), code doesn't match, couldn't save + retry, already handed over.
**Data:** `recordDelivery`, `verifyDelivery`.

### C9 Handoff done — collect payment  [Redesign]
**Serves:** close the loop at the gate: get paid, move on.
**Contents:** success state, **Collect ₹150 + ₹20 tip** (max amounts; actual is what the bill says), optional **Show my UPI QR** (the runner's own QR saved in C1, shown on their screen, never uploaded), "Your receipt will arrive once Neem Owl rates the handoff."
**Actions:** **Next handoff** (back to C7 if more waiting), **Finish** (→ C4 / C10).
**Later:** when the receipt arrives, a notification and a "+1 handoff" moment on the live strip.

### C10 Run summary  [New]
**Serves:** a sense of completion and progress after each run.
**Contents:** handoffs done, receipts received (and pending), tips from requests, compliments received, level progress change ("2 receipts closer to Trusted"), **Start another run** (prefilled reverse trip).
**Data:** `getRun`, deliveries, `getReceiptsFor`, `getProfile`.

---

## 9. D — Shared screens

### D1 Activity  [Redesign]
**Serves:** history and anything still in progress, in one place.
**Contents:** two segments: **Active** and **Past**. Rows for requests (items, runner, status, date) and runs (destination, date, handoffs). In Get things mode, requests are listed first; in Run errands mode, runs first. Filter: Requests / Runs.
**Actions:** tap → D2 (past) or B8/C4 (active).
**States:** empty ("Your requests and runs will show up here").
**Data:** `getMyRequests`, `getMyRuns`.

### D2 Activity detail  [New]
**Serves:** look back at one finished request or run (e.g. "what did I pay last time?", "did they get my receipt?").
**Contents:** request: timeline with timestamps, items, shop, runner, receipt or report, **Verified record** link. Run: route, time, each handoff with its receipt status.

### D3 My profile  [Redesign]
**Serves:** for a runner, this is their **reputation, which they own**; for a resident, their account hub.
**Contents:**
- Public name, avatar, level badge with limits.
- Stats: handoffs, different residents, last 30 days.
- Compliments summary (tag counts).
- Vouches: "Verified by Lotus Heights desk · until Mar 2027".
- Reports (last 30 days) with each report visible.
- Recent receipts (→ D5), **See all**.
- **Level progress** card (what's needed for the next level).
- **Share my profile:** link + QR so the runner can show their reputation anywhere (another app, a new society, an employer).
- Shortcuts: Get verified (D6), Back up account (D9, with a warning dot until done), Settings (D8).
**Data:** `getProfile`, `getReceiptsFor`, `getAttestationsFor`, `getComplaintsAgainst`.

### D4 Someone else's profile  [Exists]
**Serves:** check a runner (or resident) before or after a handoff.
**Contents:** same public parts as D3 (no shortcuts), plus "This profile is calculated on your phone from verified records. No app stores a score."
**Entry:** tap any public name anywhere, or open a shared profile link.

### D5 Receipt and Verified record  [Exists as a panel, Redesign]
**Serves:** the one place that shows *why* this is trustworthy, for curious users, journalists, judges, other apps.
**Contents:**
- Receipt card: from (resident), to (runner), date, compliments, the request it belongs to.
- **Verified record** section in plain words: "Written by Neem Owl · Owned by Ravi · Can't be edited by anyone, including us · Valid until Oct 2027 · Handoff code matched".
- **Advanced** expander: record ID, creator/owner account IDs, link to the public explorer.
**Data:** `inspect`, `verifyDelivery`.

### D6 Get verified  [New]
**Serves:** unlock the Verified level (₹500, 2 requests per run).
**Contents:** what verification means, what to bring (any government ID, shown in person, never photographed or uploaded), where to go (society desks that verify, if listed), and a large **QR of your account** to show at the desk.
**Behaviour:** when the desk vouches, the screen updates live: "You're Verified" + new limits.
**Data:** `getAttestationsFor`, `subscribe`.

### D7 Notifications  [New]
**Serves:** an in-app inbox of everything that happened, since push needs a backend (planned later).
**Events:** request accepted; runner 2 min away; runner at the gate; handoff saved; receipt received; report received; vouched / vouch removed; new request on your run; run ending soon; someone is heading to your society (if Notify me is on).
**Contents:** grouped by day, unread state, each row links to the relevant screen.
**Note:** works while the app is open or in recent memory. Push notifications are a later addition (section 12, item 2); design rows so they can double as push copy.

### D8 Settings  [New]
**Serves:** everything that isn't a daily task.
**Sections:**
- **Profile:** public name (shuffle), avatar.
- **My society:** change, request a new society.
- **Language:** English / हिन्दी / ಕನ್ನಡ.
- **Notifications:** per event type.
- **Location:** live location default for runs, permission status.
- **Payments:** my UPI QR (runner, device only), edit/remove.
- **Privacy & data:** a plain-language page: what's public (public name, runs, requests' items, receipts, rough location during runs), what stays on your phone (handoff codes, UPI QR, recovery key), what's never collected (name, phone, flat).
- **Account:** back up (D9), move to a new phone (D9), sign out (warn: "Without your recovery key you lose your receipts").
- **Help & safety** → D10.
- **About:** version, open-source licence, how it works.
- **Advanced:** account ID (copy), network, records explorer link. This is the only place balance or network details may appear.
- **Society desk** (only if unlocked).

### D9 Back up and move phones  [Redesign]
**Serves:** protects the receipts the runner earned. Today this is a "hold to reveal private key" card.
**Contents:**
- Why: "Your receipts belong to your account. If you lose this phone without a backup, they're gone."
- **Show recovery key** (requires device lock / biometric), shown as text + QR, hides after 30 s, screenshot warning.
- Checklist: "I wrote it down / saved it in my password manager".
- **Move to a new phone:** instructions to restore (A6) on the new phone; option to move all receipts to a new account if the old key may be compromised.
**Prompted:** after the first receipt (runner) / first completed request (resident), then as a reminder dot on Profile.
**Data:** device key; `transferAllReceipts` for the move-to-new-account option.

### D10 Help and safety  [New]
**Serves:** trust and support without a support team.
**Contents:** safety rules for both sides (meet at the gate, never share flat/phone, don't hand over before scanning, pay only for what arrived), FAQ (What if the runner doesn't show? What if items cost more than my max price? Why can't I report a no-show? What is a receipt? Can the app delete my reputation?), emergency (112, society security), contact/feedback link.

### D11 System states  [New, cross-cutting]
**Serves:** one consistent treatment for failures and edge cases, used by every screen.
- **Offline banner** (global) with "as of" times on cached data, write actions disabled with a reason.
- **Couldn't save** inline error with retry and a plain reason (network, run ended, run full, already done).
- **Expired** (run ended, request lapsed, code no longer valid) with the next best action.
- **Not found** (shared link to something that expired).
- **Read-only browse** sign-up prompt.
- **Maintenance / service unavailable.**

---

## 10. E — Society desk (verifier)

Unlocked only for trusted desk accounts or via invite. Used at a desk, often on a tablet or laptop browser, so layouts should also work wide.

### E1 Desk home  [Exists, Redesign]
**Serves:** verify a runner in under a minute.
**Contents:** **Scan runner's QR** (camera) or paste a profile link; recent checks; count of active vouches. Reminder: "Check the ID in person. Don't photograph or keep it."
**Actions:** scan → E2.

### E2 Check and vouch  [Exists, Redesign]
**Serves:** see who you're vouching for and record it.
**Contents:** runner public name, current level, handoffs, reports, existing vouches; vouch type (**ID checked**, **Lives in this society**); validity "Lasts 6 months, you can remove it any time".
**Actions:** **Vouch** (saving / saved) → success "Ravi is now Verified for apps that trust Lotus Heights desk". Already vouched → shows existing vouch with **Remove**.
**Data:** `getProfile`, `issueAttestation`.

### E3 Vouches issued  [Exists]
**Serves:** accountability for the desk; remove vouches when needed.
**Contents:** list of runners vouched for, type, date, expiry, search.
**Actions:** **Remove vouch** (confirm: "Ravi will lose Verified status in apps that trust you").
**Data:** `getMyIssuedAttestations`, `revokeAttestation`.

---

## 11. F — Sandbox (demo for judges and first-time visitors)

Kept, but **completely separate from the real product**: its own URL (sandbox build) and an unmissable "Sandbox · nothing here is real" banner on every screen.

### F1 Sandbox start
**Serves:** see the whole loop in 3 minutes with zero setup.
**Contents:** one-line pitch, **Start guided tour** (primary), **Explore freely**, "Open the real app" link.

### F2 Guided tour overlay
**Serves:** walks a judge through J1 + J2 with step prompts: "1. As a resident, ask Ravi for milk" → "2. Switch to Ravi and accept" → "3. Scan the code" → "4. Give a receipt" → "5. See it on Ravi's profile". Progress indicator, skip, restart.

### F3 Split view (desktop)
**Serves:** shows resident and runner phones side by side so both sides update live without juggling tabs. On mobile, falls back to a role switcher in the sandbox banner.

### F4 "How it works" layer
**Serves:** the Arkiv explanations (why runs vanish, why the runner owns the receipt, why location deletes itself) as dismissible callouts. **On by default in the sandbox, off in the real app** (where only D5 explains it).

### F5 Sandbox controls
Fast-forward time, reset sandbox, simulate runner movement, open as another role in a new tab.

---

## 12. What core / infra must add for this design (dependencies)

| # | Needed for | Change | Recommendation |
|---|---|---|---|
| 1 | Whole real-user flow | Users must not hold gas or visit a faucet | **App-sponsored writes** (relayer or paymaster). Design assumes this. |
| 2 | D7 push | Notifications while the app is closed need a small service that watches the chain | Ship the in-app inbox (D7) first; add a push relay later. |
| 3 | C7, B8 "at the gate" | A short-lived "runner is at the gate" signal | A ping/status field on the run (e.g. a ping with `at_gate`), expiring with the run. |
| 4 | B8 Cancel request | `cancelRequest` (resident deletes/marks a request before acceptance) | Add before production. |
| 5 | C4/C5 Decline | `declineRequest` so the resident learns quickly and can resend | Add before production (can be a lightweight record or a run patch). |
| 6 | A4 Find your society | A societies directory (name, area, gate location) instead of 2 hardcoded demo zones | Start with a curated list; requests to add a society go to the team. |
| 7 | C2 tips, C10 summary | Tips are off-chain; only the request's tip *offer* is known | Label as "Tips from requests" (offered), never "earnings". |
| 8 | B11 no-show | A no-show before handoff can't be proven once the run expires | Explain in Help (D10); don't offer "No-show" as a report reason after handoff. |
| 9 | B1 Notify me | Watching for new runs to a society | Works in-app via `subscribe`; needs item 2 for when the app is closed. |

---

## 13. Screen index

| ID | Screen | Mode | Status |
|---|---|---|---|
| A1 | Splash | All | Exists |
| A2 | Intro | All | Redesign |
| A3 | How will you use it? | All | New |
| A4 | Find your society | All | Redesign |
| A5 | Your public name | All | New |
| A6 | Restore your account | All | New |
| B1 | Home — runs coming here | Get things | Exists, Redesign |
| B2 | Runner sheet | Get things | New |
| B3 | Pick a shop | Get things | Exists, Redesign |
| B4 | Shop sheet | Get things | New |
| B5 | Add a shop | Get things / Run | New |
| B6 | What do you need? | Get things | Exists, Redesign |
| B7 | Review and send | Get things | New |
| B8 | Request tracking | Get things | Exists, Redesign |
| B9 | Handoff code | Get things | Exists |
| B10 | Rate the handoff | Get things | Exists, Redesign |
| B11 | Report a problem | Get things | Redesign |
| C1 | Runner setup | Run errands | New |
| C2 | Runner Home (idle) | Run errands | Redesign |
| C3 | Start a run | Run errands | Exists, Redesign |
| C4 | Active run | Run errands | Exists, Redesign |
| C5 | Request detail (runner) | Run errands | New |
| C6 | Shopping list | Run errands | New |
| C7 | At the gate | Run errands | New · needs core |
| C8 | Scan handoff code | Run errands | Exists, Redesign |
| C9 | Handoff done — collect payment | Run errands | Redesign |
| C10 | Run summary | Run errands | New |
| D1 | Activity | All | Redesign |
| D2 | Activity detail | All | New |
| D3 | My profile | All | Redesign |
| D4 | Someone else's profile | All | Exists |
| D5 | Receipt and Verified record | All | Redesign |
| D6 | Get verified | Run errands | New |
| D7 | Notifications | All | New |
| D8 | Settings | All | New |
| D9 | Back up and move phones | All | Redesign |
| D10 | Help and safety | All | New |
| D11 | System states | All | New |
| E1 | Desk home | Society desk | Exists, Redesign |
| E2 | Check and vouch | Society desk | Exists, Redesign |
| E3 | Vouches issued | Society desk | Exists |
| F1–F5 | Sandbox start, tour, split view, how-it-works layer, controls | Sandbox | Redesign of today's demo |

**Suggested design order:** J1 and J2 first (B1, B2, B6–B10, C2–C4, C6–C9), then onboarding (A2–A5), then shared (D1, D3, D5, D7, D8), then desk (E1–E3), then sandbox (F1–F5).

---

## 14. Reusable pieces the designer should define once

Not visual specs, just the inventory so every screen draws from the same set:

- Run card (resident view) and run card (runner's own)
- Request card (runner view: new / accepted / handed over / greyed when full)
- Request summary (items, shop, price, tip)
- Person chip (avatar + public name + level), tappable to profile
- Level badge (New / Verified / Trusted) with optional limits line
- Status stepper (Sent → Accepted → At the gate → Handed over → Rated)
- Countdown label ("Arriving in 6 min", "Ends in 4 min", "At the gate")
- Live indicator ("Live · updated 8 s ago", stale, reconnecting)
- Map with: gate pin, shop pins by category, runner marker (live / stale / selected), route line, rough-area note
- Bottom sheet (draggable, two snap points)
- Live strip (above tabs)
- Mode toggle (Get things / Run errands / Society desk)
- Save button with saving / saved / couldn't save states
- Inline error with retry, offline banner, empty state, skeleton loading
- QR display (with code under it) and QR scanner frame
- Receipt card and Verified-record sheet
- Compliment chips and report reason chips
- Stepper (price, minutes, slots) and tip chips
- Confirm sheet / dialog
- Privacy reassurance line (one consistent treatment)
