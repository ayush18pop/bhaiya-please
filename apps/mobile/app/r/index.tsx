import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Run } from '@bhaiya-please/core';
import { ArkivNote } from '@/components/ArkivNote';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { RunCard } from '@/components/RunCard';
import { useSession } from '@/components/providers';
import { Text } from '@/components/ui/text';
import { useLiveRuns } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
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

  return (
    <Page>
      <View className="flex-row items-center justify-between">
        <View>
          <Text variant="h2">{S.runs.title}</Text>
          <Text variant="muted">{zone.label}</Text>
        </View>
        <View className="flex-row items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1">
          <View className="h-2 w-2 rounded-full bg-secondary" />
          <Text className="text-xs font-bold text-secondary">{S.runs.live}</Text>
        </View>
      </View>

      {q.isLoading && !q.data ? (
        <SkeletonCards />
      ) : runs.length === 0 ? (
        <EmptyState title={S.runs.empty} body={S.runs.emptyWarm} />
      ) : (
        <View className="gap-3">
          {runs.map((r) => (
            <RunCard key={r.key} run={r} onAsk={() => router.push(`/r/run/${r.key}`)} />
          ))}
        </View>
      )}

      <ArkivNote text={S.runs.whyVanish} explainer={S.runs.whyVanishBody} />
    </Page>
  );
}
