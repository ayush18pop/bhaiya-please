/**
 * B1 Home (Get things): full-bleed map of runs heading to your society, with a glass bottom sheet of
 * run cards sorted by arrival. Empty = paper poster at the auto stand. Offline = last-known list.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import type { Address, Profile, Run } from '@bhaiya-please/core';
import { Button, HardShadow, OfflineBanner, RunCard, SkeletonCards, SlideInCard, Switch, Text } from '@/components/bp';
import { BottomSheet } from '@/components/BottomSheet';
import { MapView } from '@/components/map/MapView';
import type { RouteLine, RunnerPin } from '@/components/map/types';
import { useCore, useSession } from '@/components/providers';
import { HomeHeader } from '@/components/shell/HomeHeader';
import { useLiveRuns, usePings, useRunTrail, useShops } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { fill, useCopy, useT } from '@/lib/i18n';
import { runnerPin, shopPins } from '@/lib/mapModel';
import { useOnline } from '@/lib/online';
import { residentCopy } from './copy';
import { AutoStandScene, runCardState, useGuestGate, useVisibleRuns } from './parts';

/** Profiles for several runners (shares the ['profile', addr] cache with useProfile). */
function useProfiles(addrs: Address[]) {
  const core = useCore();
  const { address } = useSession();
  const uniq = [...new Set(addrs)];
  const qs = useQueries({ queries: uniq.map((a) => ({ queryKey: [address, 'profile', a], queryFn: () => core.getProfile(a), structuralSharing: false })) });
  const out: Record<string, Profile> = {};
  uniq.forEach((a, i) => {
    const p = qs[i]?.data;
    if (p) out[a] = p;
  });
  return out;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function EmptyPoster() {
  const t = useT();
  const c = useCopy(residentCopy);
  const { society, prefs, setPrefs } = useSession();
  const [w, setW] = useState(0);
  return (
    <View className="flex-1 p-3">
      <View className="flex-1 rounded-[14px] border-2 border-paper">
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} className="flex-1 overflow-hidden rounded-block border-2 border-ink bg-paper">
          {w > 0 ? <AutoStandScene width={w} /> : null}
          <View className="gap-3.5 px-5 pt-6">
            <Text variant="display" className="text-ink">
              {t('home.empty.title', { society: society.name })}
            </Text>
            <HardShadow shadow="ink" className="flex-row items-center justify-between gap-3 rounded-block border-2 border-ink bg-white px-3.5 py-3">
              <Text className="flex-1 text-[16px] font-bold leading-[20px] text-ink">{t('home.empty.notify')}</Text>
              <Switch value={prefs.notifyMe} onChange={(v) => setPrefs({ notifyMe: v })} label={t('home.empty.notify')} />
            </HardShadow>
            <Text accessibilityLiveRegion="polite" className="text-[15px] font-semibold text-ink">
              {prefs.notifyMe ? c.home.notifyOn : c.home.hint}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ResidentHome() {
  const router = useRouter();
  const t = useT();
  const c = useCopy(residentCopy);
  const { society } = useSession();
  const online = useOnline();
  const now = useNow();
  const { guard, sheet } = useGuestGate();
  const q = useLiveRuns(society.zone6);
  const { runs, gone } = useVisibleRuns(q.data, now);
  const pings = usePings(runs.map((r) => r.key));
  const shops = useShops(society.zone5);
  const profiles = useProfiles(runs.map((r) => r.creator));
  const [focus, setFocus] = useState<string | null>(null);
  const [h, setH] = useState(640);

  const gate = society.gate;
  const focused = focus && runs.some((r) => r.key === focus) ? focus : (runs[0]?.key ?? null);
  const trail = useRunTrail(focused);
  const byRun = useMemo(() => new Map((pings.data ?? []).map((p) => [p.run, p])), [pings.data]);
  const pins = runs
    .map((r) => {
      const on = r.key === focused;
      const pin = runnerPin(r, byRun.get(r.key), now, { tier: profiles[r.creator]?.tier.name ?? null, focused: on, trail: on ? trail.data : [] });
      // Only the focused runner carries the ETA chip; the rest stay quiet.
      return pin && !on ? { ...pin, chip: undefined, sub: undefined } : pin;
    })
    .filter((p): p is RunnerPin => !!p);
  const routes: RouteLine[] = pins.map((p) => ({ id: p.id, from: { runner: p.id }, to: gate, tone: p.focused ? 'primary' : 'muted' }));

  const loading = !q.data && q.isLoading;
  const empty = !loading && runs.length === 0;
  const updated = q.dataUpdatedAt || Date.now();
  const offMin = Math.max(1, Math.round((Date.now() - updated) / 60000));

  const title = !online
    ? fill(c.home.runsAsOf, { n: runs.length, time: clock(updated) })
    : runs.length === 1
      ? c.home.oneRunHere
      : fill(c.home.runsHere, { n: runs.length });

  const card = (r: Run) => {
    const state = runCardState(r, byRun.get(r.key), now, online, gone.has(r.key));
    const p = profiles[r.creator];
    const ping = byRun.get(r.key);
    const open = () => router.push(`/run/${r.key}`);
    const ask = guard(() => router.push(`/run/${r.key}/shops`));
    const canAsk = state === 'live' || state === 'stale';
    return (
      <SlideInCard key={r.key} className="relative">
        <RunCard
          run={r}
          level={p?.tier.name ?? null}
          handoffs={p?.receiptsTotal}
          now={now}
          state={state}
          staleText={ping ? fill(c.home.lastSeen, { ago: `${Math.max(1, Math.round((now - ping.createdAt) / 60))} min ago` }) : undefined}
          actionNode={
            state === 'offline' ? (
              <View className="gap-1.5">
                <Button label={t('request.cta.ask')} variant="ask" size="md" full disabled />
                <Text className="text-[13px] text-muted">{c.home.offlineAsk}</Text>
              </View>
            ) : canAsk ? (
              <Button label={t('request.cta.ask')} variant="ask" size="md" full onPress={ask} className="bg-surface" accessibilityLabel={`${t('request.cta.ask')} ${aliasFor(r.creator)}`} />
            ) : (
              <View />
            )
          }
          className={state === 'full' ? 'opacity-80' : undefined}
        />
        {/* Sibling overlay (not a parent) so the card opens B2 without nesting buttons. */}
        <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={`${aliasFor(r.creator)}, see runner`} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: canAsk || state === 'offline' ? 104 : '100%' }} />
      </SlideInCard>
    );
  };

  return (
    <View className="flex-1 bg-bg">
      <HomeHeader />
      {!online ? <OfflineBanner text={fill(c.home.offline, { n: offMin })} /> : null}
      {empty ? (
        <EmptyPoster />
      ) : (
        <View className="flex-1" onLayout={(e) => setH(e.nativeEvent.layout.height)}>
          <MapView
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            society={{ pos: gate, label: fill(c.home.gate, { society: society.name }) }}
            shops={shopPins(shops.data ?? [])}
            runners={pins}
            routes={routes}
            fit={[gate, ...pins.map((p) => p.pos)]}
            fitKey={`${society.zone6}:${pins.map((p) => p.id).join(',')}`}
            padding={{ top: 64, bottom: h * 0.5 + 16, left: 48, right: 48 }}
            onRunnerPress={setFocus}
            note={t('home.mapNote')}
            controls
          />
          <BottomSheet
            collapsed={0.5}
            header={
              <View className="flex-row items-baseline justify-between pb-1">
                <Text variant="heading" accessibilityRole="header">
                  {loading ? c.home.loading : title}
                </Text>
                {!loading ? <Text className="text-[14px] font-semibold text-muted">{c.home.byArrival}</Text> : null}
              </View>
            }>
            {loading ? <SkeletonCards n={2} /> : runs.map(card)}
          </BottomSheet>
        </View>
      )}
      {sheet}
    </View>
  );
}
