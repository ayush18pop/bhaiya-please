# Testing guide

How to run, see and test Bhaiya Please: automated checks, the sandbox (mock data), the real Tiramisu chain, and Android. Every command runs from the repo root unless it says otherwise.

## 0. One-time setup

```bash
git checkout feat/product-ui     # until merged to main
pnpm install                     # Node >= 20, pnpm 10
cp .env.example .env             # only needed for real-chain scripts (seed, fund, live-check)
```

Expo reads env vars from the **app folder**, not the repo root. For real-chain app runs, create `apps/mobile/.env` (see section 3), or pass the variables on the command line.

## 1. Automated checks (2 minutes, no network)

| Command | What it proves |
|---|---|
| `pnpm test` | 97 core tests on the in-memory chain: codec, handoff hash, reputation, trust filters, the full handoff loop, cancel / decline / at-the-gate |
| `pnpm typecheck` | Every workspace (core, app, scripts) type-checks |
| `pnpm --filter mobile build:web` | The web app bundles (static export to `apps/mobile/dist`) |

CI (`.github/workflows/ci.yml`) runs tests and typecheck on every push.

## 2. Sandbox: the whole app with mock data (no wallet, no gas)

```bash
cd apps/mobile
EXPO_PUBLIC_CORE=mock npx expo start --web      # or from root: pnpm dev
```

Open http://localhost:8081 (the first bundle can take 2–4 minutes). Nothing leaves the browser: the "chain" is in-memory and kept in localStorage, and three seeded runners keep driving to **Lotus Heights**.

On the sandbox start page (`/sandbox`):

- **Start guided tour**: on a wide window (≥ 900 px) you get the **split view**, with a resident phone and a runner phone side by side, a 7-step tour that advances by itself as you act, a **How it works** toggle, and controls for fast-forward time (+5 / +30 min), simulate movement, reset, and open each role in its own tab. On a narrow window the tour runs as a coach card.
- **Explore freely**: one phone. The yellow-and-black banner's right button switches **As Resident ⇄ Runner ⇄ Desk** (a different persona account for each).
- **See the sign-up flow**: the real onboarding (welcome posters → how you'll use it → find your society → public name), running on the mock.

Direct links (any route works with these):

| URL | Opens |
|---|---|
| `/home?sandbox=1&frame=get` | Resident home (map + runs coming here) |
| `/home?sandbox=1&frame=run` | Runner home (start a run) |
| `/home?sandbox=1&frame=desk` | Society desk (scan / vouch) |
| `/sandbox/split?tour=1` | Split view with the tour |

`frame=` pins the persona for that tab, so two tabs can be two people.

### Sandbox test script (about 5 minutes)

1. **Runner tab**: Start a run → Going to *Lotus Heights* → Go live. You should see the paper "Run to Lotus Heights" card, a LIVE plate and the live map.
2. **Resident tab**: Home shows your runner on the map and in the list → **Ask** → pick a shop → add items (quick chips) → set price and tip → **Review** (paper bill) → **Send request**. You land on tracking (status road with the auto-rickshaw).
3. **Runner**: the request appears in the inbox (NEW). Tap **Accept** → **Open shopping list** → tick the items → **Done shopping** → **I'm at the gate**.
4. **Resident**: the yellow strip with lights shows "… is at the gate. Show your code." → **Show handoff code** → **Share handoff link** (copies the link on desktop).
5. **Runner**: Scan → **Paste the handoff link** → "Code matches this request" → **Confirm handoff**. You should see the HANDED OVER stamp and the collect ₹ amounts.
6. **Resident**: **Rate** → pick compliments → **Give receipt**. The receipt prints, gets stamped and flies to the runner.
7. **Runner**: Profile shows "1 resident gave you receipts", the compliments and the receipt. Tap it to see the **Verified record**.
8. **Desk tab**: paste the runner's profile link (Profile → Share my profile) → choose **ID checked** → **Vouch**. In the runner tab the level flips New → Verified ("सेटिंग हो गई!").

Also try:
- **Cancel** a request before it's accepted (tracking → Cancel request).
- **Decline** a request (runner card → Decline). The resident sees "declined" and "Send to another runner".
- **Report a problem** after a handoff.
- **Fast-forward** in the split view: watch runs end and cards leave.
- **Offline**: DevTools → Network → Offline. You get the hazard banner and writes are disabled with a reason.
- **Hindi / Kannada**: Profile → Settings → Language.
- **Sunlight mode**: the sun icon on runner screens.
- **Reduced motion**: OS setting. Animations become fades.

## 3. Real chain (Arkiv Tiramisu testnet)

### 3a. Chain check script (no browser, about 3 minutes)

```bash
pnpm live-check                  # needs SEED_PRIVATE_KEY (+ ARKIV_ACCESS_KEY) in .env
LIVECHECK_ANON=1 pnpm live-check # same, without the access key (if its quota is exhausted)
```

It derives two test wallets from the seed key, funds them, and runs 23 steps on Tiramisu: announce → request → cancel → decline (and refuse to accept a declined one) → accept → at the gate (capacity preserved) → delivery with the revealed code → hash verifies → receipt owned by the runner → it counts on the profile → end run. It prints PASS/FAIL per step and addresses only, never keys.

### 3b. The app against the chain

Create `apps/mobile/.env`:

```bash
EXPO_PUBLIC_CORE=real
EXPO_PUBLIC_ARKIV_RPC_URL=https://rpc.tiramisu.db-chain.testnet.arkiv.network
EXPO_PUBLIC_TRUSTED_VERIFIERS=0x166efae608457303daf2af830d281922c5d6ee20
EXPO_PUBLIC_ARKIV_ACCESS_KEY=<a hub.arkiv.network key>   # public once bundled: use a web-only key
```

```bash
cd apps/mobile && npx expo start --web
```

1. Sign up in one window as a **resident** (Get things delivered → Lotus Heights) and in an **incognito** window as a **runner** (Run errands). Each window is a separate account on this device.
2. Fund both accounts. Copy each address from **Profile → Settings → Advanced**, then from the repo root:
   ```bash
   pnpm fund 0xRESIDENT 0xRUNNER        # tops each up to 0.02 GLM from SEED_PRIVATE_KEY
   ```
   (or use the public faucet: https://hub.arkiv.network/faucet)
3. Follow the same script as section 2. Each save is a real transaction and takes about 10–20 s. After 15 s a save shows "The network is slow. Still trying, keep this screen open."
4. To test the society desk on chain, restore the trusted verifier key on a third window (Welcome → I already have an account) and vouch for the runner.

Watch-outs:
- **429 / QUOTA_EXCEEDED or ANON_COST_LIMITED** from the RPC means the access key's quota (or this IP's anonymous budget) is used up. Reads fail, so saves hang. Get a fresh key from https://hub.arkiv.network. The heartbeat cron spends the key's quota too.
- **Runs expire 10 minutes after ETA.** If you dawdle, start a new run (the runner's Home has one-tap "Recent trips").
- A New runner can take **1 request per run, up to ₹200**. Vouching (Verified) raises it to 2 and ₹500.

## 4. Android

```bash
cd apps/mobile
EXPO_PUBLIC_CORE=mock npx expo start          # scan the QR with Expo Go
npx expo start --tunnel                       # if the phone can't reach this machine (WSL)
npx expo run:android                          # dev build: full MapLibre map, camera scanning, haptics
```

In **Expo Go** the map is a schematic drawing (MapLibre needs native code). Everything else works. The account is stored in the phone's secure storage and survives restarts. Back it up from Profile → Back up your account.

## 5. What to look at (design checklist)

The visual language is "Auto Meter Brutalism". Check these while clicking through the app:

- **Rules:** one primary (yellow) action per screen; runner buttons are 64 px; glass only over the map or camera.
- **Every save shows its state on the button:** Saving ▮▮▮ → Saved ✓ → Couldn't save · Retry plus the reason.
- **States:**
  - **Empty:** poster with the crowd scene.
  - **Loading:** skeletons shaped like the content.
  - **Expired:** lights-edge alert plus the next best action.
  - **Offline:** banner.
  - **Not found / maintenance:** posters.
- **No blockchain words in the UI:** IDs only in Settings → Advanced and the receipt's "Advanced" section.

## 6. Known gaps

- Push notifications are not built. The inbox (bell) works while the app is open.
- Network fees are not sponsored: real-chain accounts need test credit (`pnpm fund` / faucet).
- Hindi and Kannada strings need native-speaker review.
- Android has only been type-checked and bundled, not run on a device yet.
