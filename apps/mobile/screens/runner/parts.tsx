/** Runner building blocks shared by C2–C10: data hook, level card, live map, sharing chip/sheet, meters. */
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MapPinOff, MoreVertical, Navigation, Sun, SunMedium } from 'lucide-react-native';
import type { Profile, Run } from '@bhaiya-please/core';
import { geohashCenter, PING_RULES } from '@bhaiya-please/core/mock';
import {
  Animated, Button, DUR, EASE, FadeIn, FadeInDown, Icon, IconButton, LevelPlate, LiveDot, Meter, PrivacyLine, RequestCard, Sheet, SwitchRow, Text, LEVEL_LIMITS, useReducedMotion, type RequestCardState,
} from '@/components/bp';
import { MapView } from '@/components/map/MapView';
import { CATEGORY_LABEL, type RunnerPin } from '@/components/map/types';
import { useSession } from '@/components/providers';
import { usePings, useProfile, useRunnerBoard, useRunTrail, useShop, useShops, type RequestRow } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { ago } from '@/lib/format';
import { fill, t as ts, useCopy } from '@/lib/i18n';
import { etaLabel, runnerPin, shopPins, zoneCenter } from '@/lib/mapModel';
import { setSharing, useSharing } from '@/lib/sharing';
import { placeName, societyByZone } from '@/lib/societies';
import { cn } from '@/lib/utils';
import { runnerCopy, type RC } from './copy';
import { syncRunner } from './store';

// ------------------------------------------------------------------ data

/** The runner's active run with derived groups. Also keeps device-local records in sync. */
export function useActiveRun() {
  const { address } = useSession();
  const board = useRunnerBoard();
  const now = useNow();
  const run = board.data?.run ?? null;
  const rows = useMemo(() => board.data?.rows ?? [], [board.data]);
  useEffect(() => {
    syncRunner(address, run?.key, rows);
  }, [address, run?.key, rows]);
  const g = useMemo(() => {
    const accepted = rows.filter((r) => r.accept);
    const waiting = accepted.filter((r) => !r.delivery).sort((a, b) => (a.accept!.createdAt ?? 0) - (b.accept!.createdAt ?? 0));
    const delivered = accepted.filter((r) => r.delivery);
    const pending = rows.filter((r) => !r.accept && !r.decline).sort((a, b) => b.request.createdAt - a.request.createdAt);
    const declined = rows.filter((r) => !r.accept && r.decline);
    return { accepted, waiting, delivered, pending, declined };
  }, [rows]);
  const live = !!run && run.expiresAt > now;
  const taken = g.accepted.length;
  const total = run ? taken + run.capacityLeft : 0;
  return { board, run: live ? run : null, staleRun: run, rows, now, ...g, taken, total, full: !!run && run.capacityLeft <= 0 };
}

export const societyName = (zone6?: string | null) => societyByZone(zone6)?.name ?? placeName(zone6);

/** Shop name for a request (cached per shop key). */
export function useShopName(key?: string | null) {
  const q = useShop(key);
  return q.data?.nameTag ?? (q.isLoading ? '…' : 'Shop');
}

export function directionsTo(zone6: string) {
  const p = geohashCenter(zone6);
  void Linking.openURL(`https://maps.google.com/?q=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
}

/** Ink "Directions" button for paper boards (opens the maps app at the shop's area). */
export function DirectionsButton({ zone6, label, compact }: { zone6: string; label: string; compact?: boolean }) {
  return (
    <Pressable
      onPress={() => directionsTo(zone6)}
      accessibilityRole="link"
      accessibilityLabel={label}
      className={cn('flex-row items-center gap-2 rounded-block bg-ink active:opacity-80', compact ? 'min-h-[44px] px-3' : 'min-h-[52px] px-3.5')}>
      <Icon as={Navigation} size={18} className="text-paper" />
      <Text className="text-[16px] font-extrabold text-paper">{label}</Text>
    </Pressable>
  );
}

export const categoryLabel = (c?: keyof typeof CATEGORY_LABEL) => (c ? CATEGORY_LABEL[c] : 'Shop');

// ------------------------------------------------------------------ header buttons

/** Square Sunlight toggle (runner road screens). */
export function SunButton({ className }: { className?: string }) {
  const { prefs, setPrefs } = useSession();
  const c = useCopy(runnerCopy);
  return (
    <IconButton
      icon={prefs.sunlight ? SunMedium : Sun}
      label={prefs.sunlight ? c.sunOn : c.sunOff}
      size={52}
      onPress={() => setPrefs({ sunlight: !prefs.sunlight })}
      className={cn('border-2 border-edge', prefs.sunlight && 'bg-yellow', className)}
      tone={prefs.sunlight ? 'ink' : 'fg'}
    />
  );
}

export function MoreButton({ onPress }: { onPress: () => void }) {
  const c = useCopy(runnerCopy);
  return <IconButton icon={MoreVertical} label={c.more} onPress={onPress} size={52} />;
}

// ------------------------------------------------------------------ meters

/** Green money meter with the rupee sign inside the window. */
export function Money({ value, size = 'md', unit, className, label }: { value: number; size?: 'sm' | 'md' | 'lg' | 'xl'; unit?: string; className?: string; label?: string }) {
  return <Meter value={value} prefix="₹" unit={unit} tone="money" size={size} className={className} label={label ?? `${value} rupees${unit ? ` ${unit}` : ''}`} />;
}

/** Small stat box: meter digits + muted label (This week). */
export function StatBox({ value, label, money }: { value: number; label: string; money?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${money ? `${value} rupees` : value} ${label}`} className="flex-1 gap-1 rounded-block border-2 border-edge bg-ink" style={{ padding: 10 }}>
      <View className="flex-row items-baseline gap-0.5">
        {money ? <Text className="text-[12px] text-muted">₹</Text> : null}
        <Meter value={value} tone={money ? 'money' : 'yellow'} size="md" className="border-0 bg-transparent p-0" />
      </View>
      <Text numberOfLines={2} className="text-[13px] leading-[16px] text-muted">
        {label}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ level

export function levelProgress(p: Profile | undefined, copy: RC) {
  if (!p) return null;
  const name = p.tier.name;
  if (name === 'new') return { name, ratio: 0, text: copy.level.getVerified, sub: copy.level.getVerifiedBody, verify: true, warn: null as string | null };
  if (name === 'trusted') return { name, ratio: 1, text: copy.level.trusted, sub: null, verify: false, warn: null };
  const r = Math.max(0, 25 - p.receiptsTotal);
  const d = Math.max(0, 15 - p.distinctResidents);
  const text = r && d ? fill(copy.level.toTrusted, { receipts: r, residents: d }) : r ? fill(copy.level.toTrustedReceipts, { receipts: r }) : fill(copy.level.toTrustedResidents, { residents: d });
  return {
    name,
    ratio: Math.min(1, p.receiptsTotal / 25),
    text: `${text} `,
    sub: null,
    verify: false,
    warn: p.complaints30d >= 3 ? fill(copy.level.tooManyReports, { n: p.complaints30d }) : null,
  };
}

/** Progress bar (receipts toward Trusted): green fill, dashed remainder, optional gain segment. */
export function LevelBar({ ratio, gain = 0, label }: { ratio: number; gain?: number; label: string }) {
  const done = Math.max(0, ratio - gain);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }} className="h-[18px] flex-row overflow-hidden rounded-plate border-2 border-edge bg-raised">
      <View style={{ flex: done }} className="bg-go" />
      {gain > 0 ? <View style={{ flex: gain }} className="border-l-2 border-ink bg-yellow" /> : null}
      <View style={{ flex: Math.max(0.0001, 1 - ratio) }} className={cn('justify-center px-1', ratio > 0 && 'border-l-2 border-edge')}>
        <View className="border-t-2 border-dashed border-muted" />
      </View>
    </View>
  );
}

/** "Your level" card: plate, limits, progress to the next level, Get verified. */
export function LevelCard({ profile, gainText, gain }: { profile: Profile | undefined; gainText?: string | null; gain?: number }) {
  const router = useRouter();
  const c = useCopy(runnerCopy);
  const lp = levelProgress(profile, c);
  if (!profile || !lp) return <View className="h-[118px] rounded-block border-2 border-line bg-surface" />;
  return (
    <View className="gap-2.5 rounded-block border-2 border-line bg-surface p-3.5">
      <View className="flex-row flex-wrap items-center justify-between gap-2.5">
        <LevelPlate level={lp.name} size="md" />
        {gainText ? <Text className="text-[14px] font-bold text-go">{gainText}</Text> : <Text className="text-[14px] font-semibold text-muted">{LEVEL_LIMITS[lp.name]}</Text>}
      </View>
      {lp.name !== 'new' ? <LevelBar ratio={lp.ratio} gain={gain} label={c.level.progressLabel} /> : null}
      <Text className="text-[14px] leading-[20px]">
        {lp.text}
        {lp.name === 'verified' ? <Text className="text-[14px] font-extrabold">{ts('level.trusted')}</Text> : null}
        {lp.name === 'verified' ? (
          <Text onPress={() => router.push('/verify')} accessibilityRole="link" className="text-[14px] font-extrabold text-yellow underline" style={{ textDecorationLine: 'underline' }}>
            {' · '}
            {c.level.verification}
          </Text>
        ) : null}
      </Text>
      {lp.sub ? <Text className="text-[13px] text-muted">{lp.sub}</Text> : null}
      {lp.warn ? <Text className="text-[13px] font-semibold text-mirchi">{lp.warn}</Text> : null}
      {lp.verify ? <Button label={c.level.getVerifiedCta} variant="secondary" size="lg" onPress={() => router.push('/verify')} /> : null}
    </View>
  );
}

// ------------------------------------------------------------------ live map

/** Runner's own map: own position (optimistic while a ping is in flight), shops on route, the gate. */
export function RunnerMap({ run, height = 210 }: { run: Run; height?: number }) {
  const now = useNow();
  const { address } = useSession();
  const pings = usePings([run.key]);
  const trail = useRunTrail(run.key);
  const shops = useShops(run.fromZone.slice(0, 5));
  const destShops = useShops(run.destZone.slice(0, 5));
  const profile = useProfile(address);
  const sharing = useSharing();
  const gate = zoneCenter(run.destZone);
  const tier = profile.data?.tier.name ?? null;
  let pin: RunnerPin | null = runnerPin(run, pings.data?.[0], now, { tier, focused: true, trail: trail.data });
  if (sharing.pendingGh7) {
    pin = { ...(pin ?? { id: run.key, tier, freshness: 'live', focused: true }), pos: geohashCenter(sharing.pendingGh7), chip: etaLabel(run, now), sub: 'sending…' };
  }
  const all = [...(shops.data ?? []), ...(destShops.data ?? []).filter((s) => !(shops.data ?? []).some((x) => x.key === s.key))];
  const pins = shopPins(all).slice(0, 12);
  return (
    <View style={{ height }} className="overflow-hidden rounded-block border-2 border-edge bg-surface">
      <MapView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        society={{ pos: gate, label: `${societyName(run.destZone)} gate` }}
        shops={pins}
        runners={pin ? [pin] : []}
        routes={pin ? [{ id: run.key, from: { runner: run.key }, to: gate, tone: 'primary' }] : []}
        fit={[gate, ...(pin ? [pin.pos] : [zoneCenter(run.fromZone)])]}
        fitKey={`${run.key}:${pin ? 1 : 0}`}
        padding={{ top: 36, bottom: 28, left: 36, right: 36 }}
        note="You show as a ~150 m area"
        notePlacement="bottom"
      />
    </View>
  );
}

// ------------------------------------------------------------------ live location

/** Sharing chip (tap → sheet) or, when sending fails / permission is lost, a warning card with Fix. */
export function SharingStatus({ onOpen }: { onOpen: () => void }) {
  const s = useSharing();
  const now = useNow();
  const c = useCopy(runnerCopy);
  if (s.enabled && (s.status === 'denied' || s.status === 'error')) {
    return (
      <View accessibilityRole="alert" className="flex-row items-center gap-3 rounded-block border-2 border-yellow bg-surface py-2.5 pl-3.5 pr-2.5">
        <View className="h-2.5 w-2.5 rounded-pill bg-yellow" />
        <Text className="flex-1 text-[14px] font-bold leading-[19px]">{s.status === 'denied' ? c.run.lost : c.run.failing}</Text>
        <Pressable onPress={onOpen} accessibilityRole="button" className="h-11 justify-center rounded-plate border-2 border-ink bg-yellow px-3 active:opacity-80">
          <Text className="font-display text-[14px] text-ink">{c.run.fix}</Text>
        </Pressable>
      </View>
    );
  }
  const age = s.lastSentAt ? Math.max(0, now - s.lastSentAt) : null;
  const text = !s.enabled ? c.run.sharingOff : age === null ? c.run.finding : fill(c.run.sharing, { ago: age < 60 ? `${age} s ago` : `${Math.floor(age / 60)} min ago` });
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityHint="Opens location settings for this run" className="min-h-[48px] flex-1 flex-row items-center gap-2 active:opacity-70">
      {s.enabled ? <LiveDot size={9} still={age === null} /> : <Icon as={MapPinOff} size={16} className="text-muted" />}
      <Text numberOfLines={1} className="flex-1 text-[14px] font-bold text-muted">
        {text}
      </Text>
    </Pressable>
  );
}

export function SharingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSharing();
  const now = useNow();
  const qc = useQueryClient();
  const c = useCopy(runnerCopy);
  const age = s.lastSentAt ? Math.max(0, now - s.lastSentAt) : null;
  const retry = () => {
    // Re-arm the beacon: toggling restarts its effect (and re-asks permission on device).
    setSharing({ enabled: false });
    setTimeout(() => setSharing({ enabled: true }), 50);
    void qc.invalidateQueries();
  };
  return (
    <Sheet open={open} onClose={onClose} title={c.run.sheetTitle}>
      <SwitchRow label={c.run.shareToggle} hint={c.run.shareHint} value={s.enabled} onChange={(v) => setSharing({ enabled: v })} />
      <SwitchRow label={c.run.simToggle} hint={s.simulate ? c.run.simOn : c.run.simOff} value={s.simulate} onChange={(v) => setSharing({ simulate: v })} />
      <PrivacyLine text={ts('privacy.location')} />
      <Text className="text-[14px] font-semibold text-muted">
        {age === null ? c.run.notSent : fill(c.run.lastSent, { ago: age < 60 ? `${age} s ago` : `${Math.floor(age / 60)} min ago` })} · every {PING_RULES.intervalSeconds} s
      </Text>
      {s.status === 'denied' || s.status === 'error' ? (
        <View className="gap-2.5">
          <Text className="text-[14px] font-semibold text-mirchi">{s.status === 'denied' ? c.run.lost : c.run.failing}</Text>
          <View className="flex-row gap-2.5">
            <Button label={c.run.retry} size="md" full={false} onPress={retry} />
            {s.status === 'denied' && Platform.OS !== 'web' ? <Button label="Open settings" variant="secondary" size="md" full={false} onPress={() => void Linking.openSettings()} /> : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** A request card for one row, with its shop name looked up. */
export function RowCard({ row, state, actions, onPress }: { row: RequestRow; state: RequestCardState; actions?: React.ReactNode; onPress?: () => void }) {
  const shop = useShopName(row.request.shop);
  const r = row.request;
  return <RequestCard resident={r.creator} items={r.items} shop={shop} maxPrice={r.maxPrice} tip={r.tip} ago={ago(r.createdAt)} state={state} actions={actions} onPress={onPress} />;
}

// ------------------------------------------------------------------ misc

export function slotsLabel(n: number, c: RC) {
  return fill(n === 1 ? c.home.slot : c.home.slots, { n });
}

/** Re-render once a second only while mounted (for "sent N ago" labels inside cards). */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export type { RequestRow };

/**
 * Staggered rise for runner blocks. Like the kit's Enter but with a stock preset only: on web,
 * Reanimated 4.7 pins custom keyframes (withInitialValues) to `position: absolute` after cleanup,
 * which stacks blocks on top of each other inside a ScrollView.
 */
export function Rise({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const d = Math.min(index, 8) * 45;
  return (
    <Animated.View entering={reduce ? FadeIn.duration(DUR.quick).delay(d) : FadeInDown.duration(DUR.base).easing(EASE).delay(d)} className={className}>
      {children}
    </Animated.View>
  );
}
