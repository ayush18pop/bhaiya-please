/**
 * Runner-side publisher, mounted app-wide for the runner role so it keeps going across tabs.
 * While the runner's run is live and sharing is on: every 20 s read a position (GPS, or the synthetic
 * route in "Simulate route" mode), coarsen it ON DEVICE to geohash-7 and publish a Ping that deletes
 * itself after 2 min. Stops when the run ends or the toggle is off.
 */
import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';
import type { Run } from '@bhaiya-please/core';
import { coarsenToGh7, PING_RULES, simulatedPosition } from '@bhaiya-please/core/mock';
import { useCore } from '@/components/providers';
import { useRunnerBoard } from '@/hooks/queries';
import { nowSec } from '@/lib/format';
import { getSharing, setSharing, useSharing } from '@/lib/sharing';

async function readPosition(run: Run, simulate: boolean) {
  if (simulate) {
    const s = simulatedPosition(run, nowSec());
    return { lat: s.pos.lat, lng: s.pos.lng, heading: s.heading, speedKmh: s.speedKmh };
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw Object.assign(new Error('Location permission denied'), { denied: true });
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const heading = p.coords.heading != null && p.coords.heading >= 0 ? p.coords.heading : undefined;
  const speedKmh = p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed * 3.6 : undefined;
  return { lat: p.coords.latitude, lng: p.coords.longitude, heading, speedKmh };
}

export function PingBeacon() {
  const core = useCore();
  const qc = useQueryClient();
  const board = useRunnerBoard();
  const { enabled, simulate } = useSharing();
  const seq = useRef(0);
  const run = board.data?.run ?? null;
  const live = !!run && run.expiresAt > nowSec() + 2;

  useEffect(() => {
    if (!run || !live) {
      setSharing({ status: run ? 'ended' : 'off', pendingGh7: null });
      return;
    }
    if (!enabled) {
      setSharing({ status: 'off', pendingGh7: null });
      return;
    }
    let dead = false;
    const send = async () => {
      if (dead || nowSec() >= run.expiresAt - 2) {
        setSharing({ status: 'ended' });
        return;
      }
      try {
        setSharing({ status: getSharing().lastSentAt ? 'sharing' : 'sending' });
        const p = await readPosition(run, simulate);
        // Coarsened here, on the device. Exact lat/lng never leaves this function.
        const gh7 = coarsenToGh7(p.lat, p.lng);
        setSharing({ pendingGh7: gh7 }); // optimistic: own marker moves immediately
        await core.publishPing(run.key, gh7, {
          seq: seq.current++,
          ...(p.heading !== undefined ? { heading: Math.round(p.heading) % 360 } : {}),
          ...(p.speedKmh !== undefined ? { speedKmh: Math.min(200, Math.round(p.speedKmh)) } : {}),
        });
        if (dead) return;
        setSharing({ status: 'sharing', lastSentAt: nowSec(), lastGh7: gh7, pendingGh7: null, error: null });
        void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('pings') });
      } catch (e) {
        if (dead) return;
        const denied = !!(e as { denied?: boolean }).denied;
        setSharing({ status: denied ? 'denied' : 'error', pendingGh7: null, error: e instanceof Error ? e.message : 'Could not share' });
      }
    };
    void send();
    const t = setInterval(send, PING_RULES.intervalSeconds * 1000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [run?.key, live, enabled, simulate, core, qc]);

  return null;
}
