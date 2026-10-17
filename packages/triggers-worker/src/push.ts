/**
 * Delivery: Web Push (VAPID, `web-push`), Expo push (HTTPS API) and webhooks (POST JSON, 5 s
 * timeout, one retry). Dead channels (404/410, DeviceNotRegistered) are removed from the store.
 * Targets never leave this module except to their own service; log details carry status codes only.
 */
import { isIP } from 'node:net';
import type { ChannelInfo, DeliveryResult, PushMessage, PushSender, WebhookBody, WebhookSender } from '@arkiv-triggers/core';
import webpush from 'web-push';
import type { VapidConfig } from './config';
import type { Logger } from './log';
import { errorText } from './log';
import type { WorkerStore } from './store';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const WEBHOOK_TIMEOUT_MS = 5_000;
const PUSH_TIMEOUT_MS = 10_000;

// ------------------------------------------------------------------ target validation

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Parses a PushSubscription JSON target; null if malformed. */
export function parseWebPushTarget(target: string): WebPushSubscription | null {
  try {
    const s = JSON.parse(target) as Partial<WebPushSubscription>;
    if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 2048) return null;
    if (typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return null;
    if (!/^[A-Za-z0-9_-]{20,200}={0,2}$/.test(s.keys.p256dh) || !/^[A-Za-z0-9_-]{8,100}={0,2}$/.test(s.keys.auth)) return null;
    return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
  } catch {
    return null;
  }
}

export const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/.test(t);

function privateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v = isIP(h);
  if (v === 4) {
    const [a = 0, b = 0] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}

/**
 * Webhook URLs must be https and not point at localhost / private literal IPs (basic SSRF guard;
 * DNS names resolving to private ranges are not checked). `insecure` (dev) lifts both rules.
 */
export function webhookUrlError(target: string, insecure: boolean): string | null {
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return 'target must be a URL';
  }
  if (target.length > 2048) return 'URL too long';
  if (u.username || u.password) return 'URL must not contain credentials';
  if (insecure) return u.protocol === 'https:' || u.protocol === 'http:' ? null : 'URL must be http(s)';
  if (u.protocol !== 'https:') return 'webhook URL must be https';
  if (privateHost(u.hostname)) return 'webhook URL must be a public host';
  return null;
}

// ------------------------------------------------------------------ senders

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms), redirect: 'error' });
}

export interface Senders {
  push: PushSender;
  webhook: WebhookSender;
}

export function createSenders(o: { store: WorkerStore; vapid: VapidConfig | null; log: Logger; allowInsecureWebhooks: boolean }): Senders {
  const { store, vapid, log } = o;
  const gone = (channel: ChannelInfo, why: string): DeliveryResult => {
    store.removeChannel(channel.id);
    log('info', 'removed dead channel', { channel: channel.id, kind: channel.kind, why });
    return { ok: false, detail: why, gone: true };
  };

  async function sendWebPush(channel: ChannelInfo, target: string, msg: PushMessage): Promise<DeliveryResult> {
    if (!vapid) return { ok: false, detail: 'web push not configured on this worker' };
    const sub = parseWebPushTarget(target);
    if (!sub) return gone(channel, 'malformed subscription');
    try {
      const r = await webpush.sendNotification(sub, JSON.stringify(msg), {
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: 3600,
        urgency: 'high',
        timeout: PUSH_TIMEOUT_MS,
      });
      return { ok: true, detail: `webpush ${r.statusCode}` };
    } catch (e) {
      const status = (e as { statusCode?: unknown }).statusCode;
      if (status === 404 || status === 410) return gone(channel, `webpush ${status}`);
      return { ok: false, detail: typeof status === 'number' ? `webpush ${status}` : 'webpush network error' };
    }
  }

  async function sendExpo(channel: ChannelInfo, token: string, msg: PushMessage): Promise<DeliveryResult> {
    try {
      const res = await fetchWithTimeout(
        EXPO_PUSH_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify([{ to: token, title: msg.title, body: msg.body, data: msg, sound: 'default', priority: 'high' }]),
        },
        PUSH_TIMEOUT_MS,
      );
      const body = (await res.json().catch(() => null)) as { data?: { status?: string; details?: { error?: string } }[] } | null;
      const ticket = body?.data?.[0];
      if (res.ok && ticket?.status === 'ok') return { ok: true, detail: 'expo ok' };
      const err = ticket?.details?.error;
      if (err === 'DeviceNotRegistered') return gone(channel, 'expo DeviceNotRegistered');
      return { ok: false, detail: `expo ${res.status}${err ? ` ${err}` : ''}` };
    } catch (e) {
      return { ok: false, detail: `expo network error` + (/timeout/i.test(errorText(e)) ? ' (timeout)' : '') };
    }
  }

  return {
    push: {
      async send(channel, msg) {
        const rec = store.getChannel(channel.id);
        if (!rec) return { ok: false, detail: 'channel removed' };
        if (rec.kind === 'webpush') return sendWebPush(channel, rec.target, msg);
        if (rec.kind === 'expo') return sendExpo(channel, rec.target, msg);
        return { ok: false, detail: `channel kind ${rec.kind} cannot receive push` };
      },
    },
    webhook: {
      async send(channel, body: WebhookBody) {
        const rec = store.getChannel(channel.id);
        if (!rec || rec.kind !== 'webhook') return { ok: false, detail: 'channel removed' };
        const bad = webhookUrlError(rec.target, o.allowInsecureWebhooks);
        if (bad) return gone(channel, bad);
        const init: RequestInit = {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'arkiv-triggers-worker/0.1', 'x-arkiv-trigger': body.trigger },
          body: JSON.stringify(body),
        };
        let last = '';
        // One retry at most, only on network errors and 5xx.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetchWithTimeout(rec.target, init, WEBHOOK_TIMEOUT_MS);
            await res.body?.cancel().catch(() => undefined);
            if (res.ok) return { ok: true, detail: `webhook ${res.status}` };
            if (res.status === 404 || res.status === 410) return gone(channel, `webhook ${res.status}`);
            last = `webhook ${res.status}`;
            if (res.status < 500) break;
          } catch (e) {
            last = /timeout|abort/i.test(errorText(e)) ? 'webhook timeout' : 'webhook network error';
          }
        }
        return { ok: false, detail: last };
      },
    },
  };
}
