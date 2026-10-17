# @arkiv-triggers/worker

The Node service that runs Arkiv Triggers against the real chain. It serves the HTTP channel API and sends Web Push, Expo push and webhooks.

```sh
pnpm triggers:vapid            # once, for Web Push
pnpm triggers:worker           # prints the worker address
pnpm fund 0x<worker address>   # the worker pays gas for receipts
```

The full documentation is in [`packages/triggers/README.md`](../triggers/README.md): the protocol, the HTTP API, the environment variables, deployment (Render via `render.yaml`, Fly, Docker on any VM) and the limitations.
