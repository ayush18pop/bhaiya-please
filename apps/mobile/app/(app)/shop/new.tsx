/** B5 Add a shop: name, category, rough area, then back to B3 with it selected. */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Clock } from 'lucide-react-native';
import type { ShopCategory } from '@bhaiya-please/core';
import { Button, Chip, ChipRow, Field, Icon, SaveButton, Screen, Segmented, Text } from '@/components/bp';
import { MapView } from '@/components/map/MapView';
import { useCore, useSession } from '@/components/providers';
import { useRun } from '@/hooks/queries';
import { setDraft } from '@/lib/draft';
import { fill, useCopy } from '@/lib/i18n';
import { zoneCenter } from '@/lib/mapModel';
import { placeName } from '@/lib/societies';
import { residentCopy } from '@/screens/resident/copy';
import { CATEGORIES, useGuestGate, useInvalidate, useRouteShops } from '@/screens/resident/parts';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, '');

export default function AddShop() {
  const params = useLocalSearchParams<{ zone5?: string; run?: string }>();
  const router = useRouter();
  const core = useCore();
  const c = useCopy(residentCopy);
  const { society } = useSession();
  const invalidate = useInvalidate();
  const { guest, guard, sheet } = useGuestGate();
  const run = useRun(params.run);
  const fromZone = run.data?.fromZone;
  const shops = useRouteShops(fromZone);
  const [name, setName] = useState('');
  const [cat, setCat] = useState<ShopCategory>('grocery');
  const [where, setWhere] = useState<'route' | 'home'>('route');
  const zone = where === 'route' && fromZone ? fromZone : society.zone6;
  const trimmed = name.trim().replace(/\s+/g, ' ');

  const dup = useMemo(() => {
    const n = norm(trimmed);
    if (n.length < 3) return null;
    return (shops.data ?? []).find((s) => {
      const m = norm(s.nameTag);
      return m.includes(n) || n.includes(m) || m.slice(0, 5) === n.slice(0, 5);
    }) ?? null;
  }, [trimmed, shops.data]);

  const pos = zoneCenter(zone);
  const back = () => (router.canGoBack() ? router.back() : router.replace(params.run ? `/run/${params.run}/shops` : '/home'));

  return (
    <Screen
      title={c.addShop.title}
      footer={
        guest ? (
          <Button label={c.addShop.save} onPress={guard(() => undefined)} />
        ) : (
          <SaveButton
            label={c.addShop.save}
            savedLabel={c.addShop.saved}
            disabled={trimmed.length < 2}
            onSave={() => core.listShop({ zone, category: cat, nameTag: trimmed.slice(0, 40) })}
            onDone={(res) => {
              if (params.run) setDraft({ runKey: params.run, shopKey: res.key });
              void invalidate();
              back();
            }}
          />
        )
      }>
      <Field label={c.addShop.name} value={name} onChangeText={setName} placeholder={c.addShop.namePh} maxLength={40} autoCapitalize="words" onFocus={guard(() => undefined)} />
      {dup ? (
        <View accessibilityRole="alert" className="flex-row items-start gap-2.5 rounded-block border-2 border-yellow bg-surface px-3.5 py-3">
          <Icon as={AlertTriangle} size={20} className="mt-0.5 text-yellow" />
          <View className="flex-1 gap-0.5">
            <Text className="text-[15px] leading-[21px]">{fill(c.addShop.dup, { name: dup.nameTag })}</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/shop/${dup.key}`)} hitSlop={8}>
              <Text className="text-[15px] font-bold text-yellow underline" style={{ textDecorationLine: 'underline' }}>
                {c.addShop.dupLink}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View className="gap-2">
        <Text className="text-[14px] font-semibold">{c.addShop.category}</Text>
        <ChipRow>
          {CATEGORIES.map((k) => (
            <Chip key={k} label={c.shops.cat[k]} selected={cat === k} onPress={() => setCat(k)} />
          ))}
        </ChipRow>
      </View>
      <View className="gap-2">
        <Text className="text-[14px] font-semibold">{c.addShop.where}</Text>
        {fromZone && fromZone !== society.zone6 ? (
          <Segmented
            size="sm"
            options={[
              { id: 'route', label: fill(c.addShop.onRoute, { place: placeName(fromZone) }) },
              { id: 'home', label: fill(c.addShop.nearHome, { society: society.name }) },
            ]}
            value={where}
            onChange={setWhere}
          />
        ) : null}
        <View className="h-[180px] overflow-hidden rounded-block border-2 border-edge">
          <MapView
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            society={{ pos: society.gate, label: fill(c.home.gate, { society: society.name }) }}
            shops={[{ id: 'new', pos, category: cat, name: trimmed || c.addShop.namePh, selected: true }]}
            fit={[pos]}
            fitKey={zone}
            padding={{ top: 24, bottom: 24, left: 24, right: 24 }}
          />
        </View>
        <Text className="text-[14px] text-muted">{c.addShop.mapHint}</Text>
      </View>
      <View className="flex-row items-start gap-2.5">
        <Icon as={Clock} size={18} className="mt-0.5 text-muted" />
        <Text className="flex-1 text-[15px] leading-[21px] text-muted">{c.addShop.note}</Text>
      </View>
      {sheet}
    </Screen>
  );
}
