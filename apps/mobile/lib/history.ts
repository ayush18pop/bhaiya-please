/**
 * Device-local activity log (D1 Past, D2). Runs expire on chain 10 min after ETA and pending requests
 * an hour after their run, so the phone keeps its own short record of what this account did.
 */
import { useSyncExternalStore } from 'react';
import { getJSON, setJSON } from './storage';

export interface RequestLog {
  kind: 'request';
  key: string;
  runKey: string;
  runner: string;
  shop: string;
  items: string[];
  maxPrice: number;
  tip: number;
  at: number;
  /** Last known outcome, updated by screens as they learn it. */
  outcome?: 'sent' | 'accepted' | 'handed' | 'rated' | 'reported' | 'cancelled' | 'lapsed' | 'declined';
}
export interface RunLog {
  kind: 'run';
  key: string;
  dest: string;
  from: string;
  minutes: number;
  capacity: number;
  at: number;
  handoffs?: number;
  ended?: boolean;
}
export type LogEntry = RequestLog | RunLog;

let owner: string | null = null;
let list: LogEntry[] = [];
const subs = new Set<() => void>();
const key = (a: string) => `bp.history.${a.toLowerCase()}`;

export function setHistoryOwner(address: string | null) {
  if (address === owner) return;
  owner = address;
  list = address ? getJSON<LogEntry[]>('local', key(address), []) : [];
  subs.forEach((f) => f());
}

/** Insert or merge by key. */
export function logActivity(e: LogEntry | (Partial<LogEntry> & { key: string; kind: LogEntry['kind'] })) {
  if (!owner) return;
  const i = list.findIndex((x) => x.key === e.key);
  list = i >= 0 ? list.map((x, j) => (j === i ? ({ ...x, ...e } as LogEntry) : x)) : ([e as LogEntry, ...list].slice(0, 200));
  setJSON('local', key(owner), list);
  subs.forEach((f) => f());
}

export function useHistory(): LogEntry[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => list,
    () => list,
  );
}
export const findLog = (k: string) => list.find((x) => x.key === k);
