/**
 * Turning an alert firing (Arkiv Triggers) into an inbox entry. Used by the firing poll (AlertSync)
 * and the sandbox's in-page engine (screens/sandbox/TriggerHost), so both land on the same ids as
 * NotificationWatcher and merge into one row.
 */
import type { Address, EntityKey } from '@bhaiya-please/core';
import { toast } from '@/components/bp';
import { aliasFor } from '@/lib/alias';
import { fill, resolveCopy } from '@/lib/i18n';
import { notifyFromAlert, type AlertReceipt, type NotifKind } from '@/lib/notifications';
import { protocol, type AlertKind } from '@/lib/triggers';
import type { Trigger } from '@/lib/triggersProtocol';
import { sharedCopy } from './copy';
import { loadNotifPrefs, type NotifPrefs } from './parts';

const NOTIF_KIND: Record<AlertKind, NotifKind> = {
  accepted: 'accepted',
  atGate: 'atGate',
  handed: 'handedOver',
  declined: 'declined',
  noshow: 'noshow',
  newRequest: 'newRequest',
  runEnding: 'runEnding',
  runHere: 'runHere',
  other: 'info',
};
const PREF: Partial<Record<AlertKind, keyof NotifPrefs>> = {
  accepted: 'accepted',
  handed: 'accepted',
  declined: 'accepted',
  atGate: 'gate',
  newRequest: 'run',
  runEnding: 'run',
};

const riderOf = (t: Trigger | null) => (t?.match.creator ?? null) as Address | null;

/** Adds (or enriches) the inbox entry for one firing. Returns true if it is new and should toast. */
export function surfaceAlert(i: { kind: AlertKind; trigger: Trigger | null; entity: EntityKey; receipt: AlertReceipt; at?: number; title?: string; body?: string }): {
  fresh: boolean;
  title: string;
  href?: string;
  kind: AlertKind;
} {
  const c = resolveCopy(sharedCopy);
  const pref = PREF[i.kind];
  const id = protocol.notifIdFor(i.kind, i.trigger, i.entity);
  let title = i.title ?? i.trigger?.label ?? c.notifs.title;
  let body = i.body ?? i.trigger?.body;
  let href = i.trigger?.href;
  if (i.kind === 'noshow') {
    title = c.firing.noshow;
    body = fill(c.firing.noshowBody, { name: aliasFor(riderOf(i.trigger)) });
    href = href ? `${href}/report` : undefined;
  }
  if (i.kind === 'newRequest') href = `/runner/request/${i.entity}`;
  if (i.kind === 'runHere') href = `/run/${i.entity}`;
  if (pref && !loadNotifPrefs()[pref]) return { fresh: false, title, href, kind: i.kind };
  const fresh = notifyFromAlert({ id, kind: NOTIF_KIND[i.kind], title, body, href, at: i.at }, i.receipt);
  return { fresh, title, href, kind: i.kind };
}

/** Toast for a fresh alert (same styles as the watcher's). */
export function toastAlert(r: { fresh: boolean; title: string; href?: string; kind: AlertKind }, open: (href: string) => void, label: string) {
  if (!r.fresh) return;
  const action = r.href ? { label, onPress: () => open(r.href!) } : undefined;
  if (r.kind === 'handed' || r.kind === 'noshow') toast.success(r.title);
  else if (r.kind === 'runEnding') toast.error(r.title, action);
  else toast.info(r.title, action);
}
