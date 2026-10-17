/**
 * Which alerts Bhaiya Please writes (docs/TRIGGERS.md §5) and how to read them back, on top of
 * @arkiv-triggers/core. Every builder returns CreateSpecs; lib/triggers writes them in ONE batch.
 */
import type { Address, EntityKey, Request, Run } from '@bhaiya-please/core';
import { buildTriggerSpec, deleteTriggers, listFiringsFor, listMyTriggers, type TriggerInput } from '@arkiv-triggers/core/client';
import { pred, val, type Firing, type Trigger } from '@arkiv-triggers/core/codec';
import { sharedCopy } from '@/screens/shared/copy';
import { aliasFor } from './alias';
import type { AnyCore } from './core';
import { fill, resolveCopy } from './i18n';
import { societyByZone } from './societies';

export { channelMessage, fetchVapidKey, registerChannel, unregisterChannel, webPushTarget } from '@arkiv-triggers/core/client';
export type { Firing, Trigger };

const BP = 'bhaiyaplease';
export const NOSHOW_ATTESTER = 'bhaiyaplease.noshow';

type Hex = `0x${string}`;
interface Base {
  address: Address;
  worker: Address;
  now: number;
}

const copy = () => resolveCopy(sharedCopy).notifs;
const life = (until: number, now: number, pad = 120) => Math.max(60, Math.ceil(until - now + pad));

/** B7: four pushes for one request, each living as long as the request. */
export function requestSentSpecs(i: Base & { channel: Hex; request: Request; run: Run }) {
  const c = copy();
  const k = i.request.key;
  const runner = i.run.creator;
  const name = aliasFor(runner);
  const href = `/request/${k}`;
  const expiresInSeconds = life(i.request.expiresAt, i.now);
  const common = { watchProject: BP, action: 'push' as const, channel: i.channel, worker: i.worker, expiresInSeconds };
  const items = i.request.items.join(', ');
  const inputs: TriggerInput[] = [
    {
      ...common,
      watchType: 'accept',
      on: 'created',
      match: { where: [pred.key('request', k)], creator: runner },
      label: fill(c.accepted, { name }).slice(0, 80),
      body: fill(c.acceptedBodyPush, { items }).slice(0, 200),
      href,
    },
    {
      ...common,
      watchType: 'run',
      on: 'patched',
      // The run enters this watch when the runner's "at the gate" patch sets at_gate: the engine
      // reports an older entity that starts matching after a patch as `patched`.
      match: { where: [pred.key('$key', i.run.key), pred.gte('at_gate', val.u64(1))] },
      label: fill(c.atGate, { name }).slice(0, 80),
      body: c.atGateBodyPush,
      href: `${href}/code`,
    },
    {
      ...common,
      watchType: 'delivery',
      on: 'created',
      match: { where: [pred.key('request', k)], creator: runner },
      label: c.handed,
      body: fill(c.handedBody, { name }).slice(0, 200),
      href: `${href}/rate`,
    },
    {
      ...common,
      watchType: 'decline',
      on: 'created',
      match: { where: [pred.key('request', k)], creator: runner },
      label: fill(c.declined, { name }).slice(0, 80),
      body: c.declinedBody,
      href,
    },
  ];
  return inputs.map(buildTriggerSpec);
}

/**
 * §4: no-show proof. Fires 90 s before the accept expires (it lives as long as the run), unless the
 * runner recorded a delivery for this request. The attester re-checks everything at that block.
 */
export function noShowSpecs(i: Base & { requestKey: EntityKey; rider: Address; runExpiresAt: number }) {
  return [
    buildTriggerSpec({
      watchProject: BP,
      watchType: 'accept',
      on: 'expiring',
      lead: 90,
      action: 'attest',
      attester: NOSHOW_ATTESTER,
      params: { request: i.requestKey },
      worker: i.worker,
      match: { where: [pred.key('request', i.requestKey)], creator: i.rider },
      unless: { project: BP, type: 'delivery', where: [pred.key('request', i.requestKey)], creator: i.rider },
      label: 'No-show proof',
      href: `/request/${i.requestKey}`,
      expiresInSeconds: life(i.runExpiresAt, i.now, 600),
    }),
  ];
}

/** C3: new requests on my run + my run ending (5 min before), both living as long as the run. */
export function goLiveSpecs(i: Base & { channel: Hex; run: Run }) {
  const c = copy();
  const expiresInSeconds = life(i.run.expiresAt, i.now);
  const common = { watchProject: BP, action: 'push' as const, channel: i.channel, worker: i.worker, expiresInSeconds };
  return [
    buildTriggerSpec({
      ...common,
      watchType: 'request',
      on: 'created',
      match: { where: [pred.key('run', i.run.key)] },
      label: c.newRequest,
      body: c.newRequestBodyPush,
      href: '/home',
    }),
    buildTriggerSpec({
      ...common,
      watchType: 'run',
      on: 'expiring',
      lead: 300,
      match: { where: [pred.key('$key', i.run.key)] },
      label: c.runEnding,
      body: fill(c.runEndingBody, { min: 5 }),
      href: '/home',
    }),
  ];
}

/** B1 "Notify me": a run created to my society, 24 h. */
export function notifyMeSpecs(i: Base & { channel: Hex; zone6: string }) {
  const c = copy();
  const society = societyByZone(i.zone6)?.name ?? 'your society';
  return [
    buildTriggerSpec({
      watchProject: BP,
      watchType: 'run',
      on: 'created',
      action: 'push',
      channel: i.channel,
      worker: i.worker,
      match: { where: [pred.str('dest_zone', i.zone6)] },
      label: fill(c.runHere, { society }).slice(0, 80),
      body: c.runHereBodyPush,
      href: '/home',
      expiresInSeconds: 24 * 3600,
    }),
  ];
}

/** One write for a user action: creates (and optional deletes of what they replace) in one batch. */
export async function writeSpecs(core: AnyCore, creates: ReturnType<typeof buildTriggerSpec>[], deletes: EntityKey[] = []) {
  if (!creates.length && !deletes.length) return;
  await core.arkivPort().write((w) => w.batch({ creates, ...(deletes.length ? { deletes } : {}) }));
}

export const deleteAlerts = (core: AnyCore, keys: EntityKey[]) => deleteTriggers(core.arkivPort(), keys);

// ------------------------------------------------------------------ reading back

export type AlertKind = 'accepted' | 'atGate' | 'handed' | 'declined' | 'noshow' | 'newRequest' | 'runEnding' | 'runHere' | 'other';

/** Which of our alerts a trigger is, from its shape (no app-private tags on the record). */
export function kindOf(t: Pick<Trigger, 'watchProject' | 'watchType' | 'on' | 'action' | 'match' | 'attester'>): AlertKind {
  if (t.watchProject !== BP) return 'other';
  const names = t.match.where.map((p) => (p.op === 'or' ? '' : p.name));
  if (t.action === 'attest') return t.attester === NOSHOW_ATTESTER ? 'noshow' : 'other';
  if (t.watchType === 'accept' && t.on === 'created') return 'accepted';
  if (t.watchType === 'delivery' && t.on === 'created') return 'handed';
  if (t.watchType === 'decline' && t.on === 'created') return 'declined';
  if (t.watchType === 'request' && t.on === 'created') return 'newRequest';
  if (t.watchType === 'run' && t.on === 'expiring') return 'runEnding';
  if (t.watchType === 'run' && names.includes('at_gate')) return 'atGate';
  if (t.watchType === 'run' && names.includes('dest_zone')) return 'runHere';
  return 'other';
}

/** The request a request-scoped alert is about (from its link). */
export const requestOf = (t: Pick<Trigger, 'href'>) => t.href?.match(/^\/request\/(0x[0-9a-fA-F]{64})/)?.[1]?.toLowerCase() as EntityKey | undefined;
/** The zone a "someone heading here" alert watches. */
export function zoneOf(t: Pick<Trigger, 'match'>): string | undefined {
  for (const p of t.match.where) if (p.op === 'eq' && p.name === 'dest_zone' && p.value.type === 'str') return p.value.value;
  return undefined;
}

export interface MyAlert {
  key: EntityKey;
  kind: AlertKind;
  trigger: Trigger;
  expiresAt: number;
}

export async function listMyAlerts(core: AnyCore, address: Address): Promise<MyAlert[]> {
  const list = await listMyTriggers(core.arkivPort(), address);
  return list.map((t) => ({ key: t.key, kind: kindOf(t), trigger: t, expiresAt: t.expiresAt }));
}

export async function findMine(core: AnyCore, address: Address, f: (a: MyAlert) => boolean) {
  return (await listMyAlerts(core, address)).filter(f);
}

export interface AlertFiring {
  firing: Firing;
  trigger: Trigger | null;
  kind: AlertKind;
}

/** Firing receipts for my live alerts since `since` (unix s), newest first, joined to their trigger. */
export async function listMyFirings(core: AnyCore, address: Address, since?: number): Promise<AlertFiring[]> {
  const port = core.arkivPort();
  const mine = await listMyTriggers(port, address);
  if (!mine.length) return [];
  const byKey = new Map(mine.map((t) => [t.key, t]));
  const firings = await listFiringsFor(port, mine.map((t) => t.key), since !== undefined ? { since } : {});
  return firings.map((f) => {
    const t = byKey.get(f.trigger) ?? null;
    return { firing: f, trigger: t, kind: t ? kindOf(t) : 'other' };
  });
}

/**
 * The inbox id an alert maps to, the same id the in-app watcher uses, so a push and the watcher's
 * own entry merge into one row (`accepted:<request>`, `newRequest:<request>` …).
 */
export function notifIdFor(kind: AlertKind, t: Pick<Trigger, 'href' | 'key'> | null, entity: EntityKey): string {
  const req = t ? requestOf(t) : undefined;
  switch (kind) {
    case 'accepted':
      return `accepted:${req ?? entity}`;
    case 'atGate':
      return `atGate:${req ?? entity}`;
    case 'handed':
      return `handed:${req ?? entity}`;
    case 'declined':
      return `declined:${req ?? entity}`;
    case 'noshow':
      return `noshow:${req ?? entity}`;
    case 'newRequest':
      return `newRequest:${entity}`;
    case 'runEnding':
      return `runEnding:${entity}`;
    case 'runHere':
      return `runHere:${entity}`;
    default:
      return `alert:${t?.key ?? 'x'}:${entity}`;
  }
}
