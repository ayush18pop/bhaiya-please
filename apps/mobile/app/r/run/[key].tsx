import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArkivNote } from '@/components/ArkivNote';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { RunCard, runPhase } from '@/components/RunCard';
import { ShopRow } from '@/components/ShopRow';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useRun, useShops } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { fmt } from '@/lib/format';
import { S } from '@/lib/strings';

export default function RunDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const now = useNow();
  const run = useRun(key);
  const shops = useShops(run.data?.fromZone.slice(0, 5));
  const [sel, setSel] = useState<string | null>(null);

  const r = run.data;
  const ended = !!r && runPhase(r, now) === 'ended';
  const list = shops.data ?? [];
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
      {r ? <RunCard run={r} showFrom={false} /> : <SkeletonCards n={1} />}
      <Text variant="h3">{S.shops.title}</Text>
      {shops.isLoading && !shops.data ? (
        <SkeletonCards />
      ) : list.length === 0 ? (
        <EmptyState title={S.shops.empty} />
      ) : (
        <View className="gap-3">
          {list.map((s) => (
            <ShopRow key={s.key} shop={s} selected={s.key === sel} onSelect={() => setSel(s.key)} />
          ))}
        </View>
      )}
      <ArkivNote text={S.shops.note} explainer="A shop is a record with a 30-day expiry that any wallet is allowed to extend. If neighbours keep tapping Still open, it stays. If nobody does, it disappears." />
    </Page>
  );
}
