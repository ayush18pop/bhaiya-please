/** B6 What do you need? Items (1–3), max price capped by the runner's level, tip. Kept in the draft. */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Button, Chip, Field, Meter, PrivacyLine, Screen, Stepper, Text } from '@/components/bp';
import { useProfile, useRun, useShop } from '@/hooks/queries';
import { ReadProblem } from '@/components/shell/ReadProblem';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { setDraft, useDraft } from '@/lib/draft';
import { fill, useCopy, useT } from '@/lib/i18n';
import { levelLabel } from '@/components/bp';
import { residentCopy } from '@/screens/resident/copy';
import { minsTo, runOpen, ViaLine, Rise } from '@/screens/resident/parts';

const TIPS = [10, 20, 30];

export default function Ask() {
  const params = useLocalSearchParams<{ run?: string; shop?: string }>();
  const router = useRouter();
  const t = useT();
  const c = useCopy(residentCopy);
  const now = useNow();
  const draft = useDraft();
  const runKey = params.run ?? draft.runKey ?? undefined;
  const shopKey = params.shop ?? draft.shopKey ?? undefined;
  const run = useRun(runKey);
  const shop = useShop(shopKey);
  const r = run.data;
  const profile = useProfile(r?.creator);
  const tier = profile.data?.tier;
  const cap = tier?.priceCap ?? 200;
  const name = r ? aliasFor(r.creator) : '';
  const [otherTip, setOtherTip] = useState(!TIPS.includes(draft.tip));

  useEffect(() => {
    if (runKey && shopKey && (draft.runKey !== runKey || draft.shopKey !== shopKey)) setDraft({ runKey, shopKey });
  }, [runKey, shopKey, draft.runKey, draft.shopKey]);
  useEffect(() => {
    if (tier && draft.maxPrice > cap) setDraft({ maxPrice: cap });
  }, [tier, cap, draft.maxPrice]);

  const items = [0, 1, 2].map((i) => draft.items[i] ?? '');
  const setItem = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    setDraft({ items: next });
  };
  const pick = (label: string) => {
    const i = items.findIndex((x) => !x.trim());
    if (i >= 0) setItem(i, label);
  };
  const filled = items.filter((x) => x.trim()).length;
  const missing = run.isSuccess && !r;
  const closed = missing || (!!r && !runOpen(r, now));
  const mins = r ? minsTo(r.eta, now) : 0;
  const atCap = draft.maxPrice >= cap;

  const footer = (
    <Button label={t('request.review')} disabled={closed || filled === 0 || !shop.data || !tier} onPress={() => router.push('/ask/review')} />
  );

  return (
    <Screen title={t('request.title')} footer={footer}>
      <Rise index={0}>
        <View className="flex-row items-center justify-between gap-3 rounded-block border-2 border-ink bg-paper px-3 py-2.5">
          <View className="flex-shrink gap-0.5">
            <Text numberOfLines={1} className="font-display text-[15px] text-ink">
              {fill(c.ask.from, { shop: shop.data?.nameTag ?? '…' })}
            </Text>
            <ViaLine name={name || '…'} level={tier?.name} onPaper prefix={c.ask.via} />
          </View>
          <Meter value={closed ? '--' : mins} unit={c.common.min} size="sm" border="ink" label={`Arriving in ${mins} minutes`} />
        </View>
      </Rise>
      <Rise index={1} className="gap-2.5">
        {items.map((v, i) => (
          <Field
            key={i}
            label={fill(i === 0 ? c.ask.item : c.ask.itemOptional, { n: i + 1 })}
            value={v}
            onChangeText={(x) => setItem(i, x)}
            placeholder={c.ask.phs[i]}
            maxLength={60}
            returnKeyType="next"
          />
        ))}
      </Rise>
      {run.isError && !r ? <ReadProblem error={run.error} /> : null}
      {closed ? (
        <Alert
          tone="expired"
          title={fill(r && r.capacityLeft <= 0 ? c.ask.full : c.ask.ended, { name: name || 'The runner' })}
          actions={<Button label={t('expired.sendOther')} size="md" onPress={() => router.replace('/home')} />}
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }} contentContainerClassName="gap-2 px-4" className="-mx-4">
          {c.ask.picks.map((p) => (
            <Chip key={p} label={`+ ${p}`} disabled={filled >= 3} onPress={() => pick(p)} />
          ))}
        </ScrollView>
      )}
      <Rise index={2} className="gap-2">
        <Text className="text-[14px] font-semibold">{t('request.maxPrice')}</Text>
        <Stepper value={Math.min(draft.maxPrice, cap)} onChange={(v) => setDraft({ maxPrice: v })} min={20} max={cap} step={10} prefix="₹" label={t('request.maxPrice')} />
        <Text accessibilityLiveRegion="polite" className={atCap ? 'text-[14px] font-semibold text-yellow' : 'text-[14px] font-semibold text-muted'}>
          {atCap && tier ? fill(c.ask.atCap, { name, level: levelLabel(tier.name) }) : t('request.capHint', { name: name || '…', cap })}
        </Text>
      </Rise>
      <Rise index={3} className="gap-2">
        <Text className="text-[14px] font-semibold">{fill(c.ask.tipFor, { name: name || '…' })}</Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
          {TIPS.map((v) => (
            <Chip
              key={v}
              label={`₹${v}`}
              selected={!otherTip && draft.tip === v}
              onPress={() => {
                setOtherTip(false);
                setDraft({ tip: v });
              }}
            />
          ))}
          <Chip label={c.ask.other} selected={otherTip} onPress={() => setOtherTip(true)} />
        </View>
        {otherTip ? (
          <Rise from="fade">
            <Stepper value={draft.tip} onChange={(v) => setDraft({ tip: v })} min={0} max={200} step={5} prefix="₹" label={c.ask.otherTip} />
          </Rise>
        ) : null}
      </Rise>
      <PrivacyLine text={t('privacy.request')} />
    </Screen>
  );
}
