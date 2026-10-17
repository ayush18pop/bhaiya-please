/**
 * App-wide alert upkeep (mounted by components/shell/AppWatchers while signed in):
 * - "Notify me" (B1): keeps the 24 h "someone heading here" alert in step with the toggle, the
 *   society and the push channel, renewing it on app open.
 * - No-show proof (§4): once this phone sees a request of mine accepted, set the attest alert, once.
 * - D7: polls the signed receipts of my alerts (60 s, and when the app regains focus) and merges them
 *   into the inbox as "via Arkiv Trigger" rows.
 * All writes are fire-and-forget; failures surface in Settings → Notifications only.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCore, useSession } from '@/components/providers';
import { nowUnix } from '@/hooks/useNow';
import { resolveCopy } from '@/lib/i18n';
import { alertsAfterAccepted, protocol, SANDBOX_TRIGGERS, syncNotifyMe, useChannel } from '@/lib/triggers';
import { useMine } from './NotificationWatcher';
import { surfaceAlert, toastAlert } from './alerts';
import { sharedCopy } from './copy';

const FIRINGS_POLL_MS = 60_000;

export default function AlertSync() {
  const router = useRouter();
  const core = useCore();
  const { address, prefs, society, guest } = useSession();
  const channel = useChannel(address);
  const mine = useMine();

  // Notify me: on app open, toggle, society change or a new channel.
  useEffect(() => {
    if (!address || guest) return;
    syncNotifyMe(core, address, prefs.notifyMe, society.zone6);
  }, [core, address, guest, prefs.notifyMe, society.zone6, channel?.id]);

  // No-show proof alert once acceptance is seen (idempotent per request, kept on this phone).
  useEffect(() => {
    if (!address || guest || !mine.data) return;
    for (const r of mine.data) {
      if (!r.accept || r.delivery || !r.run) continue;
      alertsAfterAccepted(core, address, { requestKey: r.request.key, rider: r.accept.rider, runExpiresAt: r.run.expiresAt });
    }
  }, [core, address, guest, mine.data]);

  // Signed receipts of my alerts → inbox. The sandbox's in-page engine delivers directly, this adds
  // the receipt details once they are saved.
  const firings = useQuery({
    queryKey: [address, 'alerts', 'firings'],
    queryFn: () => protocol.listMyFirings(core, address!, nowUnix() - 6 * 3600),
    enabled: !!address && !guest,
    refetchInterval: SANDBOX_TRIGGERS ? 15_000 : FIRINGS_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
  useEffect(() => {
    if (!firings.data) return;
    const label = resolveCopy(sharedCopy).notifs.open;
    // Oldest first, so the inbox keeps newest on top.
    for (const f of [...firings.data].reverse()) {
      if (f.firing.outcome === 'skipped') continue;
      const r = surfaceAlert({
        kind: f.kind,
        trigger: f.trigger,
        entity: f.firing.entity,
        at: f.firing.at,
        receipt: {
          receipt: f.firing.key,
          trigger: f.firing.trigger,
          entity: f.firing.entity,
          event: f.firing.event,
          outcome: f.firing.outcome,
          worker: f.firing.creator,
          block: f.firing.block.toString(),
          at: f.firing.at,
          ...(f.firing.attestation ? { attestation: f.firing.attestation } : {}),
        },
      });
      // A firing only seen now (push missed, app was closed): show it once, quietly for old ones.
      if (nowUnix() - f.firing.at < 120) toastAlert(r, (h) => router.push(h as never), label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firings.data]);

  return null;
}
