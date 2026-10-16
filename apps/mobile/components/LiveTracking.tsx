/** Live tracking card: one runner heading to the gate, ETA chip, freshness, breadcrumb trail. */
import { View } from 'react-native';
import { Navigation } from 'lucide-react-native';
import type { Run } from '@bhaiya-please/core';
import { pingAge, PING_RULES } from '@bhaiya-please/core/mock';
import { Countdown } from '@/components/Countdown';
import { LiveBadge } from '@/components/LiveBadge';
import { MapView } from '@/components/map/MapView';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useProfile, usePings, useRunTrail } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { runnerPin, zoneCenter } from '@/lib/mapModel';
import { zoneByHash } from '@/lib/zones';

export function LiveTracking({ run, height = 300 }: { run: Run; height?: number }) {
  const now = useNow();
  const pings = usePings([run.key]);
  const trail = useRunTrail(run.key);
  const profile = useProfile(run.creator);
  const gate = zoneCenter(run.destZone);
  const ping = pings.data?.[0];
  const pin = runnerPin(run, ping, now, { tier: profile.data?.tier.name ?? null, focused: true, trail: trail.data });
  const society = zoneByHash(run.destZone)?.society ?? 'Your society';
  const age = ping ? pingAge(ping, now) : null;

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card shadow-card" style={{ height }}>
      <MapView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        society={{ pos: gate, label: `${society} gate` }}
        runners={pin ? [{ ...pin, chip: undefined, sub: undefined }] : []}
        routes={pin ? [{ id: run.key, from: { runner: run.key }, to: gate, tone: 'primary' }] : []}
        fit={[gate, ...(pin ? [pin.pos, ...(pin.trail ?? [])] : [])]}
        fitKey={`${run.key}:${pin ? 1 : 0}`}
        padding={{ top: 70, bottom: 60, left: 40, right: 40 }}
      />
      <View pointerEvents="none" className="absolute left-3 right-3 top-3 flex-row items-start justify-between gap-2">
        <View className="rounded-2xl bg-card/95 px-3 py-2 shadow-lift">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Arriving in</Text>
          <Countdown to={run.eta} endLabel="At the gate" className="text-xl font-extrabold text-primary-ink" />
        </View>
        <LiveBadge dataUpdatedAt={pings.dataUpdatedAt} isError={pings.isError} />
      </View>
      <View pointerEvents="none" className="absolute bottom-3 left-3 right-3 flex-row items-center gap-2 rounded-xl bg-card/95 px-3 py-2 shadow-lift">
        <Icon as={Navigation} size={14} className={pin?.freshness === 'live' ? 'text-green-600' : 'text-muted-foreground'} />
        <Text className="flex-1 text-xs font-semibold" numberOfLines={1}>
          {age === null
            ? 'Waiting for the runner to share live location…'
            : `Last seen ${age}s ago${pin?.freshness === 'stale' ? ' · signal weak' : ''} · ping deletes itself in ${Math.max(0, PING_RULES.ttlSeconds - age)}s`}
        </Text>
      </View>
    </View>
  );
}
