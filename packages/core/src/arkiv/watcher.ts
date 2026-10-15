/**
 * One shared event poller per BhaiyaPlease instance, fanned out to subscribe() callbacks.
 *
 * Chain events are unfiltered (all of Tiramisu) and carry no attributes, so a created/unknown key is
 * resolved with one `get` (rate-limited, sequential) and classified; anything not tagged with our
 * project is remembered as foreign and ignored from then on.
 *
 * Expiry produces NO event. Consumers must hide entities themselves once `expiresAt` (or a run's
 * `eta`) passes, using a ticking clock; queries already exclude expired entities, so a refetch after
 * the deadline also converges.
 */
import { typeOf } from '../codec/entities';
import type { ChangeEvent, EntityKey, EntityType, SubscribeFilter, Unsubscribe } from '../types';
import type { ArkivPort, RawEntity, RawEvent } from './port';

export interface WatcherOptions {
  /** Min spacing between entity resolutions (ms). 100 → max 10 gets/s. */
  resolveIntervalMs: number;
  onError?: (op: string, err: unknown) => void;
}

export interface Watcher {
  subscribe(filter: SubscribeFilter, cb: (e: ChangeEvent) => void): Unsubscribe;
  close(): void;
}

interface Known {
  type: EntityType;
  hints: NonNullable<ChangeEvent['hints']>;
}

const MAX_REMEMBERED = 5000;

export function hintsOf(raw: RawEntity, type: EntityType): NonNullable<ChangeEvent['hints']> {
  const s = (name: string): string | undefined => {
    const v = raw.attributes[name]?.value;
    return typeof v === 'string' ? v.toLowerCase() : undefined;
  };
  const hints: NonNullable<ChangeEvent['hints']> = { owner: raw.owner };
  const run = type === 'run' ? raw.key : s('run');
  const request = type === 'request' ? raw.key : s('request');
  const destZone = s('dest_zone') ?? s('zone');
  const rider = s('rider');
  const subject = s('subject');
  if (run) hints.run = run as EntityKey;
  if (request) hints.request = request as EntityKey;
  if (destZone) hints.destZone = destZone;
  if (rider) hints.rider = rider as `0x${string}`;
  if (subject) hints.subject = subject as `0x${string}`;
  return hints;
}

export function matchesFilter(f: SubscribeFilter, e: ChangeEvent): boolean {
  if (f.types && (!e.type || !f.types.includes(e.type))) return false;
  if (f.keys && !f.keys.map((k) => k.toLowerCase()).includes(e.key)) return false;
  const h = e.hints ?? {};
  const pairs: [string | undefined, string | undefined][] = [
    [f.run, h.run],
    [f.request, h.request],
    [f.destZone, h.destZone],
    [f.rider, h.rider],
    [f.subject, h.subject],
  ];
  return pairs.every(([want, got]) => want === undefined || want.toLowerCase() === got);
}

export function createWatcher(port: ArkivPort, project: string, opts: WatcherOptions): Watcher {
  const listeners = new Set<{ filter: SubscribeFilter; cb: (e: ChangeEvent) => void }>();
  const known = new Map<EntityKey, Known>();
  const foreign = new Set<EntityKey>();
  let unwatch: (() => void) | null = null;
  let chain: Promise<void> = Promise.resolve();
  let lastResolve = 0;

  // Bounded memory: evict the oldest entry (insertion order) once full.
  const evict = (c: { size: number; keys(): IterableIterator<EntityKey>; delete(k: EntityKey): boolean }) => {
    if (c.size < MAX_REMEMBERED) return;
    const oldest = c.keys().next().value;
    if (oldest !== undefined) c.delete(oldest);
  };

  async function resolve(k: EntityKey): Promise<Known | null> {
    const wait = lastResolve + opts.resolveIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastResolve = Date.now();
    const raw = await port.get(k);
    if (!raw) return null;
    const type = typeOf(raw, project);
    if (!type) {
      evict(foreign);
      foreign.add(k);
      return null;
    }
    const info = { type, hints: hintsOf(raw, type) };
    evict(known);
    known.set(k, info);
    return info;
  }

  function emit(e: ChangeEvent) {
    for (const l of [...listeners]) {
      if (!matchesFilter(l.filter, e)) continue;
      try {
        l.cb(e);
      } catch (err) {
        opts.onError?.('subscribe callback', err);
      }
    }
  }

  async function handle(e: RawEvent): Promise<void> {
    if (foreign.has(e.key)) return;
    let info = known.get(e.key) ?? null;
    if (e.kind === 'deleted') {
      if (!info) return; // unknown and gone: cannot classify
      known.delete(e.key);
    } else if (!info || e.kind === 'created') {
      info = await resolve(e.key);
      if (!info) return;
    }
    const hints = { ...info.hints };
    if (e.kind === 'transferred' && e.newOwner) {
      hints.newOwner = e.newOwner;
      hints.owner = e.newOwner;
      info.hints.owner = e.newOwner;
    }
    emit({ kind: e.kind, key: e.key, type: info.type, hints });
  }

  function onRaw(e: RawEvent) {
    // Sequential: preserves per-key order (created before patched) and bounds get rate.
    chain = chain.then(() => handle(e)).catch((err) => opts.onError?.('watcher', err));
  }

  return {
    subscribe(filter, cb) {
      const l = { filter, cb };
      listeners.add(l);
      if (!unwatch) unwatch = port.watch(onRaw);
      return () => {
        listeners.delete(l);
        if (listeners.size === 0 && unwatch) {
          unwatch();
          unwatch = null;
        }
      };
    },
    close() {
      listeners.clear();
      unwatch?.();
      unwatch = null;
    },
  };
}
