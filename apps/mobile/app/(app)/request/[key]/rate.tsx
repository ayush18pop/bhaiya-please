/**
 * B10 Rate the handoff. Give receipt → signature moment (Motion board): the receipt prints down from a
 * slot, HANDED OVER thumps, it shrinks and flies to the runner whose handoff meter rolls +1. Then the
 * receipt state (B10-Receipt) with a crowd raising hands once.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, ReceiptText, ShieldCheck } from 'lucide-react-native';
import type { ReceiptTag } from '@bhaiya-please/core';
import {
  Alert, Animated, Avatar, Button, Chip, Crowd, DashRule, Easing, Footer, Icon, IconButton, ListRow, Meter, ReceiptCard, SaveButton, SkeletonCards, Stamp, tagLabel, Text, TextButton,
  useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming, EASE,
} from '@/components/bp';
import { useCore, useSession } from '@/components/providers';
import { useProfile, useRequestStatus } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { appEvent } from '@/lib/events';
import { logActivity } from '@/lib/history';
import { fill, useCopy, useT } from '@/lib/i18n';
import { residentCopy } from '@/screens/resident/copy';
import { useInvalidate, Rise } from '@/screens/resident/parts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/lib/utils';

const TAGS: ReceiptTag[] = ['on_time', 'exact_item', 'polite', 'good_price', 'careful_packing'];
const clock = (unix: number) => new Date(unix * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Black printer slot the paper comes out of. */
function Slot() {
  return <View className="absolute -left-1 -right-1 top-0 z-10 h-3.5 rounded-plate border-2 border-paper bg-ink" />;
}

/** Phase 1: print (250 ms) → stamp (≈120 ms later) → fly to avatar and shrink (200 ms) → meter +1. */
function PrintFly({ from, to, items, tags, count, onDone }: { from: string; to: string; items: string[]; tags: ReceiptTag[]; count: number; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(count);
  const [h, setH] = useState(0);
  const y = useSharedValue(-1);
  const fly = useSharedValue(0);
  useEffect(() => {
    if (!h) return;
    if (reduce) {
      y.value = 0;
      const a = setTimeout(() => setShown(count + 1), 200);
      const b = setTimeout(onDone, 900);
      return () => (clearTimeout(a), clearTimeout(b));
    }
    y.value = withTiming(0, { duration: 252, easing: EASE });
    fly.value = withDelay(504, withTiming(1, { duration: 196, easing: Easing.in(Easing.quad) }));
    const a = setTimeout(() => setShown(count + 1), 650);
    const b = setTimeout(onDone, 1500);
    return () => (clearTimeout(a), clearTimeout(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h]);
  const paper = useAnimatedStyle(() =>
    reduce
      ? { opacity: withTiming(fly.value ? 0 : 1) }
      : { opacity: 1 - fly.value, transform: [{ translateY: y.value * h + fly.value * -30 }, { translateX: fly.value * 210 }, { scale: 1 - fly.value * 0.88 }] },
  );
  const ring = useSharedValue(1);
  useEffect(() => {
    if (shown === count || reduce) return;
    ring.value = withSequence(withTiming(1.12, { duration: 120 }), withTiming(1, { duration: 200 }));
  }, [shown, count, reduce, ring]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: ring.value }] }));
  return (
    <View className="flex-row gap-4 pt-4" aria-hidden>
      <View className="relative flex-1" style={{ height: 280 }}>
        <Slot />
        <View className="absolute bottom-0 left-2.5 right-2.5 top-2.5 overflow-visible">
          <View style={{ overflow: 'hidden' }}>
            <Animated.View style={paper} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
              <View className="gap-2 border-2 border-ink bg-paper px-4 py-4">
                <Text className="font-display text-[16px] text-ink">Receipt</Text>
                <DashRule />
                <Text className="text-[14px] font-bold text-ink">
                  {aliasFor(from)} → {aliasFor(to)}
                </Text>
                <Text className="text-[13px] text-ink">{items.join(' · ')}</Text>
                <Text className="text-[13px] font-bold text-ink">{tags.length ? tags.map(tagLabel).join(' · ') : 'Handed over'}</Text>
                <DashRule />
                <Text className="text-[12px] text-ink">{new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
                <View pointerEvents="none" style={{ position: 'absolute', right: 6, bottom: 6 }}>
                  {h ? <Stamp check color={C.cng} size={86} animate={h} delay={reduce ? 0 : 300} /> : null}
                </View>
              </View>
            </Animated.View>
          </View>
        </View>
      </View>
      <View className="w-[110px] items-center gap-2 pt-2">
        <Animated.View style={pop}>
          <Avatar seed={to} size={72} ring="yellow" />
        </Animated.View>
        <Text numberOfLines={1} className="text-[15px] font-bold">
          {aliasFor(to)}
        </Text>
        <Meter value={shown} size="sm" label={`${shown} handoffs`} />
        <Text className="text-[13px] text-muted">handoffs</Text>
      </View>
    </View>
  );
}

/** Crowd raises hands once (decorative). */
function Cheer() {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withDelay(700, withSequence(withTiming(-14, { duration: 170, easing: EASE }), withTiming(0, { duration: 250, easing: EASE })));
  }, [reduce, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View aria-hidden pointerEvents="none" style={[{ position: 'absolute', left: -24, right: -24, bottom: -18, alignItems: 'center' }, a]}>
      <Crowd seeds={['p5', 'p16', 'p3', 'p9', 'p7', 'p21']} size={96} accentIndex={2} tone="night" />
    </Animated.View>
  );
}

/** Receipt printing from the slot (360 ms), stamp thumps after. */
function PrintedReceipt(props: React.ComponentProps<typeof ReceiptCard> & { animate: boolean }) {
  const reduce = useReducedMotion();
  const [h, setH] = useState(0);
  const y = useSharedValue(props.animate && !reduce ? -1 : 0);
  const o = useSharedValue(props.animate && reduce ? 0 : 1);
  useEffect(() => {
    if (!h || !props.animate) return;
    y.value = withTiming(0, { duration: 360, easing: EASE });
    o.value = withTiming(1, { duration: 150 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value * h }] }));
  return (
    <View className="relative pt-2.5">
      <Slot />
      <View style={{ overflow: 'hidden', paddingHorizontal: 6 }}>
        <Animated.View style={a} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
          <ReceiptCard {...props} animateStamp={props.animate ? 'print' : undefined} />
        </Animated.View>
      </View>
    </View>
  );
}

export default function Rate() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const core = useCore();
  const t = useT();
  const c = useCopy(residentCopy);
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidate();
  const { address, prefs, society } = useSession();
  const q = useRequestStatus(key);
  const s = q.data;
  const rider = s?.delivery?.rider ?? s?.accept?.rider ?? null;
  const profile = useProfile(rider);
  const [tags, setTags] = useState<ReceiptTag[]>([]);
  const [phase, setPhase] = useState<'form' | 'fly' | 'done'>('form');
  const [givenAt, setGivenAt] = useState(0);
  const [baseCount, setBaseCount] = useState(0);
  const [giving, setGiving] = useState(false);
  const name = aliasFor(rider);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/request/${key}`));

  if (!s && q.isLoading)
    return (
      <View className="flex-1 bg-bg p-4" style={{ paddingTop: insets.top + 16 }}>
        <SkeletonCards n={1} />
      </View>
    );

  const wrap = (body: React.ReactNode, footer?: React.ReactNode, top = true) => (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      {top ? (
        <View className="min-h-[56px] flex-row items-center gap-1 px-1.5">
          <IconButton icon={ChevronLeft} label={c.common.back} onPress={goBack} />
          {s?.delivery ? (
            <View className="flex-row items-center gap-1.5">
              <Icon as={Check} size={18} strokeWidth={3} className="text-go" />
              <Text className="text-[16px] font-bold text-go">{fill(c.rate.handedAt, { time: clock(s.delivery.createdAt) })}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View className="flex-1 overflow-hidden">{body}</View>
      {footer ? <Footer>{footer}</Footer> : null}
    </View>
  );

  if (!s?.delivery)
    return wrap(
      <View className="p-4">
        <Alert tone="info" title={c.rate.notYet} body={fill(c.rate.notYetBody, { name })} actions={<Button label={c.common.back} variant="secondary" size="md" onPress={goBack} />} />
      </View>,
    );

  const delivery = s.delivery;
  const receiptAt = s.receipt?.createdAt ?? givenAt;
  const shownTags = s.receipt?.tags ?? tags;

  if (phase === 'fly')
    return wrap(
      <View className="px-4">
        <Text variant="title" className="pt-2">
          {fill(t('receipt.title'), { name })}
        </Text>
        <PrintFly from={address ?? delivery.resident} to={delivery.rider} items={s.request?.items ?? []} tags={tags} count={baseCount} onDone={() => setPhase('done')} />
      </View>,
      undefined,
      false,
    );

  if (phase === 'done' || (s.receipt && !giving)) {
    const fresh = phase === 'done';
    return wrap(
      <View className="flex-1 gap-4 px-4 pt-6">
        <Rise index={0} className="gap-1.5">
          <Text variant="display">{fresh ? c.rate.given : fill(c.rate.already, { name })}</Text>
          {fresh ? <Text className="font-hindi text-[24px] leading-[28px] text-mirchi">{c.rate.thanks}</Text> : null}
        </Rise>
        <PrintedReceipt from={delivery.resident} to={delivery.rider} at={receiptAt || delivery.createdAt} items={s.request?.items} tags={shownTags} place={`${society.name} main gate`} animate={fresh} />
        {address && !prefs.backedUp[address] ? (
          <Rise index={2} className="overflow-hidden rounded-block border-2 border-line bg-surface">
            <ListRow icon={ShieldCheck} label={c.rate.backup} hint={c.rate.backupBody} onPress={() => router.push('/backup')} right={null} last />
          </Rise>
        ) : null}
        {s.receipt ? <TextButton label={c.track.record} onPress={() => router.push(`/receipt/${s.receipt!.key}`)} /> : null}
        {fresh ? <Cheer /> : null}
      </View>,
      <Button label={c.common.done} onPress={() => router.replace('/home')} />,
      !fresh,
    );
  }

  return wrap(
    <View className="items-center gap-4 px-4 pt-4">
      <Rise index={0}>
        <Avatar seed={delivery.rider} size={104} />
      </Rise>
      <Rise index={1} className="items-center gap-1">
        <Text variant="title" className="text-center">
          {fill(t('receipt.title'), { name })}
        </Text>
        <Text className="text-center text-[15px] text-muted">{c.rate.pick}</Text>
      </Rise>
      <Rise index={2} className="flex-row flex-wrap justify-center gap-2.5">
        {TAGS.map((tag) => (
          <Chip key={tag} label={tagLabel(tag)} check selected={tags.includes(tag)} onPress={() => setTags((x) => (x.includes(tag) ? x.filter((y) => y !== tag) : [...x, tag]))} />
        ))}
      </Rise>
      <Rise index={3} className="w-full flex-row items-start gap-3 rounded-block border-2 border-line bg-surface px-4 py-3.5">
        <Icon as={ReceiptText} size={22} className="text-go" />
        <Text className="flex-1 text-[15px] leading-[21px]">{fill(t('receipt.line'), { name })}</Text>
      </Rise>
    </View>,
    <>
      <SaveButton
        label={t('receipt.give')}
        doneDelay={250}
        onSave={async () => {
          setBaseCount(profile.data?.receiptsTotal ?? 0);
          setGiving(true);
          const res = await core.issueReceipt({ deliveryKey: delivery.key, tags });
          setGivenAt(Math.floor(Date.now() / 1000));
          logActivity({ kind: 'request', key, outcome: 'rated' });
          appEvent('receipt.given');
          return res;
        }}
        onError={() => setGiving(false)}
        onDone={() => {
          setPhase('fly');
          void invalidate();
        }}
      />
      <TextButton label={c.rate.wrong} onPress={() => router.push(`/request/${key}/report`)} className="self-center" />
    </>,
  );
}

