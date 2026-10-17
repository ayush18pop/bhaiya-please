/**
 * createMockBhaiyaPlease: the real services over a fake ArkivPort (MockChain), so mock and chain
 * behave the same. Seeds synthetic fixtures by executing the fixture plan through the interface.
 */
import { keccak256, stringToHex } from 'viem';
import type { CreateMockBhaiyaPlease, MockBhaiyaPlease } from '../interface';
import { createDomain } from '../services';
import type { ServiceContext } from '../services/context';
import { PROJECT_TAG } from '../types';
import type { Address, MockConfig } from '../types';
import { MockChain } from './chain';
import type { KVStorage } from './chain';
import { buildFixturePlan, PERSONA, runFixturePlan } from './fixtures';
import type { FixturePersona } from './fixtures';
import { createMovementSim } from './movement';
import type { BhaiyaPlease } from '../interface';
import type { ArkivPort } from '../arkiv/port';
import type { UnixSeconds } from '../types';

/** An ArkivPort over an in-memory chain, plus clock control and ports for other wallets on it. */
export interface MockArkivPort extends ArkivPort {
  readonly mock: {
    /** Advance the shared mock clock by `seconds`. */
    advance(seconds: number): void;
    now(): UnixSeconds;
    /** Another wallet on the same chain. */
    portFor(address: Address | null): ArkivPort;
  };
}

export interface CreateMockPortOptions {
  /** Wallet this port writes as (null = read-only). */
  address?: Address | null;
  /** Share the chain of an existing mock BhaiyaPlease (e.g. an in-page Arkiv Triggers worker). */
  shareWith?: MockBhaiyaPlease;
  /** Fresh chain only: 'localStorage' loads the persisted sandbox state (cross-tab sync only). Default 'memory'. */
  store?: 'memory' | 'localStorage';
  /** Fresh chain only: base clock (unix seconds). */
  now?: () => UnixSeconds;
  /** Fresh chain only: artificial write latency, ms. Default 0. */
  latencyMs?: number;
}

/**
 * ArkivPort over an in-memory Arkiv: a fresh, empty chain (tests of companion protocols), or the
 * chain of an existing mock (`shareWith`), acting as `address`. Same engine rules as the mock client
 * (owner checks, readonly, expiry, atomic batches) and historical reads via `at(block)`.
 */
export function createMockPort(opts: CreateMockPortOptions = {}): MockArkivPort {
  const address = opts.address ? (opts.address.toLowerCase() as Address) : null;
  if (opts.shareWith) {
    const host = opts.shareWith;
    return withMock(host.dev.port(address), {
      advance: (sec) => host.dev.advance(sec),
      now: () => host.dev.now(),
      portFor: (a) => host.dev.port(a),
    });
  }
  const storage = opts.store === 'localStorage' ? detectLocalStorage() : undefined;
  const chain = new MockChain({
    ...(opts.now ? { now: opts.now } : {}),
    ...(storage ? { storage } : {}),
    latencyMs: opts.latencyMs ?? 0,
  });
  if (storage) chain.load();
  const ports = new Map<string, ArkivPort>();
  const portFor = (a: Address | null): ArkivPort => {
    const id = a ? a.toLowerCase() : '';
    let p = ports.get(id);
    if (!p) {
      const fixed = a ? (a.toLowerCase() as Address) : null;
      p = chain.port(() => fixed);
      ports.set(id, p);
    }
    return p;
  };
  return withMock(portFor(address), { advance: (sec) => chain.advance(sec), now: () => chain.now(), portFor });
}

function withMock(p: ArkivPort, mock: MockArkivPort['mock']): MockArkivPort {
  return {
    get address() {
      return p.address;
    },
    now: () => p.now(),
    query: (q) => p.query(q),
    get: (k) => p.get(k),
    at: (b) => p.at(b),
    write: (fn) => p.write(fn),
    watch: (cb) => p.watch(cb),
    balance: (a) => p.balance(a),
    blockNumber: () => p.blockNumber(),
    mock,
  };
}

export { buildFixturePlan, runFixturePlan, PERSONA } from './fixtures';
export type { FixturePlan, FixturePersona, FixtureEnv } from './fixtures';

/** Deterministic fake address for a fixture persona (mock only; the seed script maps ids to real wallets). */
export function mockAddressOf(personaId: string): Address {
  return `0x${keccak256(stringToHex(`bhaiyaplease:fixture:${personaId}`)).slice(-40)}` as Address;
}

export type MockPersona = FixturePersona & { address: Address };

/** All fixture personas with their mock addresses, keyed by persona id (see PERSONA). */
export const MOCK_PERSONAS: Readonly<Record<string, MockPersona>> = Object.freeze(
  Object.fromEntries(buildFixturePlan().personas.map((p) => [p.id, { ...p, address: mockAddressOf(p.id) }])),
);

export const DEFAULT_MOCK_LATENCY_MS = 1200;

function detectLocalStorage(): KVStorage | undefined {
  try {
    const ls = (globalThis as { localStorage?: KVStorage }).localStorage;
    if (!ls) return undefined;
    ls.setItem('bhaiyaplease.probe', '1');
    ls.removeItem('bhaiyaplease.probe');
    return ls;
  } catch {
    return undefined;
  }
}

export const createMockBhaiyaPlease: CreateMockBhaiyaPlease = (config: MockConfig = {}): MockBhaiyaPlease => {
  const latency = config.latencyMs ?? DEFAULT_MOCK_LATENCY_MS;
  // React Native / Node have no localStorage: silently fall back to memory.
  const storage = config.store === 'localStorage' ? detectLocalStorage() : undefined;
  const chain = new MockChain({ ...(config.now ? { now: config.now } : {}), ...(storage ? { storage } : {}) });
  const trustedVerifiers = new Set(
    (config.trustedVerifiers ?? [mockAddressOf(PERSONA.verifier)]).map((a) => a.toLowerCase() as Address),
  );
  const ctxFor = (port: ServiceContext['port']): ServiceContext => ({
    port,
    project: PROJECT_TAG,
    trustedVerifiers,
    receiptMode: 'auto',
  });

  let address: Address | null = (config.address ?? mockAddressOf(PERSONA.residentDemo)).toLowerCase() as Address;
  let ready: Promise<void> = Promise.resolve();
  const port = chain.port(
    () => address,
    () => ready,
  );
  const domain = createDomain(ctxFor(port), { resolveIntervalMs: 0 });

  async function seed(): Promise<void> {
    let actor: Address | null = null;
    const seeder = createDomain(ctxFor(chain.port(() => actor)), { resolveIntervalMs: 0 });
    const presentOffset = chain.clockOffset;
    chain.persistencePaused = true;
    try {
      await runFixturePlan(buildFixturePlan(), {
        as(personaId) {
          actor = mockAddressOf(personaId);
          return seeder;
        },
        travelTo: (unix) => chain.travelTo(unix, presentOffset),
        now: () => chain.now(),
      });
    } finally {
      chain.travelTo(null, presentOffset);
      chain.persistencePaused = false;
      chain.persist();
    }
  }

  function start(reseed: boolean): Promise<void> {
    chain.latencyMs = 0;
    const loaded = !reseed && chain.load();
    const shouldSeed = reseed || (!loaded && config.seed !== false);
    return (shouldSeed ? seed() : Promise.resolve()).finally(() => {
      chain.latencyMs = latency;
    });
  }

  ready = start(false);

  // Live location: seeded runners' live runs move and ping (see movement.ts).
  const simDomains = new Map<Address, BhaiyaPlease>();
  const sim = createMovementSim(
    [PERSONA.runnerTrusted, PERSONA.runnerVerified, PERSONA.runnerNew].map(mockAddressOf),
    (a) => {
      let d = simDomains.get(a);
      if (!d) {
        d = createDomain(ctxFor(chain.port(() => a, () => ready)), { resolveIntervalMs: 0 });
        simDomains.set(a, d);
      }
      return d;
    },
    () => chain.now(),
  );
  if (config.simulateMovement) sim.start();

  const extraPorts = new Map<string, ArkivPort>();
  const dev: MockBhaiyaPlease['dev'] = {
    advance: (seconds) => chain.advance(seconds),
    setAddress: (a) => {
      address = a.toLowerCase() as Address;
    },
    reset: (reseed = true) => {
      chain.reset();
      ready = reseed ? start(true) : Promise.resolve();
    },
    pingTick: () => sim.tick(),
    now: () => chain.now(),
    port: (a) => {
      const id = a ? a.toLowerCase() : '';
      let p = extraPorts.get(id);
      if (!p) {
        const fixed = a ? (a.toLowerCase() as Address) : null;
        p = chain.port(() => fixed, () => ready);
        extraPorts.set(id, p);
      }
      return p;
    },
  };

  const closeDomain = domain.close;
  // Object.assign keeps domain's `address` getter live (a spread would freeze it).
  return Object.assign(domain, {
    dev,
    close: () => {
      sim.stop();
      closeDomain();
      chain.dispose();
    },
  });
};

// Light helpers for clients that import only the mock entry (no SDK): one wire format, one zone list.
export { encodeHandoffQR, decodeHandoffQR, encodeAddressQR, decodeAddressQR } from '../codec/handoff';
export { DEMO_ZONES, zoneFromLatLng, zoneFromGeohash } from '../zones';
export * from '../geo';
export { PING_RULES } from '../types';
// No-show evidence (pure, over any ArkivPort): usable by an in-browser Arkiv Triggers engine.
export { buildNoShowEvidence, verifyNoShowEvidence } from '../services/noshow';
export type { NoShowEvidence, NoShowOptions } from '../services/noshow';
export type { ArkivPort, ReadPort, Writer, QueryAst, Predicate, CreateSpec, RawEntity, AttrMap, AttrValue } from '../arkiv/port';
export { strV, u64V, i32V, addrV, keyV, bytes32V, attr } from '../codec/attrs';
