/**
 * Sandbox only: an Arkiv Triggers engine running IN this browser tab over the mock chain, so alerts
 * work with no server (docs/TRIGGERS.md §5). One engine per tab per account, as that account's own
 * worker wallet (`sandboxWorker`), which only runs triggers that name it. "Push" turns into an in-app
 * toast + inbox entry, and the split view hears `{bp:'event', type:'trigger.fired'}`. The
 * `bhaiyaplease.noshow` attester writes core's no-show evidence.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import type { Address, EntityKey } from '@bhaiya-please/core';
import { buildNoShowEvidence } from '@bhaiya-please/core/mock';
import { createCallbackPushSender, createMemoryChannelDirectory, createTriggerEngine, type EngineState, type FiringEvent } from '@arkiv-triggers/core';
import { useSession } from '@/components/providers';
import { resolveCopy } from '@/lib/i18n';
import { getJSON, setJSON } from '@/lib/storage';
import { protocol, sandboxChannel, sandboxWorker, SANDBOX_TRIGGERS } from '@/lib/triggers';
import { surfaceAlert, toastAlert } from '@/screens/shared/alerts';
import { sharedCopy } from '@/screens/shared/copy';

const POLL_MS = 3000;

function postToParent(type: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage({ bp: 'event', type }, window.location.origin);
  } catch {}
}

export function TriggerHost() {
  const router = useRouter();
  const { core, sandbox, address } = useSession();
  // The split view page hosts the phones as iframes; each phone runs its own engine.
  const host = usePathname().startsWith('/sandbox');
  useEffect(() => {
    if (!SANDBOX_TRIGGERS || !sandbox || host || !core?.dev || !address) return;
    const worker = sandboxWorker(address) as Address;
    const port = core.dev.port(worker);
    const channels = createMemoryChannelDirectory();
    channels.register('webpush', address, sandboxChannel(address));
    const storeKey = `bp.sb.trig.${worker}`;
    const onFiring = (f: FiringEvent) => {
      if (f.outcome === 'skipped') return;
      const kind = protocol.kindOf(f.trigger);
      const r = surfaceAlert({
        kind,
        trigger: f.trigger,
        entity: f.entity,
        at: f.at,
        receipt: { receipt: null, trigger: f.trigger.key, entity: f.entity, event: f.event, outcome: f.outcome, worker, block: f.block.toString(), at: f.at },
        ...(f.message ? { title: f.message.title, body: f.message.body } : {}),
      });
      toastAlert(r, (h) => router.push(h as never), resolveCopy(sharedCopy).notifs.open);
      postToParent('trigger.fired');
    };
    const engine = createTriggerEngine({
      port,
      workerAddress: worker,
      pollMs: POLL_MS,
      triggerRefreshMs: POLL_MS,
      flushMs: 0,
      actions: { channels, push: createCallbackPushSender(() => {}) },
      plugins: {
        [protocol.NOSHOW_ATTESTER]: async (p, ctx) => {
          const key = (ctx.params.request ?? String(ctx.entity.attributes.request?.value ?? '')) as EntityKey;
          if (!key) return null;
          const ev = await buildNoShowEvidence(p, 'bhaiyaplease', key, { atBlock: ctx.block });
          return ev?.spec ?? null;
        },
      },
      store: { load: () => getJSON<EngineState | null>('local', storeKey, null), save: (s) => setJSON('local', storeKey, s) },
      onFiring,
      onLog: (e) => {
        if (e.level === 'error' && __DEV__) console.warn('[triggers]', e.msg, e.data ?? '');
      },
    });
    engine.start();
    return () => {
      void engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, sandbox, address, host]);
  return null;
}

export default TriggerHost;
