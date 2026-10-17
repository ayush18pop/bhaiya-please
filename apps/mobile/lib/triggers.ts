/**
 * Alerts (Arkiv Triggers, docs/TRIGGERS.md §5). The app never polls the chain for push: it writes small
 * `trigger` records that say "tell me when X happens" and a worker network watches them.
 *
 * - Config: EXPO_PUBLIC_TRIGGERS_URL (worker HTTP API) and EXPO_PUBLIC_TRIGGERS_WORKER (its address,
 *   zero = any worker). In the sandbox (mock core) each tab runs its own in-page engine
 *   (screens/sandbox/TriggerHost) as a worker wallet derived from the account (`sandboxWorker`).
 * - Push channel: web registers /sw.js + PushManager with the worker's VAPID key and signs the channel
 *   registration with the account key; the channel id is stored on this device per account.
 * - Writing: one batch per user action, fire-and-forget AFTER the action succeeded, one quiet retry,
 *   failures are kept for Settings → Notifications (never an error on the main flow).
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import type { Address, EntityKey, Hex } from '@bhaiya-please/core';
import { privateKeyToAccount } from 'viem/accounts';
import { CORE_MODE, type AnyCore } from './core';
import type { Wallet } from './session';
import { getJSON, removeItem, setJSON } from './storage';
import * as protocol from './triggersProtocol';

export { protocol };
export type { AlertFiring, AlertKind, MyAlert } from './triggersProtocol';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
export const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as Hex;
export const TRIGGERS_URL = (process.env.EXPO_PUBLIC_TRIGGERS_URL ?? '').replace(/\/+$/, '');
const CONFIGURED_WORKER = ((process.env.EXPO_PUBLIC_TRIGGERS_WORKER ?? '') || ZERO_ADDRESS).toLowerCase() as Address;
/** Sandbox: triggers run in this browser, so there is no server. */
export const SANDBOX_TRIGGERS = CORE_MODE === 'mock';

/**
 * Sandbox: each account's in-page engine runs as its own worker wallet (derived from the account, so
 * it is stable across reloads), never as the user's wallet.
 */
export const sandboxWorker = (address: string) => `0xa77e${address.toLowerCase().slice(6)}` as Address;
/** The worker a trigger asks to run it. Sandbox: the account's own in-page engine. */
export const workerFor = (address: Address) => (SANDBOX_TRIGGERS ? sandboxWorker(address) : CONFIGURED_WORKER);
/** Worker shown in Settings → Advanced. */
export const CONFIGURED_WORKER_ADDRESS = CONFIGURED_WORKER;

// ------------------------------------------------------------------ small device stores

type Listener = () => void;
const subs = new Set<Listener>();
let version = 0;
const bump = () => {
  version++;
  subs.forEach((f) => f());
};
function useVersion() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version,
    () => version,
  );
}

export interface Channel {
  id: Hex;
  kind: 'webpush' | 'expo' | 'sandbox';
  at: number;
  /** Worker URL it was registered with (a different worker means re-registering). */
  url: string;
}
const chKey = (a: string) => `bp.alerts.channel.${a.toLowerCase()}`;
export const loadChannel = (address: string | null): Channel | null => {
  if (!address) return null;
  // Sandbox: the in-page engine delivers "pushes" as in-app alerts, always on.
  if (SANDBOX_TRIGGERS) return { id: sandboxChannel(address), kind: 'sandbox', at: 0, url: 'sandbox' };
  const c = getJSON<Channel | null>('local', chKey(address), null);
  return c && c.url === TRIGGERS_URL ? c : null;
};
function saveChannel(address: string, c: Channel | null) {
  if (c) setJSON('local', chKey(address), c);
  else removeItem('local', chKey(address));
  bump();
}
/** Deterministic per account so the sandbox engine can recognise it. */
export function sandboxChannel(address: string): Hex {
  return `0x${'5b'.repeat(12)}${address.toLowerCase().slice(2)}` as Hex;
}
export function useChannel(address: string | null): Channel | null {
  useVersion();
  return loadChannel(address);
}

/** Failed alert writes, shown in Settings → Notifications (newest first, max 10). */
export type AlertWhat = 'request' | 'accepted' | 'run' | 'notifyMe' | 'delete';
export interface AlertIssue {
  id: string;
  what: AlertWhat;
  reason: string;
  at: number;
}
const issueKey = (a: string) => `bp.alerts.issues.${a.toLowerCase()}`;
export const loadIssues = (address: string | null): AlertIssue[] => (address ? getJSON<AlertIssue[]>('local', issueKey(address), []) : []);
function addIssue(address: string, what: AlertWhat, e: unknown) {
  const reason = (e as { code?: string })?.code === 'QUOTA_EXHAUSTED' ? "The network's free limit was used up." : describe(e);
  const list = [{ id: `${Date.now()}`, what, reason, at: Math.floor(Date.now() / 1000) }, ...loadIssues(address)].slice(0, 10);
  setJSON('local', issueKey(address), list);
  bump();
}
export function dismissIssue(address: string, id: string) {
  setJSON('local', issueKey(address), loadIssues(address).filter((x) => x.id !== id));
  bump();
}
export function useIssues(address: string | null) {
  useVersion();
  return loadIssues(address);
}

/** Requests whose no-show alert this account already set (idempotency: once per request). */
const nsKey = (a: string) => `bp.alerts.noshow.${a.toLowerCase()}`;
const loadNoShowSet = (a: string) => getJSON<Record<string, number>>('local', nsKey(a), {});
/** True when this phone saw the request accepted (and set the no-show alert for it). */
export const sawAccepted = (address: string | null, requestKey: string) => !!address && !!loadNoShowSet(address)[requestKey];

/** "Someone heading here" subscription: zone + when it was (re)written. */
const nmKey = (a: string) => `bp.alerts.notifyMe.${a.toLowerCase()}`;
interface NotifyMeRec {
  zone: string;
  at: number;
  expiresAt: number;
}

function describe(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/denied|permission/i.test(m)) return 'Notifications are blocked for this site.';
  if (/fetch|network|Failed to/i.test(m)) return 'Couldn’t reach the alert service.';
  return m.length > 120 ? `${m.slice(0, 117)}…` : m;
}

// ------------------------------------------------------------------ push channel (web)

export type PushSupport = 'web' | 'sandbox' | 'native' | 'unsupported' | 'unconfigured';
export function pushSupport(): PushSupport {
  if (SANDBOX_TRIGGERS) return 'sandbox';
  if (Platform.OS !== 'web') return 'native';
  if (!TRIGGERS_URL) return 'unconfigured';
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'web';
}
export function pushPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function b64urlToBytes(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

class PushError extends Error {
  constructor(public code: 'DENIED' | 'UNSUPPORTED' | 'UNCONFIGURED' | 'NATIVE', message: string) {
    super(message);
  }
}

/** Ask permission, subscribe, sign and register the channel. Resolves with the stored channel. */
export async function enablePush(wallet: Wallet): Promise<Channel> {
  const support = pushSupport();
  if (support === 'sandbox') return loadChannel(wallet.address)!;
  if (support === 'native') throw new PushError('NATIVE', 'Push on phones is coming.');
  if (support === 'unconfigured') throw new PushError('UNCONFIGURED', 'Push isn’t set up for this version of the app.');
  if (support === 'unsupported') throw new PushError('UNSUPPORTED', 'This browser can’t get push alerts.');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new PushError('DENIED', 'Notifications are blocked for this site.');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const { publicKey } = await protocol.fetchVapidKey(TRIGGERS_URL);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
  const target = protocol.webPushTarget(sub);
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = await signer(wallet).signMessage({ message: protocol.channelMessage('webpush', target, issuedAt) });
  const { channel } = await protocol.registerChannel(TRIGGERS_URL, { kind: 'webpush', target, owner: wallet.address, issuedAt, signature });
  const ch: Channel = { id: channel, kind: 'webpush', at: issuedAt, url: TRIGGERS_URL };
  saveChannel(wallet.address, ch);
  return ch;
}

/** Forget the channel here (and unsubscribe the browser). Live alerts expire on their own. */
export async function disablePush(wallet: Wallet) {
  const ch = loadChannel(wallet.address);
  saveChannel(wallet.address, null);
  if (!ch || ch.kind !== 'webpush' || Platform.OS !== 'web') return;
  try {
    const issuedAt = Math.floor(Date.now() / 1000);
    const signature = await signer(wallet).signMessage({ message: protocol.channelMessage('delete', ch.id, issuedAt) });
    await protocol.unregisterChannel(TRIGGERS_URL, { channel: ch.id, owner: wallet.address, issuedAt, signature }).catch(() => {});
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {}
}

const signer = (wallet: Wallet) => privateKeyToAccount(wallet.privateKey);

// ------------------------------------------------------------------ writing alerts

/** Run a write in the background: one quiet retry after 4 s, then record the failure for Settings. */
function background(address: string, what: AlertWhat, fn: () => Promise<unknown>) {
  void (async () => {
    try {
      await fn();
    } catch (first) {
      if ((first as { code?: string })?.code === 'QUOTA_EXHAUSTED') return addIssue(address, what, first);
      await new Promise((r) => setTimeout(r, 4000));
      try {
        await fn();
      } catch (e) {
        addIssue(address, what, e);
      }
    }
  })();
}

/** A record just written can take a moment to be readable: try a few times before giving up. */
async function readSoon<T>(read: () => Promise<T | null>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    const v = await read();
    if (v) return v;
    if (i >= tries - 1) throw new Error('The record wasn’t readable yet.');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** B7 after "Send": accepted / at the gate / handed over / declined pushes for this request. */
export function alertsAfterRequestSent(core: AnyCore, address: Address, requestKey: EntityKey) {
  const ch = loadChannel(address);
  if (!ch) return;
  background(address, 'request', async () => {
    const req = await readSoon(() => core.getRequest(requestKey));
    const run = await readSoon(() => core.getRun(req.run));
    const specs = protocol.requestSentSpecs({ address, worker: workerFor(address), channel: ch.id, request: req, run, now: core.arkivPort().now() });
    await protocol.writeSpecs(core, specs);
  });
}

/** Resident saw the request accepted: the no-show proof alert (attest). Once per request, push or not. */
export function alertsAfterAccepted(core: AnyCore, address: Address, i: { requestKey: EntityKey; rider: Address; runExpiresAt: number }) {
  const set = loadNoShowSet(address);
  if (set[i.requestKey]) return;
  const now = core.arkivPort().now();
  if (i.runExpiresAt <= now + 30) return; // too late for the alert to see the run end
  setJSON('local', nsKey(address), { ...pruneSet(set, now), [i.requestKey]: i.runExpiresAt });
  background(address, 'accepted', async () => {
    const specs = protocol.noShowSpecs({ address, worker: workerFor(address), requestKey: i.requestKey, rider: i.rider, runExpiresAt: i.runExpiresAt, now: core.arkivPort().now() });
    await protocol.writeSpecs(core, specs);
  });
}
const pruneSet = (s: Record<string, number>, now: number) => Object.fromEntries(Object.entries(s).filter(([, exp]) => exp + 7 * 86400 > now));

/** C3 after "Go live": new requests on my run + my run ending. */
export function alertsAfterGoLive(core: AnyCore, address: Address, runKey: EntityKey) {
  const ch = loadChannel(address);
  if (!ch) return;
  background(address, 'run', async () => {
    const run = await readSoon(() => core.getRun(runKey));
    const specs = protocol.goLiveSpecs({ address, worker: workerFor(address), channel: ch.id, run, now: core.arkivPort().now() });
    await protocol.writeSpecs(core, specs);
  });
}

/**
 * B1 "Notify me": keep one 24 h "run created to my society" alert while it's on (renewed on app open
 * when under 12 h are left or the society changed), and remove it when turned off.
 */
export function syncNotifyMe(core: AnyCore, address: Address, on: boolean, zone6: string) {
  const ch = loadChannel(address);
  const rec = getJSON<NotifyMeRec | null>('local', nmKey(address), null);
  const now = core.arkivPort().now();
  if (on && ch) {
    if (rec && rec.zone === zone6 && rec.expiresAt - now > 12 * 3600) return;
    setJSON('local', nmKey(address), { zone: zone6, at: now, expiresAt: now + 24 * 3600 });
    background(address, 'notifyMe', async () => {
      const old = await protocol.findMine(core, address, (a) => a.kind === 'runHere');
      const specs = protocol.notifyMeSpecs({ address, worker: workerFor(address), channel: ch.id, zone6, now: core.arkivPort().now() });
      await protocol.writeSpecs(core, specs, old.map((a) => a.key));
    });
  } else if (rec) {
    removeItem('local', nmKey(address));
    background(address, 'delete', async () => {
      const old = await protocol.findMine(core, address, (a) => a.kind === 'runHere');
      if (old.length) await protocol.deleteAlerts(core, old.map((a) => a.key));
    });
  }
}
