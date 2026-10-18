# Deploy

How the live deployment is set up: the web app (real chain and sandbox), the Arkiv Triggers worker, and the heartbeat that keeps the board alive. Local setup is in the [README](../README.md#quick-start) and [`TESTING.md`](TESTING.md).

## 1. Web app: two Vercel projects from the same repo

Both use **root directory `apps/mobile`**.

| Setting | Real app (`bhaiya-please.vercel.app`) | Sandbox (`bhaiya-please-sandbox.vercel.app`) |
|---|---|---|
| Install command | `cd ../.. && pnpm install --frozen-lockfile` | same |
| Build command | `npx expo export --platform web` | same |
| Output directory | `dist` | `dist` |
| `EXPO_PUBLIC_CORE` | `real` | `mock` |
| `EXPO_PUBLIC_ARKIV_RPC_URL` | `https://rpc.tiramisu.db-chain.testnet.arkiv.network` | — |
| `EXPO_PUBLIC_TRUSTED_VERIFIERS` | `0x166efae608457303daf2af830d281922c5d6ee20` | — |
| `EXPO_PUBLIC_ARKIV_ACCESS_KEY` | web key (restrict its Origins on hub.arkiv.network) | — |
| `EXPO_PUBLIC_TRIGGERS_URL` | `https://<worker host>` | — (the sandbox runs the engine in the browser) |
| `EXPO_PUBLIC_TRIGGERS_WORKER` | worker address | — |
| `EXPO_PUBLIC_REAL_APP_URL` / `EXPO_PUBLIC_SANDBOX_URL` | the two URLs | the two URLs |

**Deep links:** routes like `/request/0x…` and `/p/0x…` must serve `index.html`. Add `apps/mobile/vercel.json`:

```json
{ "rewrites": [{ "source": "/((?!_expo|assets|sw\\.js|favicon).*)", "destination": "/index.html" }] }
```

Check after deploy: `/sw.js` returns the service worker (not HTML), and a hard refresh on `/settings/notifications` loads the app.

## 2. Arkiv Triggers worker

It needs an **always-on** host with **HTTPS** (browsers refuse to register push with an http origin). Free tiers that sleep (Render free) would stop alerts and no-show proofs.

- **Render** (`packages/triggers-worker/render.yaml`): web service, Starter plan or above, health check `/health`, persistent disk mounted at `TRIGGERS_DATA_DIR` (channels and engine state live there). Set env from `.env.example` → TRIGGERS section.
- **Any VM / Fly.io**: `docker build -f packages/triggers-worker/Dockerfile -t arkiv-triggers .`, run with a volume for the data dir, put Caddy or another TLS proxy in front. Build and run the image once before relying on it.
- **Local fallback**: run `pnpm triggers:worker` on a laptop and expose it with `cloudflared tunnel --url http://localhost:8787` (HTTPS URL), then set `EXPO_PUBLIC_TRIGGERS_URL` to it and redeploy the web app.

Env: `TRIGGERS_POLL_MS=30000`, `TRIGGERS_REFRESH_MS=60000` (gentle on the quota), `TRIGGERS_ALLOWED_ORIGINS=https://bhaiya-please.vercel.app`, `ARKIV_ACCESS_KEY=<worker key>`, plus the VAPID keys and the worker key.

Verify:
- `curl https://<worker>/health` shows `ok` and a balance > 0.
- `curl https://<worker>/vapid` returns the public key.
- `pnpm fund <worker address>`: receipts cost gas.

## 3. Heartbeat cron

`.github/workflows/heartbeat.yml` runs every 15 minutes, so the board always has live runs for visitors. Update the `ARKIV_ACCESS_KEY` secret to the cron key. Keep `SEED_PRIVATE_KEY` funded: `pnpm fund` prints the seed balance. If quota is tight, change the cron to `*/30 * * * *`.

## 4. Smoke test after deploying (10 minutes)

1. Sandbox URL → **Start guided tour** → complete the loop in the split view.
2. Real URL → sign up in two browsers (one incognito) → `pnpm fund` both addresses (from Profile → Settings → Advanced) → runner goes live → resident requests → accept → at the gate → paste link → handoff → receipt.
3. With the worker: resident turns on Push before requesting. The notification arrives on accept, and the inbox row shows "via Arkiv Trigger".
4. `pnpm live-check` (23 chain steps) passes.
