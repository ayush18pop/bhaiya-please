# @bhaiya-please/core

The domain layer of Bhaiya Please: plain TypeScript, no React, and the only code that talks to Arkiv. The app calls one interface, `BhaiyaPlease`, and gets the same behaviour whether it runs on the Tiramisu testnet or on an in-memory chain.

| Entry | What you get |
|---|---|
| `@bhaiya-please/core` | `createBhaiyaPlease(config)`: the real client over `@arkiv-network/sdk`. Also the domain types, handoff helpers (`computeCodeCommit`, QR encode / decode), zones, burner keys, and no-show evidence (`buildNoShowEvidence`, `verifyNoShowEvidence`) |
| `@bhaiya-please/core/mock` | `createMockBhaiyaPlease(config)`: the same services over an in-memory chain with history, seeded fixtures and simulated rider movement. Powers the sandbox and the tests |
| `@bhaiya-please/core/port` | The `ArkivPort` surface for companion protocols such as [Arkiv Triggers](../triggers): `createArkivAdapter` and the attribute helpers |

```ts
import { createBhaiyaPlease } from '@bhaiya-please/core';

const bp = await createBhaiyaPlease({
  rpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network',
  signer: { kind: 'privateKey', privateKey },
  trustedVerifiers: ['0x166efae608457303daf2af830d281922c5d6ee20'],
});

const runs = await bp.getLiveRuns('tdr3c1');   // runs heading to this building, by ETA
const profile = await bp.getProfile(runs[0].creator); // reputation recomputed from receipts
```

## What is inside

```
src/
  interface.ts        the BhaiyaPlease contract (every method the app may call)
  types.ts            domain types, limits, tiers, ping rules
  codec/              attribute table, encoders, zod validators, handoff commit, ping codec
  services/           runs, requests, handoff, receipts, complaints, attestations,
                      reputation, locations, noshow (each read applies the trust rules)
  arkiv/adapter.ts    the only file importing @arkiv-network/sdk
  arkiv/errors.ts     error classification (quota, rate limit, cursor, revert)
  arkiv/watcher.ts    shared watchEntityEvents poller
  mock/               in-memory chain with history, fixtures, personas
test/                 unit and end-to-end tests (no network)
```

Every entity, attribute, lifetime, query and trust rule is documented in [`arkiv/schema.md`](../../arkiv/schema.md).

## Design rules

- **Trust comes from `$creator` and `$owner`, never from tags.** Reads drop anything that fails the rules in schema §6, so callers never re-check.
- **Reputation is never stored.** `getProfile` recomputes it from receipts, complaints, attestations and verified no-shows.
- **Writes are queued per wallet** (nonce order); dependent steps such as accept + capacity or receipt + transfer + extend go in one `executeBatch`.
- **Reads are budget-aware.** A spent quota (`QUOTA_EXHAUSTED`) is never retried; a keyed client falls back to anonymous reads, then pauses reads for 60 s.

## Scripts

```bash
pnpm test        # vitest: codec, services, reputation, no-show, quota handling, full mock e2e
pnpm typecheck
```

Chain-facing checks live outside this package: `pnpm spike` (SDK behaviour, PASS / FAIL) and `pnpm live-check` (a 23-step loop on Tiramisu), both from the repository root.
