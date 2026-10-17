/**
 * In-app notification inbox (D7), per account, device-local. The watcher
 * (screens/shared/NotificationWatcher) diffs live data and calls `notify`; alert firings (Arkiv
 * Triggers, lib/triggers) attach their signed receipt to the same entry with `notifyFromAlert`.
 */
import { useSyncExternalStore } from 'react';
import { getJSON, setJSON } from './storage';

export type NotifKind =
  | 'accepted' | 'near' | 'atGate' | 'handedOver' | 'receipt' | 'report' | 'vouched' | 'unvouched'
  | 'newRequest' | 'runEnding' | 'runHere' | 'declined' | 'noshow' | 'info';

/** The alert service's signed receipt for a notification that came from an alert (D7 receipt sheet). */
export interface AlertReceipt {
  /** Firing receipt record key (null while only the push arrived). */
  receipt: string | null;
  trigger: string;
  entity: string;
  event: string;
  outcome: 'delivered' | 'failed' | 'attested' | 'skipped';
  /** Worker account that evaluated it. */
  worker: string;
  /** Block it was evaluated at (decimal string). */
  block: string;
  at: number;
  attestation?: string;
}

export interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  body?: string;
  /** Route to open (expo-router href). */
  href?: string;
  at: number; // unix seconds
  read: boolean;
  /** Set when an alert (Arkiv Trigger) fired for it. */
  alert?: AlertReceipt;
}

const MAX = 80;
let owner: string | null = null;
let list: Notif[] = [];
const subs = new Set<() => void>();
const key = (a: string) => `bp.notifs.${a.toLowerCase()}`;
const emit = () => subs.forEach((f) => f());

/** Switch the inbox to an account (called by the shell when the active address changes). */
export function setNotifOwner(address: string | null) {
  if (address === owner) return;
  owner = address;
  list = address ? getJSON<Notif[]>('local', key(address), []) : [];
  emit();
}

function persist() {
  if (owner) setJSON('local', key(owner), list);
  emit();
}

/** Add once per id (dedupes repeats across refetches). Returns true if it was new. */
export function notify(n: Omit<Notif, 'read' | 'at'> & { at?: number }): boolean {
  if (!owner || list.some((x) => x.id === n.id)) return false;
  list = [{ ...n, at: n.at ?? Math.floor(Date.now() / 1000), read: false }, ...list].slice(0, MAX);
  persist();
  return true;
}
/**
 * An alert fired: attach its receipt to the existing entry (the watcher may have seen it first), or
 * add the entry. Returns true if the entry is new (callers toast only then).
 */
export function notifyFromAlert(n: Omit<Notif, 'read' | 'at' | 'alert'> & { at?: number }, alert: AlertReceipt): boolean {
  if (!owner) return false;
  const i = list.findIndex((x) => x.id === n.id);
  if (i >= 0) {
    const cur = list[i]!;
    if (cur.alert?.receipt && cur.alert.receipt === alert.receipt) return false;
    list = list.map((x, j) => (j === i ? { ...x, alert: { ...x.alert, ...alert, receipt: alert.receipt ?? x.alert?.receipt ?? null } } : x));
    persist();
    return false;
  }
  list = [{ ...n, at: n.at ?? Math.floor(Date.now() / 1000), read: false, alert }, ...list].slice(0, MAX);
  persist();
  return true;
}

export function markAllRead() {
  if (!list.some((x) => !x.read)) return;
  list = list.map((x) => ({ ...x, read: true }));
  persist();
}
export function markRead(id: string) {
  list = list.map((x) => (x.id === id ? { ...x, read: true } : x));
  persist();
}
export function hasNotif(id: string) {
  return list.some((x) => x.id === id);
}

export function useNotifs(): Notif[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => list,
    () => list,
  );
}
export const useUnreadCount = () => useNotifs().filter((n) => !n.read).length;
