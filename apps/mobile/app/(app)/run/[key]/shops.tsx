/** B3 Pick a shop on the runner's route (map pins and list stay in sync). */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import type { ShopCategory } from '@bhaiya-please/core';
import { Alert, Button, Chip, Empty, Icon, Screen, SkeletonCards, Text } from '@/components/bp';
import { MapView } from '@/components/map/MapView';
import { useSession } from '@/components/providers';
import { usePings, useProfile, useRun } from '@/hooks/queries';
import { ReadProblem } from '@/components/shell/ReadProblem';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { setDraft, useDraft } from '@/lib/draft';
import { fill, useCopy } from '@/lib/i18n';
import { runnerPin, shopPins } from '@/lib/mapModel';
import { residentCopy } from '@/screens/resident/copy';
import { CATEGORIES, minsTo, runOpen, shopAge, ShopBoard, useRouteShops, useShopMeta } from '@/screens/resident/parts';

export default function PickShop() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const c = useCopy(residentCopy);
  const now = useNow();
  const { society } = useSession();
  const draft = useDraft();
  const run = useRun(key);
  const r = run.data;
  const profile = useProfile(r?.creator);
  const pings = usePings(r ? [r.key] : []);
  const shops = useRouteShops(r?.fromZone);
  const meta = useShopMeta();
  const [cat, setCat] = useState<ShopCategory | null>(null);

  useEffect(() => {
    if (draft.runKey !== key) setDraft({ runKey: key, shopKey: null });
  }, [key, draft.runKey]);

  const name = r ? aliasFor(r.creator) : '';
  const all = shops.data ?? [];
  const list = cat ? all.filter((s) => s.category === cat) : all;
  const selected = draft.runKey === key ? all.find((s) => s.key === draft.shopKey) ?? null : null;
  const select = (k: string) => setDraft({ runKey: key, shopKey: k });
  const ended = (run.isSuccess && !r) || (!!r && !runOpen(r, now));
  const pin = r ? runnerPin(r, pings.data?.[0], now, { tier: profile.data?.tier.name ?? null, focused: true }) : null;
  const pins = shopPins(list, selected?.key);
  const mins = r ? minsTo(r.eta, now) : 0;
  const addHref = `/shop/new?zone5=${society.zone5}&run=${key}`;

  const footer = ended ? (
    <Button label={c.common.seeOtherRuns} onPress={() => router.replace('/home')} />
  ) : (
    <Button
      label={selected ? fill(c.shops.continueWith, { name: selected.nameTag }) : c.shops.pickOne}
      disabled={!selected}
      onPress={() => router.push(`/ask?run=${key}&shop=${selected!.key}`)}
    />
  );

  return (
    <Screen title={c.shops.title} footer={footer} contentClassName="px-0 pt-0 gap-0">
      <View className="border-b-2 border-line bg-bg px-4 pb-2.5">
        <Text className="text-[13px] font-semibold text-muted">{r ? (mins > 0 ? fill(c.shops.sub, { name, min: mins }) : fill(c.shops.subGate, { name })) : ' '}</Text>
      </View>
      <View className="h-[220px] border-b-2 border-line">
        <MapView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          society={{ pos: society.gate, label: fill(c.home.gate, { society: society.name }) }}
          shops={pins}
          runners={pin ? [pin] : []}
          routes={pin ? [{ id: pin.id, from: { runner: pin.id }, to: society.gate, tone: 'primary' }] : []}
          fit={[society.gate, ...pins.map((p) => p.pos), ...(pin ? [pin.pos] : [])]}
          fitKey={`${key}:${pins.length}:${cat ?? ''}`}
          padding={{ top: 40, bottom: 24, left: 32, right: 32 }}
          onShopPress={select}
          note={c.shops.mapNote}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }} contentContainerClassName="gap-2 px-4 pb-1.5 pt-3.5">
        <Chip label={c.shops.all} selected={!cat} onPress={() => setCat(null)} />
        {CATEGORIES.map((k) => (
          <Chip key={k} label={c.shops.cat[k]} selected={cat === k} onPress={() => setCat(cat === k ? null : k)} />
        ))}
      </ScrollView>
      <View accessibilityRole="radiogroup" className="gap-3.5 px-4 pb-4 pt-3">
        {ended ? <Alert tone="expired" title={fill(c.shops.ended, { name: name || 'The runner' })} /> : null}
        {(run.isError && !r) || (shops.isError && !shops.data) ? <ReadProblem error={run.error} /> : null}
        {shops.isLoading ? (
          <SkeletonCards n={3} kind="row" />
        ) : list.length === 0 && !(shops.isError && !shops.data) ? (
          <Empty title={cat ? fill(c.shops.emptyCat, { cat: c.shops.cat[cat] }) : c.shops.empty} body={c.shops.emptyBody} />
        ) : (
          list.map((s) => (
            <View key={s.key}>
              <ShopBoard
                shop={s}
                meta={meta(s, now)}
                selected={selected?.key === s.key}
                fading={shopAge(s, now).fading}
                onPress={() => select(s.key)}
                onInfo={() => router.push(`/shop/${s.key}`)}
                infoLabel={fill(c.shops.info, { name: s.nameTag })}
              />
            </View>
          ))
        )}
        <Pressable onPress={() => router.push(addHref as never)} accessibilityRole="link" className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-plate border-2 border-dashed border-muted active:opacity-70">
          <Icon as={Plus} size={18} strokeWidth={2.6} />
          <Text className="text-[15px] font-bold">{c.shops.addIt}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
