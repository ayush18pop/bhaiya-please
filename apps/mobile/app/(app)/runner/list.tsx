/** C6 Shopping list: accepted items grouped by shop as a checklist (ticks stay on this phone). */
import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, CheckRow, Empty, Meter, Screen, SkeletonCards, Text } from '@/components/bp';
import { useShop } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { rupees } from '@/lib/format';
import { fill, useCopy } from '@/lib/i18n';
import { runnerCopy } from '@/screens/runner/copy';
import { DirectionsButton, SunButton, useActiveRun, Rise } from '@/screens/runner/parts';
import { getList, getSeen, setList, tickId, toggleTick, useRunnerStore, type SeenRequest } from '@/screens/runner/store';

interface Line {
  id: string;
  item: string;
  who: string;
  cancelled?: boolean;
}

export default function ShoppingList() {
  const router = useRouter();
  const c = useCopy(runnerCopy);
  const a = useActiveRun();
  useRunnerStore();
  const run = a.run;
  const ticks = run ? getList(run.key).ticks : {};

  const groups = useMemo(() => {
    if (!run) return [];
    const by = new Map<string, { shop: string; lines: Line[]; reqs: SeenRequest[] }>();
    const add = (r: SeenRequest, cancelled: boolean) => {
      const g = by.get(r.shop) ?? { shop: r.shop, lines: [], reqs: [] };
      r.items.forEach((item, i) => g.lines.push({ id: tickId(r.key, i), item, who: r.resident, cancelled }));
      if (!cancelled) g.reqs.push(r);
      by.set(r.shop, g);
    };
    for (const row of a.waiting) {
      const r = row.request;
      add({ key: r.key, resident: r.creator, items: r.items, shop: r.shop, maxPrice: r.maxPrice, tip: r.tip }, false);
    }
    // Accepted earlier on this phone but gone from the run now (withdrawn / expired) → struck through.
    const live = new Set<string>(a.rows.map((r) => r.request.key));
    for (const s of Object.values(getSeen(run.key))) if (!live.has(s.key)) add(s, true);
    return [...by.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.key, a.waiting, a.rows]);

  const active = groups.flatMap((g) => g.lines.filter((l) => !l.cancelled));
  const done = active.filter((l) => ticks[l.id]).length;
  const total = a.waiting.reduce((s, r) => s + r.request.maxPrice + r.request.tip, 0);

  return (
    <Screen
      runner
      title={c.list.title}
      right={
        <View className="flex-row items-center gap-2 pr-1.5">
          {active.length ? <Text className="text-[15px] font-bold text-muted">{fill(c.list.count, { done, total: active.length })}</Text> : null}
          <SunButton />
        </View>
      }
      footer={
        a.waiting.length ? (
          <>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-[17px] font-bold">{c.list.total}</Text>
              <Meter value={total} prefix={c.list.upToShort} tone="money" size="lg" label={`Up to ${rupees(total)}`} />
            </View>
            <Button
              label={c.list.done}
              size="xl"
              onPress={() => {
                if (run) setList(run.key, { done: true });
                router.replace('/runner/gate');
              }}
            />
          </>
        ) : undefined
      }>
      {a.board.isLoading && !a.board.data ? (
        <SkeletonCards n={2} kind="row" />
      ) : !groups.length ? (
        <Empty title={c.list.empty} body={c.list.emptyBody} action={{ label: 'Back to my run', onPress: () => router.replace('/home') }} />
      ) : (
        <>
          {groups.map((g, i) => (
            <Rise key={g.shop} index={i}>
              <ShopGroup shopKey={g.shop} lines={g.lines} ticks={ticks} onToggle={(id) => run && toggleTick(run.key, id)} />
            </Rise>
          ))}
          {groups.some((g) => g.lines.some((l) => l.cancelled)) ? <Text className="text-[14px] font-semibold text-muted">{c.list.cancelled}</Text> : null}
          <Rise index={groups.length} className="gap-1 rounded-block border-2 border-line bg-surface px-4 py-3">
            <Text className="text-[15px] font-bold">{c.list.maxTitle}</Text>
            <Text className="text-[14px] leading-[20px] text-muted">
              {fill(c.list.maxLine, { list: a.waiting.map((r) => fill(c.list.upTo, { name: aliasFor(r.request.creator), price: rupees(r.request.maxPrice) })).join(' · ') })}
            </Text>
          </Rise>
        </>
      )}
    </Screen>
  );
}

function ShopGroup({ shopKey, lines, ticks, onToggle }: { shopKey: string; lines: Line[]; ticks: Record<string, boolean>; onToggle: (id: string) => void }) {
  const c = useCopy(runnerCopy);
  const shop = useShop(shopKey);
  return (
    <View className="overflow-hidden rounded-block border-2 border-edge bg-surface">
      <View className="m-[3px] flex-row items-center gap-3 rounded-[9px] border-2 border-ink bg-paper py-2.5 pl-3.5 pr-2">
        <Text numberOfLines={1} className="flex-1 font-display text-[18px] text-ink">
          {(shop.data?.nameTag ?? 'Shop').toUpperCase()}
        </Text>
        {shop.data ? <DirectionsButton zone6={shop.data.zone} label={c.request.directions} compact /> : null}
      </View>
      {lines.map((l) =>
        l.cancelled ? (
          <View key={l.id} className="min-h-[56px] justify-center border-t-2 border-line px-4 py-2 opacity-70">
            <Text className="text-[17px] font-bold text-muted line-through" style={{ textDecorationLine: 'line-through' }}>
              {l.item}
            </Text>
            <Text className="text-[13px] text-mirchi">Cancelled · {fill(c.list.for, { name: aliasFor(l.who) })}</Text>
          </View>
        ) : (
          <View key={l.id} className="border-t-2 border-line">
            <CheckRow label={l.item} sub={fill(c.list.for, { name: aliasFor(l.who) })} checked={!!ticks[l.id]} onToggle={() => onToggle(l.id)} last />
          </View>
        ),
      )}
    </View>
  );
}
