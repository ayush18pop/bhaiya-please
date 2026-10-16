import { useState } from 'react';
import { View } from 'react-native';
import type { Run, Shop } from '@bhaiya-please/core';
import { MapView } from '@/components/map/MapView';
import { LiveBadge } from '@/components/LiveBadge';
import { usePings, useProfile } from '@/hooks/queries';
import { runnerPin, shopPins, zoneCenter } from '@/lib/mapModel';
import { zoneByHash } from '@/lib/zones';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArkivNote } from '@/components/ArkivNote';
import { Chip, ChipRow, EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { Reveal } from '@/components/Motion';
import { CATEGORY_ICON } from '@/components/map/icons';
import { Store } from 'lucide-react-native';
import { RunCard, runPhase } from '@/components/RunCard';
import { ShopRow } from '@/components/ShopRow';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useRun, useShops } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { fmt } from '@/lib/format';
import { S } from '@/lib/strings';

/** Shops on the runner's route, the runner (if sharing) and the gate. Tap a pin to pick the shop. */
function RouteShopsMap({ run, shops, selected, onSelect }: { run: Run; shops: Shop[]; selected: string | null; onSelect: (k: string) => void }) {
  const now = useNow();
  const pings = usePings([run.key]);
  const profile = useProfile(run.creator);
  const gate = zoneCenter(run.destZone);
  const pin = runnerPin(run, pings.data?.[0], now, { tier: profile.data?.tier.name ?? null, focused: true });
  const pins = shopPins(shops, selected);
  return (
    <View className="h-64 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <MapView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        society={{ pos: gate, label: `${zoneByHash(run.destZone)?.society ?? 'Your'} gate` }}
        shops={pins}
        runners={pin ? [pin] : []}
        routes={pin ? [{ id: run.key, from: { runner: run.key }, to: gate, tone: 'muted' }] : []}
        fit={[gate, ...pins.map((p) => p.pos)]}
        fitKey={`${run.key}:${pins.length}`}
        padding={{ top: 110, bottom: 40, left: 40, right: 40 }}
        onShopPress={onSelect}
        note="Shop pins: approximate, within their area"
      />
      <View pointerEvents="none" className="absolute left-3 top-3">
        <LiveBadge dataUpdatedAt={pings.dataUpdatedAt} isError={pings.isError} />
      </View>
    </View>
  );
}

export default function RunDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const now = useNow();
  const run = useRun(key);
  const shops = useShops(run.data?.fromZone.slice(0, 5));
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);

  const r = run.data;
  const ended = !!r && runPhase(r, now) === 'ended';
  const all = shops.data ?? [];
  const cats = [...new Set(all.map((x) => x.category))];
  const list = cat ? all.filter((x) => x.category === cat) : all;
  const chosen = list.find((s) => s.key === sel) ?? null;

  if (!r && !run.isLoading)
    return (
      <Page>
        <EmptyState title={S.runs.ended}>
          <Button variant="outline" onPress={() => router.replace('/r')}>
            <Text>{S.request.seeOtherRuns}</Text>
          </Button>
        </EmptyState>
      </Page>
    );

  return (
    <Page
      footer={
        <Button
          size="lg"
          disabled={!chosen || ended}
          onPress={() => router.push(`/r/request/new?run=${key}&shop=${chosen!.key}`)}>
          <Text>{chosen ? fmt(S.shops.continueWith, { name: chosen.nameTag }) : S.shops.pickOne}</Text>
        </Button>
      }>
      {r ? <RouteShopsMap run={r} shops={list} selected={sel} onSelect={setSel} /> : null}
      {r ? <RunCard run={r} showFrom={false} /> : <SkeletonCards n={1} />}
      <Text variant="h3">{S.shops.title}</Text>
      {cats.length > 1 ? (
        <ChipRow>
          <Chip label="All" icon={Store} selected={!cat} onPress={() => setCat(null)} />
          {cats.map((c) => (
            <Chip key={c} label={c.replace('_', ' ')} icon={CATEGORY_ICON[c]} selected={cat === c} onPress={() => setCat(c)} />
          ))}
        </ChipRow>
      ) : null}
      {shops.isLoading && !shops.data ? (
        <SkeletonCards />
      ) : list.length === 0 ? (
        <EmptyState title={S.shops.empty} icon={Store} />
      ) : (
        <View className="gap-3">
          {list.map((s, i) => (
            <Reveal key={s.key} index={i}>
              <ShopRow shop={s} selected={s.key === sel} onSelect={() => setSel(s.key)} />
            </Reveal>
          ))}
        </View>
      )}
      <ArkivNote text={S.shops.note} explainer="A shop is a record with a 30-day expiry that any wallet is allowed to extend. If neighbours keep tapping Still open, it stays. If nobody does, it disappears." />
    </Page>
  );
}
