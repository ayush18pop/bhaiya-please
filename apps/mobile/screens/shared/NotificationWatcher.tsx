/**
 * D7 watcher (mounted app-wide by components/shell/AppWatchers while signed in). Diffs live data and
 * writes inbox entries with stable ids (`accepted:<requestKey>` …) plus a toast for the important ones.
 * Anything that already existed on the first successful load is only marked as seen, never notified.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { Accept, Decline, Delivery, Request, Run, TierName } from '@bhaiya-please/core';
import { LEVEL_LIMITS, levelLabel, tagLabel, toast } from '@/components/bp';
import { useCore, useSession } from '@/components/providers';
import { useProfile, useReceipts, useRunnerBoard } from '@/hooks/queries';
import { nowUnix } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { fill, resolveCopy } from '@/lib/i18n';
import { notify, type NotifKind } from '@/lib/notifications';
import { sharedCopy } from './copy';
import { deskName, loadNotifPrefs, plural, type NotifPrefs } from './parts';

interface Event {
  id: string;
  kind: NotifKind;
  title: string;
  body?: string;
  href?: string;
  /** Toast style for the important ones. */
  toast?: 'info' | 'success' | 'error';
  pref?: keyof NotifPrefs;
}

const RANK: Record<TierName, number> = { new: 0, verified: 1, trusted: 2 };
const shopNames = new Map<string, string>();

interface MineRow {
  request: Request;
  accept: Accept | null;
  delivery: Delivery | null;
  decline: Decline | null;
  run: Run | null;
  shop: string;
}

/** The resident's recent requests with everything the watcher needs (one query, 5 s polling). */
function useMine() {
  const core = useCore();
  const { address } = useSession();
  return useQuery<MineRow[]>({
    queryKey: [address, 'watch', 'mine'],
    queryFn: async () => {
      const since = nowUnix() - 6 * 3600;
      const reqs = (await core.getMyRequests()).filter((r) => r.createdAt >= since);
      return Promise.all(
        reqs.map(async (request) => {
          const [accept, delivery, decline, run] = await Promise.all([
            core.getAcceptForRequest(request.key),
            core.getDeliveryForRequest(request.key),
            core.getDeclineForRequest(request.key),
            core.getRun(request.run),
          ]);
          let shop = shopNames.get(request.shop);
          if (!shop) {
            shop = (await core.getShop(request.shop).catch(() => null))?.nameTag ?? 'the shop';
            shopNames.set(request.shop, shop);
          }
          return { request, accept, delivery, decline, run, shop };
        }),
      );
    },
  });
}

/** Runs heading to my society (only while "Notify me" is on). */
function useRunsHere(zone6: string, on: boolean) {
  const core = useCore();
  const { address } = useSession();
  return useQuery({ queryKey: [address, 'runs', zone6], queryFn: () => core.getLiveRuns(zone6), enabled: on });
}

export default function NotificationWatcher() {
  const router = useRouter();
  const { address, society, prefs } = useSession();
  const c = resolveCopy(sharedCopy).notifs;
  const reasons = resolveCopy(sharedCopy).reasons;
  const mine = useMine();
  const board = useRunnerBoard();
  const receipts = useReceipts(address);
  const profile = useProfile(address);
  const here = useRunsHere(society.zone6, prefs.notifyMe);

  // Per-account "seen" sets, seeded on the first real (non-placeholder) fetch of each source.
  const seen = useRef(new Map<string, Set<string>>());
  const owner = useRef(address);
  const tier = useRef<TierName | null>(null);
  const vouchKeys = useRef<Map<string, string> | null>(null);
  if (owner.current !== address) {
    owner.current = address;
    seen.current = new Map();
    tier.current = null;
    vouchKeys.current = null;
  }

  const fire = (e: Event) => {
    if (e.pref && !loadNotifPrefs()[e.pref]) return;
    const fresh = notify({ id: e.id, kind: e.kind, title: e.title, body: e.body, href: e.href });
    if (!fresh || !e.toast) return;
    const open = e.href ? { label: c.open, onPress: () => router.push(e.href as never) } : undefined;
    if (e.toast === 'success') toast.success(e.title);
    else if (e.toast === 'error') toast.error(e.title, open);
    else toast.info(e.title, open);
  };
  const diff = (source: string, events: Event[]) => {
    const s = seen.current.get(source);
    if (!s) {
      seen.current.set(source, new Set(events.map((e) => e.id)));
      return;
    }
    for (const e of events) {
      if (s.has(e.id)) continue;
      s.add(e.id);
      fire(e);
    }
  };

  // ---------------------------------------------------------------- resident
  useEffect(() => {
    if (!mine.data || mine.isPlaceholderData) return;
    const now = nowUnix();
    const out: Event[] = [];
    for (const r of mine.data) {
      const k = r.request.key;
      const who = aliasFor(r.accept?.rider ?? r.run?.creator ?? r.decline?.rider);
      const href = `/request/${k}`;
      const items = r.request.items.join(', ');
      if (r.accept) {
        const mins = r.run ? Math.max(0, Math.ceil((r.run.eta - now) / 60)) : 0;
        out.push({ id: `accepted:${k}`, kind: 'accepted', title: fill(c.accepted, { name: who }), body: fill(c.acceptedBody, { items, shop: r.shop, min: mins }), href, toast: 'info', pref: 'accepted' });
      }
      if (r.accept && !r.delivery && r.run && r.run.eta - now <= 120 && !r.run.atGateAt) {
        out.push({ id: `near:${k}`, kind: 'near', title: fill(c.near, { name: who }), body: c.nearBody, href, pref: 'gate' });
      }
      if (r.accept && !r.delivery && r.run?.atGateAt) {
        out.push({ id: `atGate:${k}`, kind: 'atGate', title: fill(c.atGate, { name: who }), body: fill(c.atGateBody, { society: society.name }), href: `${href}/code`, toast: 'info', pref: 'gate' });
      }
      if (r.delivery) {
        out.push({ id: `handed:${k}`, kind: 'handedOver', title: c.handed, body: fill(c.handedBody, { name: aliasFor(r.delivery.rider) }), href: `${href}/rate`, toast: 'success', pref: 'accepted' });
      }
      if (r.decline && !r.accept) {
        out.push({ id: `declined:${k}`, kind: 'declined', title: fill(c.declined, { name: who }), body: c.declinedBody, href, toast: 'info', pref: 'accepted' });
      }
    }
    diff('mine', out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.data, mine.isPlaceholderData]);

  useEffect(() => {
    if (!prefs.notifyMe || !here.data || here.isPlaceholderData) return;
    const now = nowUnix();
    const out: Event[] = here.data
      .filter((r) => r.creator !== address)
      .map((r) => {
        const mins = Math.max(0, Math.ceil((r.eta - now) / 60));
        return { id: `runHere:${r.key}`, kind: 'runHere' as const, title: fill(c.runHere, { society: society.name }), body: fill(c.runHereBody, { name: aliasFor(r.creator), min: mins, slots: r.capacityLeft, s: plural(r.capacityLeft) }), href: `/run/${r.key}`, toast: 'info' as const };
      });
    diff(`here:${society.zone6}`, out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here.data, here.isPlaceholderData, prefs.notifyMe]);

  // ---------------------------------------------------------------- runner
  useEffect(() => {
    if (!board.data || board.isPlaceholderData) return;
    const run = board.data.run;
    if (!run) return diff('board', []);
    const now = nowUnix();
    const out: Event[] = [];
    for (const r of board.data.rows) {
      if (r.accept || r.decline || r.delivery) continue;
      const n = r.request.items.length;
      out.push({ id: `newRequest:${r.request.key}`, kind: 'newRequest', title: c.newRequest, body: fill(c.newRequestBody, { name: aliasFor(r.request.creator), n, s: plural(n), shop: shopNames.get(r.request.shop) ?? 'the shop' }), href: `/runner/request/${r.request.key}`, toast: 'info', pref: 'run' });
    }
    const left = run.expiresAt - now;
    if (left > 0 && left <= 300) {
      out.push({ id: `runEnding:${run.key}`, kind: 'runEnding', title: c.runEnding, body: fill(c.runEndingBody, { min: Math.max(1, Math.ceil(left / 60)) }), href: '/home', toast: 'error', pref: 'run' });
    }
    diff('board', out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.data, board.isPlaceholderData]);

  useEffect(() => {
    if (!receipts.data || receipts.isPlaceholderData) return;
    const out: Event[] = receipts.data
      .filter((r) => r.valid)
      .map((r) => ({
        id: `receipt:${r.receipt.key}`,
        kind: 'receipt' as const,
        title: c.receipt,
        body: fill(c.receiptBody, { name: aliasFor(r.receipt.creator), tags: r.receipt.tags.map(tagLabel).join(', ') || 'handed over' }),
        href: `/receipt/${r.receipt.key}`,
        toast: 'success' as const,
        pref: 'receipts' as const,
      }));
    diff('receipts', out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts.data, receipts.isPlaceholderData]);

  // ---------------------------------------------------------------- everyone: reports, vouches, level
  useEffect(() => {
    const p = profile.data;
    if (!p || profile.isPlaceholderData) return;
    diff(
      'reports',
      p.complaints.map((x) => ({ id: `report:${x.key}`, kind: 'report' as const, title: c.report, body: fill(c.reportBody, { name: aliasFor(x.creator), reason: reasons[x.reason].toLowerCase() }), href: '/profile', toast: 'error' as const, pref: 'receipts' as const })),
    );
    const trusted = p.attestations.filter((a) => a.trusted);
    const prevTier = tier.current;
    const wasVerified = prevTier !== null && RANK[prevTier] > 0;
    diff(
      'vouches',
      trusted.map((a) => ({
        id: `vouched:${a.key}`,
        kind: 'vouched' as const,
        title: wasVerified ? c.vouchedAgain : c.vouched,
        body: fill(wasVerified ? c.vouchedAgainBody : c.vouchedBody, { desk: deskName(a.creator) }),
        href: '/verify',
        pref: 'receipts' as const,
      })),
    );
    const current = new Map(trusted.map((a) => [a.key as string, a.creator as string]));
    if (vouchKeys.current) {
      for (const [k, creator] of vouchKeys.current) {
        if (current.has(k)) continue;
        fire({ id: `unvouched:${k}`, kind: 'unvouched', title: c.unvouched, body: fill(c.unvouchedBody, { desk: deskName(creator) }), href: '/profile', toast: 'info', pref: 'receipts' });
      }
    }
    vouchKeys.current = current;
    if (prevTier && RANK[p.tier.name] > RANK[prevTier]) {
      toast.success(fill(c.levelUp, { level: levelLabel(p.tier.name), limits: LEVEL_LIMITS[p.tier.name] }));
    }
    tier.current = p.tier.name;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, profile.isPlaceholderData]);

  return null;
}

