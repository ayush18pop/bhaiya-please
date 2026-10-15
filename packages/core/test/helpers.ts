import { keccak256, stringToHex } from 'viem';
import type { Writer } from '../src/arkiv/port';
import { encode } from '../src/codec/entities';
import type { EntitySpec } from '../src/codec/entities';
import { MockChain } from '../src/mock/chain';
import type { MockChainOptions } from '../src/mock/chain';
import { createDomain } from '../src/services';
import type { ReceiptMode } from '../src/services/context';
import type { BhaiyaPlease } from '../src/interface';
import { DEMO_ZONES } from '../src/zones';
import { PROJECT_TAG } from '../src/types';
import type { Address, EntityKey } from '../src/types';

export const HOME = DEMO_ZONES[0]!.zone6;
export const NORTH = DEMO_ZONES[1]!.zone6;
export const T0 = 1_790_000_000;

export const addr = (name: string): Address => `0x${keccak256(stringToHex(`test:${name}`)).slice(-40)}` as Address;

export interface World {
  chain: MockChain;
  verifier: Address;
  as(a: Address): BhaiyaPlease;
  /** Raw engine access as `a` (for forging entities the services refuse to write). */
  raw<T>(a: Address, fn: (w: Writer) => Promise<T>): Promise<T>;
}

export function makeWorld(opts: { receiptMode?: ReceiptMode; chain?: MockChainOptions } = {}): World {
  // Fixed base clock; tests move time only via chain.advance().
  const chain = new MockChain({ now: () => T0, latencyMs: 0, ...opts.chain });
  const verifier = addr('verifier');
  const domains = new Map<Address, BhaiyaPlease>();
  const ports = new Map<Address, ReturnType<MockChain['port']>>();
  const portFor = (a: Address) => {
    let p = ports.get(a);
    if (!p) {
      p = chain.port(() => a);
      ports.set(a, p);
    }
    return p;
  };
  return {
    chain,
    verifier,
    as(a) {
      let d = domains.get(a);
      if (!d) {
        d = createDomain(
          { port: portFor(a), project: PROJECT_TAG, trustedVerifiers: new Set([verifier]), receiptMode: opts.receiptMode ?? 'auto' },
          { resolveIntervalMs: 0 },
        );
        domains.set(a, d);
      }
      return d;
    },
    raw: (a, fn) => portFor(a).write(fn),
  };
}

export const createSpec = (s: EntitySpec, expiresInSeconds = 3600) => ({ ...s, expiresInSeconds });

/** Shop listed by `lister` in NORTH (zone5 shared with HOME). */
export async function listShop(w: World, lister: Address): Promise<EntityKey> {
  return (await w.as(lister).listShop({ zone: NORTH, category: 'grocery', nameTag: 'Test Provisions' })).key;
}

/** Full happy-path handoff through the services. Returns the keys involved. */
export async function handoff(w: World, runner: Address, resident: Address, shop: EntityKey, tags: ('on_time' | 'polite')[] = ['on_time']) {
  const run = await w.as(runner).announceRun({ destZone: HOME, fromZone: NORTH, etaMinutes: 30, capacity: 1 });
  const req = await w.as(resident).postRequest({ runKey: run.key, shopKey: shop, items: ['Milk'], maxPrice: 100, tip: 10 });
  await w.as(runner).acceptRequest(req.key);
  const delivery = await w.as(runner).recordDelivery({ secret: req.secret });
  const receipt = await w.as(resident).issueReceipt({ deliveryKey: delivery.key, tags });
  return { run: run.key, request: req.key, secret: req.secret, delivery: delivery.key, receipt: receipt.key };
}

export { encode };
