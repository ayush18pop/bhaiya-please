import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { House } from 'lucide-react-native';
import type { Run } from '@bhaiya-please/core';
import { ArkivNote } from '@/components/ArkivNote';
import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState, SkeletonCards } from '@/components/Bits';
import { LiveBadge } from '@/components/LiveBadge';
import { MapView } from '@/components/map/MapView';
import type { RouteLine, RunnerPin } from '@/components/map/types';
import { RunCard } from '@/components/RunCard';
import { useSession } from '@/components/providers';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useLiveRuns, usePings, useRunTrail, useShops, useTiers } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { runnerPin, shopPins, zoneCenter } from '@/lib/mapModel';
import { S } from '@/lib/strings';
import { zoneById } from '@/lib/zones';

/** Cards stay until expiry (+3 s grace) even after the query stops returning them past ETA. */
function useVisibleRuns(runs: Run[] | undefined, now: number) {
  const seen = useRef(new Map<string, Run>());
  return useMemo(() => {
    if (runs) {
      const returned = new Set<string>(runs.map((r) => r.key));
      runs.forEach((r) => seen.current.set(r.key, r));
      for (const [k, r] of seen.current) {
        // Gone before ETA = cancelled or full: drop. After ETA = at the gate: keep until expiry.
        if (!returned.has(k) && now < r.eta) seen.current.delete(k);
      }
    }
    for (const [k, r] of seen.current) if (now > r.expiresAt + 3) seen.current.delete(k);
    return [...seen.current.values()].sort((a, b) => a.eta - b.eta);
  }, [runs, now]);
}

export default function ResidentRuns() {
  const router = useRouter();
  const { zoneId } = useSession();
  const zone = zoneById(zoneId);
  const q = useLiveRuns(zone.zone6);
  const now = useNow();
  const runs = useVisibleRuns(q.data, now);
  const pings = usePings(runs.map((r) => r.key));
  const shops = useShops(zone.zone5);
  const tiers = useTiers(runs.map((r) => r.creator));
  const [focus, setFocus] = useState<string | null>(null);
  const [h, setH] = useState(640);

  const gate = zoneCenter(zone.zone6);
  const focused = focus && runs.some((r) => r.key === focus) ? focus : (runs[0]?.key ?? null);
  const trail = useRunTrail(focused);
  const byRun = new Map((pings.data ?? []).map((p) => [p.run, p]));
  const pins = runs
    .map((r) => {
      const on = r.key === focused;
      const pin = runnerPin(r, byRun.get(r.key), now, { tier: tiers[r.creator] ?? null, focused: on, trail: on ? trail.data : [] });
      // Only the focused runner carries the ETA chip; the rest stay quiet.
      return pin && !on ? { ...pin, chip: undefined, sub: undefined } : pin;
    })
    .filter((p): p is RunnerPin => !!p);
  const routes: RouteLine[] = pins.map((p) => ({ id: p.id, from: { runner: p.id }, to: gate, tone: p.focused ? 'primary' : 'muted' }));
  const onMap = pins.length;

  return (
    <View className="flex-1" onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <MapView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        society={{ pos: gate, label: `${zone.society} gate` }}
        shops={shopPins(shops.data ?? [])}
        runners={pins}
        routes={routes}
        fit={[gate, ...pins.map((p) => p.pos)]}
        fitKey={`${zone.zone6}:${pins.map((p) => p.id).join(',')}`}
        padding={{ top: 90, bottom: h * 0.42 + 24, left: 50, right: 50 }}
        onRunnerPress={setFocus}
        note="Runner positions are ~150 m cells"
      />

      <View pointerEvents="box-none" className="absolute left-3 right-3 top-3 flex-row items-start justify-between gap-2">
        <View className="flex-shrink flex-row items-center gap-2 rounded-2xl bg-card/95 px-3 py-2 shadow-md shadow-black/15">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
            <Icon as={House} size={14} className="text-primary-foreground" />
          </View>
          <View className="flex-shrink">
            <Text className="text-sm font-extrabold" numberOfLines={1}>{zone.society}</Text>
            <Text className="font-mono text-[10px] text-muted-foreground">{zone.zone6} · all the chain sees</Text>
          </View>
        </View>
        <LiveBadge dataUpdatedAt={Math.max(q.dataUpdatedAt, pings.dataUpdatedAt)} isError={q.isError} />
      </View>

      <BottomSheet
        collapsed={0.42}
        header={
          <View className="flex-row items-end justify-between pb-1">
            <View>
              <Text variant="h3">{S.runs.title}</Text>
              <Text variant="caption">
                {runs.length === 0 ? 'Waiting for runs…' : `${runs.length} heading here · ${onMap} sharing live location`}
              </Text>
            </View>
          </View>
        }>
        {q.isLoading && !q.data ? (
          <SkeletonCards />
        ) : runs.length === 0 ? (
          <EmptyState title={S.runs.empty} body={S.runs.emptyWarm} />
        ) : (
          runs.map((r) => <RunCard key={r.key} run={r} onAsk={() => router.push(`/r/run/${r.key}`)} />)
        )}
        <ArkivNote text={S.runs.whyVanish} explainer={S.runs.whyVanishBody} />
        <ArkivNote
          text="Live location deletes itself in 2 min."
          explainer="A runner's phone writes a rough ~150 m cell every 20 s while their run is active. Each ping expires on Arkiv after 2 minutes, and only pings signed by the runner's own wallet are shown. Exact GPS never leaves their phone."
        />
      </BottomSheet>
    </View>
  );
}
