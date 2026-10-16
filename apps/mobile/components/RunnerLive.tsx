/** Runner's own live view: map (self, gate, shops on route) + the location-sharing control. */
import { Switch, View } from 'react-native';
import { MapPinOff, Radio, Route } from 'lucide-react-native';
import type { Run } from '@bhaiya-please/core';
import { geohashCenter, PING_RULES } from '@bhaiya-please/core/mock';
import { LiveBadge } from '@/components/LiveBadge';
import { MapView } from '@/components/map/MapView';
import type { RunnerPin } from '@/components/map/types';
import { useSession } from '@/components/providers';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePings, useProfile, useRunTrail, useShops } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { etaLabel, runnerPin, shopPins, zoneCenter } from '@/lib/mapModel';
import { setSharing, useSharing } from '@/lib/sharing';
import { zoneByHash } from '@/lib/zones';
import { cn } from '@/lib/utils';

export function RunnerLiveMap({ run }: { run: Run }) {
  const now = useNow();
  const { address } = useSession();
  const pings = usePings([run.key]);
  const trail = useRunTrail(run.key);
  const shops = useShops(run.fromZone.slice(0, 5));
  const profile = useProfile(address);
  const sharing = useSharing();
  const gate = zoneCenter(run.destZone);
  let pin: RunnerPin | null = runnerPin(run, pings.data?.[0], now, { tier: profile.data?.tier.name ?? null, focused: true, trail: trail.data });
  // Optimistic: show where we just sent before the ping is confirmed on chain.
  if (sharing.pendingGh7) {
    pin = { ...(pin ?? { id: run.key, tier: profile.data?.tier.name ?? null, freshness: 'live', focused: true }), pos: geohashCenter(sharing.pendingGh7), chip: etaLabel(run, now), sub: 'sending…' };
  }
  const pins = shopPins(shops.data ?? []);
  return (
    <View className="h-80 overflow-hidden rounded-2xl border border-border bg-card shadow-sm shadow-black/10">
      <MapView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        society={{ pos: gate, label: `${zoneByHash(run.destZone)?.society ?? 'Destination'} gate` }}
        shops={pins}
        runners={pin ? [pin] : []}
        routes={pin ? [{ id: run.key, from: { runner: run.key }, to: gate, tone: 'primary' }] : []}
        fit={[gate, ...(pin ? [pin.pos] : []), ...pins.map((p) => p.pos)]}
        fitKey={`${run.key}:${pin ? 1 : 0}`}
        padding={{ top: 120, bottom: 40, left: 40, right: 40 }}
        note="You appear as a ~150 m cell"
      />
      <View pointerEvents="none" className="absolute left-3 top-3">
        <LiveBadge dataUpdatedAt={pings.dataUpdatedAt} isError={pings.isError} />
      </View>
    </View>
  );
}

export function SharingCard({ demo }: { demo: boolean }) {
  const s = useSharing();
  const now = useNow();
  const on = s.enabled && (s.status === 'sharing' || s.status === 'sending');
  const age = s.lastSentAt ? Math.max(0, now - s.lastSentAt) : null;
  const sub =
    s.status === 'denied'
      ? 'Location permission denied. Allow it, or use Simulate route.'
      : s.status === 'error'
        ? `Couldn't send: ${s.error ?? 'try again'}`
        : s.status === 'ended'
          ? 'Run ended, sharing stopped.'
          : !s.enabled
            ? 'Off. Residents only see your ETA.'
            : age === null
              ? 'Finding your position…'
              : `Last sent ${age}s ago · cell ${s.lastGh7} · every ${PING_RULES.intervalSeconds}s`;
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm shadow-black/5">
      <View className="flex-row items-center gap-3">
        <View className={cn('h-10 w-10 items-center justify-center rounded-full', on ? 'bg-green-600/15' : 'bg-muted')}>
          <Icon as={s.enabled ? Radio : MapPinOff} size={20} className={on ? 'text-green-700' : 'text-muted-foreground'} />
        </View>
        <View className="flex-1">
          <Text className="font-bold">{s.enabled ? 'Sharing live location' : 'Live location off'}</Text>
          <Text variant="caption">Deletes itself in 2 min · only a ~150 m cell</Text>
        </View>
        <Switch value={s.enabled} onValueChange={(v) => setSharing({ enabled: v })} accessibilityLabel="Share live location" trackColor={{ true: '#e2591b', false: '#cbd5e1' }} thumbColor="#ffffff" />
      </View>
      <Text variant="caption" className={cn(s.status === 'error' || s.status === 'denied' ? 'text-destructive' : '')}>{sub}</Text>
      {(
        <View className="flex-row items-center gap-3 border-t border-border pt-3">
          <Icon as={Route} size={16} className="text-muted-foreground" />
          <View className="flex-1">
            <Text className="text-sm font-semibold">Simulated route</Text>
            <Text variant="caption">{s.simulate ? 'On: a synthetic Whitefield route. Your real location never leaves the phone.' : 'Off: your real position, coarsened to ~150 m, is written publicly to Arkiv.'}</Text>
          </View>
          <Switch value={s.simulate} onValueChange={(v) => setSharing({ simulate: v })} accessibilityLabel="Simulate route" trackColor={{ true: '#e2591b', false: '#cbd5e1' }} thumbColor="#ffffff" />
        </View>
      )}
    </View>
  );
}

