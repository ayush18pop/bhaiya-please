import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, X, Lock } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { AliasChip } from '@/components/AliasChip';
import { ArkivNote } from '@/components/ArkivNote';
import { EmptyState, Page } from '@/components/Bits';
import { PriceStepper } from '@/components/PriceStepper';
import { runPhase } from '@/components/RunCard';
import { TierBadge } from '@/components/TierBadge';
import { TxButton } from '@/components/TxButton';
import { useCore } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useProfile, useRun } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { fmt, rupees } from '@/lib/format';
import { saveSecret } from '@/lib/handoff';
import { S } from '@/lib/strings';
import { cn } from '@/lib/utils';

const TIPS = [10, 20, 30];

export default function RequestForm() {
  const { run: runKey, shop: shopKey } = useLocalSearchParams<{ run: string; shop: string }>();
  const router = useRouter();
  const core = useCore();
  const now = useNow();
  const run = useRun(runKey);
  const profile = useProfile(run.data?.creator);
  const shop = useQuery({ queryKey: ['shop', shopKey], queryFn: () => core.getShop(shopKey as `0x${string}`), enabled: !!shopKey });

  const [items, setItems] = useState(['']);
  const [price, setPrice] = useState(150);
  const [tip, setTip] = useState(20);
  const [customTip, setCustomTip] = useState(false);

  const r = run.data;
  const cap = profile.data?.tier.priceCap ?? 200;
  const maxPrice = Math.min(price, cap);
  const ended = !r || runPhase(r, now) === 'ended';
  const full = !!r && r.capacityLeft <= 0;
  const cleaned = items.map((i) => i.trim()).filter(Boolean);
  const valid = cleaned.length >= 1 && !!profile.data && !ended && !full;

  if (!run.isLoading && !r)
    return (
      <Page>
        <EmptyState title={S.request.ended}>
          <Button variant="outline" onPress={() => router.replace('/r')}>
            <Text>{S.request.seeOtherRuns}</Text>
          </Button>
        </EmptyState>
      </Page>
    );

  const setItem = (i: number, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? v : x)));

  return (
    <Page
      footer={
        <>
          <TxButton
            size="lg"
            disabled={!valid}
            labels={{ idle: S.request.send, pending: S.common.sending, done: S.common.done }}
            onTx={async () => {
              const res = await core.postRequest({ runKey: runKey as `0x${string}`, shopKey: shopKey as `0x${string}`, items: cleaned, maxPrice, tip });
              saveSecret(res.secret); // device-local; the QR is built from this later
              return res;
            }}
            onDone={(res) => router.replace(`/r/request/${res.key}`)}
          />
          <View className="flex-row items-center justify-center gap-1.5">
            <Icon as={Lock} size={12} className="text-muted-foreground" />
            <Text variant="caption">{S.request.locked}</Text>
          </View>
        </>
      }>
      {(ended || full) && (
        <View className="gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <Text className="font-semibold text-destructive">{full ? S.request.full : S.request.ended}</Text>
          <Button size="sm" variant="outline" onPress={() => router.replace('/r')}>
            <Text>{S.request.seeOtherRuns}</Text>
          </Button>
        </View>
      )}

      <View className="gap-1.5">
        <Text variant="muted">From <Text className="font-bold">{shop.data?.nameTag ?? '…'}</Text> · via</Text>
        {r ? <AliasChip address={r.creator} /> : null}
        {profile.data ? <View className="flex-row"><TierBadge tier={profile.data.tier} showCap /></View> : null}
      </View>

      <View className="gap-2">
        <Text variant="h3">{S.request.items}</Text>
        {items.map((it, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input value={it} onChangeText={(v) => setItem(i, v)} maxLength={140} placeholder={S.request.itemPlaceholder} accessibilityLabel={`Item ${i + 1}`} />
            </View>
            {items.length > 1 && (
              <Pressable onPress={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="h-11 w-11 items-center justify-center" accessibilityLabel="Remove item">
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            )}
          </View>
        ))}
        {items.length < 3 && (
          <Button variant="ghost" size="sm" className="self-start" onPress={() => setItems((xs) => [...xs, ''])}>
            <Icon as={Plus} size={16} />
            <Text>{S.request.addItem}</Text>
          </Button>
        )}
        <Text variant="caption">{S.safety.noPersonal}</Text>
      </View>

      <View className="gap-2">
        <Text variant="h3">{S.request.maxPrice}</Text>
        <PriceStepper value={maxPrice} cap={cap} onChange={setPrice} />
        <Text variant="caption" className={cn(maxPrice >= cap && 'font-semibold text-warning-foreground')}>
          {maxPrice >= cap ? fmt(S.request.capHint, { cap: rupees(cap) }) : fmt(S.request.capLine, { cap: rupees(cap), tier: profile.data ? S.tiers[profile.data.tier.name] : '…' })}
        </Text>
      </View>

      <View className="gap-2">
        <Text variant="h3">{S.request.tip}</Text>
        <View className="flex-row flex-wrap gap-2">
          {TIPS.map((t) => (
            <Button key={t} size="sm" variant={!customTip && tip === t ? 'default' : 'outline'} onPress={() => { setCustomTip(false); setTip(t); }}>
              <Text>{rupees(t)}</Text>
            </Button>
          ))}
          <Button size="sm" variant={customTip ? 'default' : 'outline'} onPress={() => setCustomTip(true)}>
            <Text>Other</Text>
          </Button>
        </View>
        {customTip && <PriceStepper value={tip} min={0} cap={100} step={5} onChange={setTip} />}
      </View>

      <Text variant="muted">{S.request.upiNote}</Text>
      <ArkivNote text={S.arkiv.expiry} />
    </Page>
  );
}
