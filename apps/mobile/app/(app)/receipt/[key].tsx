/**
 * D5 Receipt and Verified record. `key` may be a receipt key or a request key (B8/D2 link with the
 * request): resolved through inspect → request → delivery → the rider's receipts. The Verified record
 * says in plain words why the receipt is trustworthy; record IDs only under Advanced.
 */
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ExternalLink, X } from 'lucide-react-native';
import type { DeliveryVerification, EntityInspection, EntityKey, Request, VerifiedReceipt } from '@bhaiya-please/core';
import { Animated, FadeIn, Icon, Poster, ReceiptCard, Screen, SkeletonCards, Text, TextButton, useReducedMotion } from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useCore, useSession } from '@/components/providers';
import { aliasFor } from '@/lib/alias';
import { copyText } from '@/lib/clipboard';
import { monthYear } from '@/lib/format';
import { fill, useCopy } from '@/lib/i18n';
import { placeName } from '@/lib/societies';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';

interface Resolved {
  vr: VerifiedReceipt | null;
  request: Request | null;
  verification: DeliveryVerification | null;
  inspection: EntityInspection | null;
}

function useResolvedReceipt(key: string) {
  const core = useCore();
  const { address } = useSession();
  return useQuery<Resolved>({
    queryKey: [address, 'receiptResolve', key],
    staleTime: 30_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      const k = key as EntityKey;
      const first = await core.inspect(k).catch(() => null);
      let vr: VerifiedReceipt | null = null;
      let request: Request | null = null;
      if (first?.type === 'receipt') {
        const list = await core.getReceiptsFor(first.owner);
        vr = list.find((r) => r.receipt.key === k) ?? null;
      } else {
        const delivery = await core.getDeliveryForRequest(k).catch(() => null);
        request = await core.getRequest(k).catch(() => null);
        if (delivery) {
          const list = await core.getReceiptsFor(delivery.rider);
          vr = list.find((r) => r.receipt.delivery === delivery.key) ?? null;
        }
      }
      if (!vr) return { vr: null, request, verification: null, inspection: null };
      const [verification, inspection] = await Promise.all([
        core.verifyDelivery(vr.receipt.delivery).catch(() => null),
        first?.type === 'receipt' ? first : core.inspect(vr.receipt.key).catch(() => null),
      ]);
      return { vr, request: request ?? verification?.request ?? null, verification, inspection };
    },
  });
}

function Tick({ ok, text }: { ok: boolean | null; text: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      {ok === null ? <View className="h-5 w-5 rounded-pill border-2 border-dashed border-muted" /> : <Icon as={ok ? Check : X} size={20} strokeWidth={3} className={ok ? 'text-go' : 'text-mirchi'} />}
      <Text className={cn('flex-1 text-[16px] leading-[22px]', ok === false && 'text-mirchi')}>{text}</Text>
    </View>
  );
}

function Advanced({ inspection, receiptKey }: { inspection: EntityInspection | null; receiptKey: string }) {
  const c = useCopy(sharedCopy).receipt;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const row = (label: string, value: string) => (
    <Pressable onPress={() => copyText(value, `${label} copied`)} accessibilityRole="button" accessibilityLabel={`${label}. Copy`} className="gap-0.5 py-1 active:opacity-70">
      <Text className="text-[13px] font-semibold text-muted">{label}</Text>
      <Text selectable className="text-[14px] leading-[19px] text-fg" style={{ fontFamily: 'monospace' }}>
        {value}
      </Text>
    </Pressable>
  );
  return (
    <View className="border-t-2 border-line pt-1.5">
      <Pressable onPress={() => setOpen((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="min-h-[44px] flex-row items-center justify-between active:opacity-70">
        <Text className="text-[16px] font-bold">{c.advanced}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon as={ChevronDown} size={20} />
        </View>
      </Pressable>
      {open ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(150)} className="gap-1.5 pb-1">
          {row(c.recordId, inspection?.key ?? receiptKey)}
          {inspection ? row(c.creator, inspection.creator) : null}
          {inspection ? row(c.owner, inspection.owner) : null}
          {inspection?.explorerUrl ? <TextButton label={c.explorer} tone="yellow" icon={ExternalLink} onPress={() => Linking.openURL(inspection.explorerUrl!)} /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function ReceiptScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const c = useCopy(sharedCopy);
  const q = useResolvedReceipt(String(key));
  const d = q.data;
  if (q.isLoading) {
    return (
      <Screen title={c.receipt.title}>
        <SkeletonCards n={2} />
      </Screen>
    );
  }
  if (!d?.vr) {
    return (
      <Screen title={c.receipt.title}>
        <Poster kicker={c.system.kicker} title={c.receipt.notFound} body={c.receipt.notFoundBody} action={{ label: c.detail.goBack, onPress: () => (router.canGoBack() ? router.back() : router.replace('/activity')) }} />
      </Screen>
    );
  }
  const r = d.vr.receipt;
  const matched = d.verification ? d.verification.valid && d.vr.valid : d.vr.valid ? null : false;
  return (
    <Screen title={c.receipt.title}>
      <Rise index={0}>
        <ReceiptCard from={r.creator} to={r.owner} at={r.at || r.createdAt} items={d.request?.items} tags={r.tags} place={placeName(r.zone)} animateStamp={r.key} />
      </Rise>
      <Rise index={1}>
        <View className="gap-3 rounded-block border-2 border-paper bg-raised p-4">
          <Text className="text-[19px] font-extrabold">{c.receipt.verified}</Text>
          <View className="gap-2.5">
            <Tick ok text={fill(c.receipt.written, { name: aliasFor(r.creator) })} />
            <Tick ok text={fill(c.receipt.owned, { name: aliasFor(r.owner) })} />
            <Tick ok={r.readonly !== false} text={c.receipt.locked} />
            <Tick ok text={fill(c.receipt.validUntil, { month: monthYear(r.expiresAt) })} />
            <Tick ok={matched} text={matched === null ? c.receipt.checking : matched ? c.receipt.matched : c.receipt.notMatched} />
          </View>
          <Advanced inspection={d.inspection} receiptKey={r.key} />
        </View>
      </Rise>
    </Screen>
  );
}
