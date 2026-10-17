/**
 * Runner device-local state: shopping-list ticks per run, a ledger of handoffs this phone saw (for
 * "This week" and the run summary after the run expires), the level snapshot at go-live (C10 progress),
 * and the accepted requests seen per run (so C6 can strike a request that disappeared).
 */
import { useSyncExternalStore } from 'react';
import type { TierName } from '@bhaiya-please/core';
import type { RequestRow } from '@/hooks/queries';
import { getJSON, setJSON } from '@/lib/storage';

let version = 0;
const subs = new Set<() => void>();
const bump = () => {
  version++;
  subs.forEach((f) => f());
};
/** Re-render when any runner-local value changes. */
export function useRunnerStore() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version,
    () => version,
  );
}

// ------------------------------------------------------------------ shopping list

export interface ListState {
  ticks: Record<string, boolean>;
  done: boolean;
}
const listKey = (runKey: string) => `bp.runner.list.${runKey}`;
export const getList = (runKey: string): ListState => getJSON<ListState>('local', listKey(runKey), { ticks: {}, done: false });
export function setList(runKey: string, patch: Partial<ListState>) {
  setJSON('local', listKey(runKey), { ...getList(runKey), ...patch });
  bump();
}
export const tickId = (requestKey: string, i: number) => `${requestKey}:${i}`;
export function toggleTick(runKey: string, id: string) {
  const l = getList(runKey);
  setList(runKey, { ticks: { ...l.ticks, [id]: !l.ticks[id] } });
}

// ------------------------------------------------------------------ accepted requests seen per run

export interface SeenRequest {
  key: string;
  resident: string;
  items: string[];
  shop: string;
  maxPrice: number;
  tip: number;
}
const seenKey = (runKey: string) => `bp.runner.seen.${runKey}`;
export const getSeen = (runKey: string) => getJSON<Record<string, SeenRequest>>('local', seenKey(runKey), {});
function rememberAccepted(runKey: string, rows: RequestRow[]) {
  const seen = getSeen(runKey);
  let changed = false;
  for (const r of rows) {
    if (!r.accept || seen[r.request.key]) continue;
    seen[r.request.key] = { key: r.request.key, resident: r.request.creator, items: r.request.items, shop: r.request.shop, maxPrice: r.request.maxPrice, tip: r.request.tip };
    changed = true;
  }
  if (changed) setJSON('local', seenKey(runKey), seen);
  return changed;
}

// ------------------------------------------------------------------ handoff ledger

export interface LedgerEntry {
  delivery: string;
  request: string;
  run: string;
  resident: string;
  items: string[];
  maxPrice: number;
  tip: number;
  at: number;
}
const ledgerKey = (addr: string) => `bp.runner.ledger.${addr.toLowerCase()}`;
export const getLedger = (addr: string) => getJSON<LedgerEntry[]>('local', ledgerKey(addr), []);
function addLedger(addr: string, entries: LedgerEntry[]) {
  const cur = getLedger(addr);
  const have = new Set(cur.map((e) => e.delivery));
  const add = entries.filter((e) => !have.has(e.delivery));
  if (!add.length) return false;
  setJSON('local', ledgerKey(addr), [...add, ...cur].slice(0, 500));
  return true;
}

/** Keep device-local records in step with what the board shows. Cheap; call on every board change. */
export function syncRunner(addr: string | null, runKey: string | null | undefined, rows: RequestRow[]) {
  if (!addr || !runKey) return;
  const a = rememberAccepted(runKey, rows);
  const b = addLedger(
    addr,
    rows
      .filter((r) => r.delivery)
      .map((r) => ({ delivery: r.delivery!.key, request: r.request.key, run: runKey, resident: r.request.creator, items: r.request.items, maxPrice: r.request.maxPrice, tip: r.request.tip, at: r.delivery!.createdAt })),
  );
  if (a || b) bump();
}

// ------------------------------------------------------------------ level snapshot at go-live

export interface LevelSnap {
  tier: TierName;
  receipts: number;
  residents: number;
}
const snapKey = (runKey: string) => `bp.runner.snap.${runKey}`;
export const getSnap = (runKey: string) => getJSON<LevelSnap | null>('local', snapKey(runKey), null);
export const saveSnap = (runKey: string, s: LevelSnap) => setJSON('local', snapKey(runKey), s);
