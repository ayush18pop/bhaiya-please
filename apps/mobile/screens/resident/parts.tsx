/** Shared pieces of the resident journey (B1–B11). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Info, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import type { Ping, Run, Shop, ShopCategory, TierName } from '@bhaiya-please/core';
import { pingFreshness } from '@bhaiya-please/core/mock';
import {
  Animated, Button, HardShadow, Icon, IconButton, LevelPlate, Peep, Sheet, Text, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
  DUR, EASE, SHEET_SPRING, withDelay,
} from '@/components/bp';
import { CATEGORY_ICON } from '@/components/map/icons';
import { useSession } from '@/components/providers';
import { useShops } from '@/hooks/queries';
import { fill, useCopy } from '@/lib/i18n';
import { C, cn } from '@/lib/utils';
import { residentCopy } from './copy';

export const CATEGORIES: ShopCategory[] = ['grocery', 'bakery', 'pharmacy_otc', 'stationery', 'household'];
export const SHOP_LIFETIME = 30 * 86400;

export const minsTo = (t: number, now: number) => Math.max(0, Math.ceil((t - now) / 60));

/** Run can still take a request (not full, not past ETA, not ended). */
export function runOpen(run: Run | null | undefined, now: number) {
  return !!run && run.capacityLeft > 0 && now < run.eta && now < run.expiresAt;
}

// ------------------------------------------------------------------ B1 runs that stay until expiry

/**
 * Cards stay until expiry (+3 s grace) even after the query stops returning them past ETA ("at the
 * gate"). A run that vanishes before ETA (filled up or cancelled) stays 4 s marked `gone` ("Full"),
 * then leaves the list.
 */
export function useVisibleRuns(runs: Run[] | undefined, now: number) {
  const seen = useRef(new Map<string, Run>());
  const goneAt = useRef(new Map<string, number>());
  return useMemo(() => {
    if (runs) {
      const returned = new Set<string>(runs.map((r) => r.key));
      runs.forEach((r) => {
        seen.current.set(r.key, r);
        goneAt.current.delete(r.key);
      });
      for (const [k, r] of seen.current) {
        if (!returned.has(k) && now < r.eta && !goneAt.current.has(k)) goneAt.current.set(k, now);
      }
    }
    for (const [k, t] of goneAt.current) {
      if (now - t > 4) {
        seen.current.delete(k);
        goneAt.current.delete(k);
      }
    }
    for (const [k, r] of seen.current) if (now > r.expiresAt + 3) seen.current.delete(k);
    return { runs: [...seen.current.values()].sort((a, b) => a.eta - b.eta), gone: new Set(goneAt.current.keys()) };
  }, [runs, now]);
}

export type CardState = 'live' | 'full' | 'atGate' | 'stale' | 'offline';
export function runCardState(run: Run, ping: Ping | undefined, now: number, online: boolean, gone: boolean): CardState {
  if (gone || run.capacityLeft <= 0) return 'full';
  if (run.atGateAt || now >= run.eta) return 'atGate';
  if (!online) return 'offline';
  if (ping && pingFreshness(ping, now) === 'stale') return 'stale';
  return 'live';
}

// ------------------------------------------------------------------ shops

/** Shops near the society and along the run's start area, deduped. */
export function useRouteShops(fromZone?: string | null) {
  const { society } = useSession();
  const a = useShops(society.zone5);
  const fz = fromZone?.slice(0, 5);
  const b = useShops(fz && fz !== society.zone5 ? fz : undefined);
  const data = useMemo(() => {
    if (!a.data && !b.data) return undefined;
    const m = new Map<string, Shop>();
    [...(a.data ?? []), ...(b.data ?? [])].forEach((s) => m.set(s.key, s));
    return [...m.values()].sort((x, y) => y.expiresAt - x.expiresAt);
  }, [a.data, b.data]);
  return { data, isLoading: a.isLoading && !a.data, isError: a.isError };
}

/** Shops live 30 days from their last confirmation. */
export function shopAge(shop: Shop, now: number) {
  const confirmedAt = shop.expiresAt - SHOP_LIFETIME;
  const confirmedDays = Math.max(0, Math.floor((now - confirmedAt) / 86400));
  const leftDays = Math.max(0, Math.ceil((shop.expiresAt - now) / 86400));
  return { confirmedDays, leftDays, fading: leftDays < 5 };
}

export function useShopMeta() {
  const c = useCopy(residentCopy);
  return (shop: Shop, now: number) => {
    const { confirmedDays, leftDays, fading } = shopAge(shop, now);
    const cat = c.shops.cat[shop.category];
    if (fading) return `${cat} · ${leftDays <= 1 ? c.shops.fadingOne : fill(c.shops.fading, { n: leftDays })}`;
    const when = confirmedDays === 0 ? c.shops.today : confirmedDays === 1 ? c.shops.dayAgo : fill(c.shops.daysAgo, { n: confirmedDays });
    return `${cat} · ${fill(c.shops.confirmed, { when })}`;
  };
}

/** Hand-painted shop signboard: listed / fading (dashed) / selected (green, check badge). */
export function ShopBoard({ shop, meta, selected, fading, onPress, onInfo, infoLabel }: { shop: Pick<Shop, 'nameTag' | 'category'>; meta: string; selected?: boolean; fading?: boolean; onPress?: () => void; onInfo?: () => void; infoLabel?: string }) {
  const CatIcon = CATEGORY_ICON[shop.category];
  return (
    <View className="relative">
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} accessibilityLabel={`${shop.nameTag}. ${meta}`} className="active:opacity-90">
        <HardShadow
          shadow={selected ? 'paper' : 'none'}
          depth={6}
          radius={4}
          className={cn('rounded-plate border-3 border-ink p-[3px]', selected ? 'bg-go' : 'bg-paper', fading && !selected && 'border-dashed opacity-85')}>
          <View className={cn('gap-1 rounded-[2px] border-2 py-3 pl-3.5', onInfo ? 'pr-14' : 'pr-3.5', fading && !selected ? 'border-transparent' : 'border-ink')}>
            <View className="flex-row items-center gap-2">
              <Icon as={CatIcon} size={20} className="text-ink" />
              <Text numberOfLines={1} className="flex-shrink font-display text-[18px] leading-[21px] text-ink">
                {shop.nameTag.toUpperCase()}
              </Text>
            </View>
            <Text className="text-[14px] font-semibold text-ink">{meta}</Text>
          </View>
        </HardShadow>
      </Pressable>
      {onInfo ? (
        <View style={{ position: 'absolute', right: selected ? 12 : 6, top: 0, bottom: selected ? 6 : 0, justifyContent: 'center' }}>
          <IconButton icon={Info} label={infoLabel ?? 'About this shop'} onPress={onInfo} tone="ink" />
        </View>
      ) : null}
      {selected ? (
        <View aria-hidden pointerEvents="none" className="absolute -right-2 -top-3 h-8 w-8 items-center justify-center rounded-pill border-2 border-paper bg-ink">
          <Icon as={Check} size={18} strokeWidth={3.5} className="text-go" />
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ runner trust

export type ResidentCopy = (typeof residentCopy)['en'];

export function levelMeaning(level: TierName, societyName: string, handoffs: number, copy: ResidentCopy) {
  return fill(copy.common.levelMeaning[level], { society: societyName, n: handoffs });
}

/** Big stat tile (handoffs, residents): black window, paper border, yellow number. */
export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <View accessibilityLabel={`${value} ${label}`} className="flex-1 gap-0.5 rounded-block border-2 border-paper bg-ink px-3.5 py-2.5">
      <Text className="font-meter text-[30px] leading-[36px] text-yellow">{String(value)}</Text>
      <Text className="text-[14px] font-semibold text-muted">{label}</Text>
    </View>
  );
}

/** Key/value rows in one calm block. */
export function InfoRows({ rows, className }: { rows: { k: string; v: React.ReactNode }[]; className?: string }) {
  return (
    <View className={cn('overflow-hidden rounded-block border-2 border-line', className)}>
      {rows.map((r, i) => (
        <View key={r.k} className={cn('min-h-[46px] flex-row items-center justify-between gap-3 px-3.5 py-2', i < rows.length - 1 && 'border-b-2 border-line')}>
          <Text className="text-[15px] text-muted">{r.k}</Text>
          {typeof r.v === 'string' ? <Text className="flex-shrink text-right text-[15px] font-bold">{r.v}</Text> : r.v}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ guest gate

/** Guests browse read-only: any write opens "Finish signing up to ask" instead. */
export function useGuestGate() {
  const { guest } = useSession();
  const router = useRouter();
  const c = useCopy(residentCopy);
  const [open, setOpen] = useState(false);
  const guard = (fn: () => void) => () => (guest ? setOpen(true) : fn());
  const sheet = (
    <Sheet open={open} onClose={() => setOpen(false)}>
      <Text variant="title">{c.common.guestTitle}</Text>
      <Text className="text-[15px] leading-[21px] text-muted">{c.common.guestBody}</Text>
      <Button
        label={c.common.guestCta}
        onPress={() => {
          setOpen(false);
          router.push('/welcome/use');
        }}
      />
      <Button label={c.common.guestLater} variant="secondary" onPress={() => setOpen(false)} />
    </Sheet>
  );
  return { guest, guard, sheet };
}

// ------------------------------------------------------------------ sheet screen (B2, B4)

/**
 * A routed bottom sheet over a dimmed backdrop (usually a map). Slides up with the sheet spring;
 * tapping the backdrop or the X goes back.
 */
export function SheetScreen({ backdrop, children, footer, onClose, maxHeight = 0.86 }: { backdrop?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onClose?: () => void; maxHeight?: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const y = useSharedValue(reduce ? 0 : height);
  const fade = useSharedValue(0);
  const c = useCopy(residentCopy);
  const [contentH, setContentH] = useState(0);
  const [footH, setFootH] = useState(0);
  const avail = height * maxHeight - footH - 28;
  useEffect(() => {
    y.value = reduce ? 0 : withSpring(0, SHEET_SPRING);
    fade.value = withTiming(1, { duration: DUR.base, easing: EASE });
  }, [reduce, y, fade]);
  const close = () => {
    if (onClose) return onClose();
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: fade.value * 0.55 }));
  return (
    <View className="flex-1 bg-bg">
      <View className="absolute inset-0">{backdrop}</View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }, dim]} />
      <Pressable accessibilityRole="button" accessibilityLabel={c.common.close} onPress={close} style={{ flex: 1 }} />
      <Animated.View style={[{ maxHeight: height * maxHeight, width: '100%', maxWidth: 520, alignSelf: 'center' }, sheet]} className="overflow-hidden rounded-t-sheet border-2 border-b-0 border-paper bg-raised">
        <View className="items-center pt-2.5">
          <View className="h-1.5 w-12 rounded-[2px] bg-fg" />
        </View>
        <View className="absolute right-2 top-2 z-10">
          <IconButton icon={X} label={c.common.close} onPress={close} />
        </View>
        <Animated.ScrollView onContentSizeChange={(_w: number, ch: number) => setContentH(ch)} style={{ height: contentH ? Math.min(contentH, avail) : undefined, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, gap: 14 }}>
          {children}
        </Animated.ScrollView>
        {footer ? <View onLayout={(e) => setFootH(e.nativeEvent.layout.height)} className="gap-2.5 border-t-2 border-line px-4 pb-4 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>{footer}</View> : null}
      </Animated.View>
    </View>
  );
}

// ------------------------------------------------------------------ B1 empty scene

/** Auto stand, boom barrier, guard reading a paper and a napping dog (B1 empty poster). Decorative. */
export function AutoStandScene({ width }: { width: number }) {
  const h = (width / 366) * 330;
  const s = width / 366;
  return (
    <View aria-hidden pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: 0, width, height: h }}>
      <Svg viewBox="0 0 366 330" width={width} height={h}>
        <Path d="M0 300 L 366 300" stroke={C.ink} strokeWidth={3} />
        <Rect x={226} y={70} width={128} height={52} fill={C.yellow} stroke={C.ink} strokeWidth={3} />
        <Rect x={232} y={76} width={116} height={40} fill="none" stroke={C.ink} strokeWidth={1.5} />
        <SvgText x={290} y={103} textAnchor="middle" fontFamily="ArchivoBlack_400Regular" fontSize={17} fill={C.ink}>
          AUTO STAND
        </SvgText>
        <Path d="M244 122 L 244 300 M336 122 L 336 300" stroke={C.ink} strokeWidth={4} />
        <Rect x={14} y={196} width={16} height={104} fill={C.white} stroke={C.ink} strokeWidth={3} />
        <Rect x={22} y={200} width={180} height={14} fill={C.white} stroke={C.ink} strokeWidth={3} />
        {[48, 92, 136, 180].map((x) => (
          <Rect key={x} x={x} y={200} width={18} height={14} fill={C.ink} />
        ))}
        <G transform="translate(220 260)" fill={C.white} stroke={C.ink} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
          <Path d="M0 38 C 0 20, 20 12, 50 14 C 76 16, 92 24, 92 38 Z" />
          <Path d="M92 36 C 104 36, 112 32, 116 26" fill="none" />
          <Ellipse cx={2} cy={26} rx={16} ry={13} />
          <Path d="M-8 16 C -14 8, -10 4, -4 14 Z" />
          <Path d="M-6 25 C -3 27, 0 27, 2 25" fill="none" />
          <Path d="M30 22 C 36 26, 44 26, 50 22" fill="none" />
        </G>
        <SvgText x={206} y={252} fontFamily="ArchivoBlack_400Regular" fontSize={14} fill={C.ink}>
          z
        </SvgText>
        <SvgText x={196} y={238} fontFamily="ArchivoBlack_400Regular" fontSize={11} fill={C.ink}>
          z
        </SvgText>
      </Svg>
      <View style={{ position: 'absolute', left: 70 * s, bottom: 30 * s }}>
        <Peep seed="p12" size={150 * s} />
      </View>
      <View style={{ position: 'absolute', left: 174 * s, bottom: 34 * s }}>
        <Svg viewBox="0 0 60 50" width={60 * s} height={50 * s}>
          <Rect x={4} y={6} width={42} height={40} fill={C.white} stroke={C.ink} strokeWidth={3} />
          <Path d="M12 16h26M12 24h26M12 32h18" stroke={C.ink} strokeWidth={2} />
        </Svg>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ misc

/**
 * Staggered rise for content blocks (220 ms, 45 ms stagger), fade only under reduced motion. Like the
 * kit's Enter but driven by a shared value: react-native-web entering animations leave the node
 * absolutely positioned, which collapses its siblings.
 */
export function Rise({ index = 0, from = 'down', className, children }: { index?: number; from?: 'down' | 'fade'; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const k = useSharedValue(0);
  const dy = reduce || from === 'fade' ? 0 : 12;
  useEffect(() => {
    k.value = withDelay(Math.min(index, 8) * 45, withTiming(1, { duration: reduce ? DUR.quick : DUR.base, easing: EASE }));
  }, [k, index, reduce]);
  const a = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ translateY: (1 - k.value) * dy }] }));
  return (
    <Animated.View style={a} className={className}>
      {children}
    </Animated.View>
  );
}

/** Small "via Ravi [VERIFIED]" line. */
export function ViaLine({ name, level, onPaper, prefix }: { name: string; level?: TierName | null; onPaper?: boolean; prefix: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className={cn('text-[14px] font-bold', onPaper && 'text-ink')}>{fill(prefix, { name })}</Text>
      {level ? <LevelPlate level={level} size="xs" /> : null}
    </View>
  );
}

export function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
