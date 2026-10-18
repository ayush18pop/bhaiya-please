# Bhaiya Please app

One codebase for **web** and **Android**: Expo SDK, Expo Router, react-native-web, NativeWind and Reanimated, on the "Auto Meter Brutalism" design system. It talks only to [`@bhaiya-please/core`](../../packages/core), so the same screens run against the Arkiv Tiramisu testnet or an in-memory chain.

| Build | `EXPO_PUBLIC_CORE` | What it is |
|---|---|---|
| Real app | `real` | Your own burner wallet on Tiramisu. Live runs, requests, handoffs and receipts on chain, with push alerts through Arkiv Triggers |
| Sandbox | `mock` (default) | The whole marketplace in the browser with seeded riders, residents and a verifier. A guided tour and a split view play both sides of a handoff at once |

## Run it

```bash
pnpm install              # from the repository root
pnpm dev                  # web, sandbox (mock core), http://localhost:8081
EXPO_PUBLIC_CORE=real pnpm dev                     # web against Tiramisu
cd apps/mobile && pnpm android                     # Android (Expo)
pnpm build:web            # static export to apps/mobile/dist
```

Expo reads `EXPO_PUBLIC_*` from `apps/mobile/.env`. Real-chain builds use:
- `EXPO_PUBLIC_ARKIV_RPC_URL` and an optional `EXPO_PUBLIC_ARKIV_ACCESS_KEY` (public once bundled: restrict its Origins);
- `EXPO_PUBLIC_TRUSTED_VERIFIERS`;
- `EXPO_PUBLIC_TRIGGERS_URL` and `EXPO_PUBLIC_TRIGGERS_WORKER` for push alerts.

Walkthroughs: [`docs/TESTING.md`](../../docs/TESTING.md). Hosting: [`docs/DEPLOY.md`](../../docs/DEPLOY.md).

## Where things are

```
app/                      routes (Expo Router)
  welcome/, society       onboarding: name, use, restore an account, pick a society
  (app)/(tabs)/           home, activity, profile
  (app)/ask/              resident: pick items and a shop, review the bill, send
  (app)/request/[key]/    request status, handoff code, rate, report a problem
  (app)/runner/           start a run, incoming requests, gate, scan, summary
  (app)/run/, shop/       run detail, shops on the route, "still open", list a shop
  (app)/p/[addr], receipt/[key]   profiles and the verified receipt
  (app)/desk/             verifier: check and vouch for a wallet
  (app)/settings/         language, notifications (Arkiv Triggers alerts), privacy, advanced
  sandbox/                guided tour and split view
screens/                  screen implementations per area (onboarding, resident, runner, desk, shared)
components/bp/            UI kit: buttons, plates, meters, stamps, sheets, motion
components/map/           MapLibre map (web and native) with brand markers
hooks/queries.ts          TanStack Query hooks with per-family freshness
lib/                      session and wallets, i18n (English, Hindi, Kannada), Triggers client, formatting
public/sw.js              service worker for Web Push
```

## Checks

```bash
pnpm typecheck            # from the repository root (all workspaces)
```
