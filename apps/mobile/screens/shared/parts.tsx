/**
 * Building blocks shared by the D-screens: small status plates, meter stat tiles, the loud yellow
 * profile header with "your crowd", and the public reputation sections (D3 + D4 + E2).
 */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Settings as SettingsIcon } from 'lucide-react-native';
import type { Address, Attestation, AttestationLevel, Complaint, NoShow, Profile, VerifiedReceipt } from '@bhaiya-please/core';
import {
  Animated, DUR, EASE, FadeIn, FadeInDown, useReducedMotion,
  Avatar, AvatarStack, CountChip, Crowd, Glass, HardShadow, Icon, IconButton, LEVEL_LIMITS, LevelPlate, NamePlate, PrivacyLine, RollingDigits,
  ReceiptCard, Skeleton, TAG_KEY, TextButton, TornEdge, Text, VouchStamp, levelLabel, tagLabel,
} from '@/components/bp';
import { aliasFor } from '@/lib/alias';
import { decodeAddressQR } from '@/lib/handoff';
import { fill, useCopy, useT } from '@/lib/i18n';
import { monthYear } from '@/lib/format';
import { placeName } from '@/lib/societies';
import { getJSON, setJSON } from '@/lib/storage';
import { C, cn } from '@/lib/utils';
import { sharedCopy } from './copy';

export const plural = (n: number) => (n === 1 ? '' : 's');
export const shortDate = (unix: number) => new Date(unix * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const timeOf = (unix: number) => new Date(unix * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const dayTime = (unix: number) => `${shortDate(unix)} · ${timeOf(unix)}`;

/** Trusted requirements (mirrors core TRUSTED_RULE; core is not imported at runtime here). */
export const TRUSTED_NEED = { receipts: 25, residents: 15, maxReports30d: 2 } as const;

// ------------------------------------------------------------------ address input

const ADDR = /0x[0-9a-fA-F]{40}/;
/** Accepts an account QR text, a profile link (…/p/0x…) or a bare account ID. */
export function parseAddressInput(text: string): Address | null {
  const t = text.trim();
  if (!t) return null;
  try {
    return decodeAddressQR(t).toLowerCase() as Address;
  } catch {}
  const m = t.match(/\/p\/(0x[0-9a-fA-F]{40})/) ?? (ADDR.test(t) && t.replace(ADDR, '').length < 4 ? t.match(ADDR) : null);
  return m ? (m[1] ?? m[0]).toLowerCase() as Address : null;
}
export const isAddress = (s?: string | null): s is Address => !!s && /^0x[0-9a-fA-F]{40}$/.test(s);

// ------------------------------------------------------------------ desk names / vouches

/** Public name of a desk: its account's public name (or a plain fallback). */
export const deskName = (creator?: string | null) => (creator ? `${aliasFor(creator)} desk` : 'Society desk');

export function useVouchType() {
  const c = useCopy(sharedCopy).profile;
  return (l: AttestationLevel) => (l === 'id_checked' ? c.idChecked : l === 'resident' ? c.resident : c.successor);
}
const STAMP_TOP: Record<AttestationLevel, string> = { id_checked: 'ID', resident: 'LIVES', successor: 'MOVED' };
const stampBottom = (creator: string) => aliasFor(creator).split(' ')[0]!.toUpperCase().slice(0, 7);

/** A vouch row with its green stamp ("ID checked by Neem Owl desk · until Mar 2027"). */
export function VouchRow({ a, last }: { a: Attestation; last?: boolean }) {
  const c = useCopy(sharedCopy).profile;
  const type = useVouchType();
  return (
    <View className={cn('flex-row items-center gap-3.5 px-3.5 py-3', !last && 'border-b-2 border-line', !a.trusted && 'opacity-60')}>
      <VouchStamp top={STAMP_TOP[a.level]} bottom={stampBottom(a.creator)} size={60} />
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] font-bold leading-[20px]">{fill(c.vouchLine, { type: type(a.level), desk: deskName(a.creator) })}</Text>
        <Text className="text-[13px] text-muted">{a.trusted ? fill(c.vouchUntil, { month: monthYear(a.expiresAt) }) : c.vouchUntrusted}</Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ plates & tiles

export type PlateKind = 'live' | 'done' | 'report' | 'ended';
const PLATE: Record<PlateKind, string> = { live: 'bg-yellow border-ink', done: 'bg-go border-ink', report: 'bg-mirchi border-ink', ended: 'bg-raised border-muted' };

/** Small status plate for activity rows (signage capitals, never colour alone). */
export function RowPlate({ kind, label }: { kind: PlateKind; label: string }) {
  return (
    <View className={cn('self-start rounded-plate border-2 px-1.5 py-[3px]', PLATE[kind])}>
      <Text numberOfLines={1} className={cn('font-display text-[10px] leading-[11px]', kind === 'ended' ? 'text-muted' : 'text-ink')}>
        {label}
      </Text>
    </View>
  );
}

/** Meter tile: seven-segment number over a muted label (profile stats). Digits roll on change. */
export function StatTile({ value, label, tone = 'yellow', onPaper }: { value: number; label: string; tone?: 'yellow' | 'go' | 'mirchi'; onPaper?: boolean }) {
  const col = tone === 'go' ? C.go : tone === 'mirchi' ? C.mirchi : C.yellow;
  return (
    <View accessibilityRole="image" accessibilityLabel={`${value} ${label}`} style={{ padding: 10 }} className={cn('flex-1 gap-1 rounded-block bg-ink', onPaper ? 'border-0' : 'border-2 border-paper')}>
      <RollingDigits text={String(value)} size={26} color={col} />
      <Text numberOfLines={1} className="text-[13px] text-muted">
        {label}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ the loud header

/** D3 / D4 header: yellow block, avatar, name plate, level + limits, optional crowd glass. */
export function ProfileHeader({
  address, profile, onBack, onSettings, crowd, compact,
}: { address: Address; profile?: Profile; onBack?: () => void; onSettings?: () => void; crowd?: React.ReactNode; compact?: boolean }) {
  const level = profile?.tier.name;
  const name = aliasFor(address);
  const avatar = (size: number) => (
    <View className="items-center justify-end overflow-hidden rounded-pill border-3 border-ink bg-paper" style={{ width: size, height: size }}>
      <Avatar seed={address} size={size - 6} ring="none" />
    </View>
  );
  return (
    <View className="gap-4 overflow-hidden border-b-3 border-ink bg-yellow px-4 pb-[18px] pt-4">
      {onBack ? (
        <View className="-ml-2 -mt-1">
          <IconButton icon={ChevronLeft} label="Back" tone="ink" onPress={onBack} />
        </View>
      ) : null}
      {compact ? (
        <View className="flex-row items-center gap-4">
          {avatar(84)}
          <View className="flex-1 gap-2">
            <NamePlate name={name} size={26} shadow="ink" />
            <LevelLine level={level} />
          </View>
        </View>
      ) : (
        <>
          <View className="flex-row items-start justify-between">
            {avatar(88)}
            {onSettings ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} className="h-12 w-12 items-center justify-center rounded-block border-2 border-ink bg-paper active:opacity-80">
                <Icon as={SettingsIcon} size={22} className="text-ink" />
              </Pressable>
            ) : null}
          </View>
          <NamePlate name={name} size={34} shadow="ink" />
          <LevelLine level={level} />
        </>
      )}
      {crowd}
    </View>
  );
}

function LevelLine({ level }: { level?: Profile['tier']['name'] }) {
  if (!level) return <Skeleton className="h-5 w-48 bg-ink/20" />;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <LevelPlate level={level} />
      <Text className="text-[15px] font-extrabold text-ink">{LEVEL_LIMITS[level]}</Text>
    </View>
  );
}

/** "Your crowd": every resident who gave a receipt, as faces (max 24) then +N. */
export function CrowdPanel({ seeds, own }: { seeds: string[]; own: boolean }) {
  const c = useCopy(sharedCopy).profile;
  const n = seeds.length;
  return (
    <HardShadow shadow="ink" radius={12}>
      <Glass className="gap-3 p-3.5">
        <Text className="text-[16px] font-bold text-paper">{n ? fill(own ? c.crowd : c.theirCrowd, { n, s: plural(n) }) : c.crowdEmpty}</Text>
        {n ? (
          <View aria-hidden>
            <AvatarStack seeds={seeds} max={24} size={36} />
          </View>
        ) : (
          <View aria-hidden className="h-[46px] overflow-hidden opacity-40">
            <Crowd seeds={['p1', 'p4', 'p9', 'p6', 'p15', 'p12']} size={56} tone="night" />
          </View>
        )}
      </Glass>
    </HardShadow>
  );
}

// ------------------------------------------------------------------ public reputation

export function StatsRow({ profile, third }: { profile: Profile; third: 'last30' | 'reports' }) {
  const c = useCopy(sharedCopy).profile;
  return (
    <View className="flex-row gap-2.5">
      <StatTile value={profile.receiptsTotal} label={c.handoffs} />
      <StatTile value={profile.distinctResidents} label={c.residents} />
      {third === 'last30' ? (
        <StatTile value={profile.receipts30d} label={c.last30} />
      ) : (
        <StatTile value={profile.complaints30d} label={c.reports30} tone={profile.complaints30d ? 'mirchi' : 'yellow'} />
      )}
    </View>
  );
}

export function Compliments({ profile, title = true }: { profile: Profile; title?: boolean }) {
  const c = useCopy(sharedCopy).profile;
  useT();
  const tags = (Object.keys(TAG_KEY) as (keyof typeof TAG_KEY)[]).filter((k) => (profile.tagCounts[k] ?? 0) > 0).sort((a, b) => (profile.tagCounts[b] ?? 0) - (profile.tagCounts[a] ?? 0));
  if (!tags.length) return null;
  return (
    <View className="gap-2.5">
      {title ? <Text className="text-[17px] font-bold">{c.compliments}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {tags.map((k) => (
          <CountChip key={k} label={tagLabel(k)} count={profile.tagCounts[k] ?? 0} />
        ))}
      </View>
    </View>
  );
}

export function Vouches({ list, title = true }: { list: Attestation[]; title?: boolean }) {
  const c = useCopy(sharedCopy).profile;
  return (
    <View className="gap-2.5">
      {title ? <Text className="text-[17px] font-bold">{c.vouches}</Text> : null}
      {list.length ? (
        <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
          {list.map((a, i) => (
            <VouchRow key={a.key} a={a} last={i === list.length - 1} />
          ))}
        </View>
      ) : (
        <Text className="text-[15px] text-muted">{c.noVouches}</Text>
      )}
    </View>
  );
}

const longDate = (unix: number) => new Date(unix * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Reports (last 30 days) and verified no-shows (last 30 days), each visible row by row. */
export function Reports({ list, now, noShows = [] }: { list: Complaint[]; now: number; noShows?: NoShow[] }) {
  const c = useCopy(sharedCopy);
  const recent = list.filter((x) => x.createdAt >= now - 30 * 86400);
  const shows = noShows.filter((x) => x.createdAt >= now - 30 * 86400);
  return (
    <View className="gap-2">
      <Text className="text-[17px] font-bold">{c.profile.reports}</Text>
      {recent.length ? (
        <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
          {recent.map((r, i) => (
            <View key={r.key} className={cn('gap-0.5 px-3.5 py-3', i < recent.length - 1 && 'border-b-2 border-line')}>
              <Text className="text-[15px] font-bold">{fill(c.profile.reportLine, { reason: c.reasons[r.reason] })}</Text>
              <Text className="text-[13px] text-muted">{fill(c.profile.reportMeta, { name: aliasFor(r.creator), date: longDate(r.createdAt), until: monthYear(r.expiresAt) })}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-[15px] text-muted">{c.profile.none}</Text>
      )}
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold">{c.profile.noShows}</Text>
        <View accessibilityLabel={`${shows.length} ${c.profile.noShows}`} className={cn('min-w-[32px] items-center rounded-plate border-2 px-2 py-0.5', shows.length ? 'border-ink bg-mirchi' : 'border-line')}>
          <Text className={cn('font-display text-[14px]', shows.length ? 'text-ink' : 'text-muted')}>{shows.length}</Text>
        </View>
      </View>
      {shows.length ? (
        <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
          {shows.map((n, i) => (
            <View key={n.key} className={cn('gap-0.5 px-3.5 py-3', i < shows.length - 1 && 'border-b-2 border-line')}>
              <Text className="text-[15px] font-bold">{fill(c.profile.noShowLine, { date: longDate(n.at || n.createdAt) })}</Text>
              <Text className="text-[13px] leading-[18px] text-muted">{c.profile.noShowMeta}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-[15px] text-muted">{c.profile.noShowsNone}</Text>
      )}
    </View>
  );
}

/** Small paper ticket for the receipts rail. */
function Ticket({ r, onPress }: { r: VerifiedReceipt; onPress: () => void }) {
  const c = useCopy(sharedCopy).profile;
  const first = r.receipt.tags[0];
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`${fill(c.from, { name: aliasFor(r.receipt.creator) })}, ${shortDate(r.receipt.createdAt)}`} className="w-[136px] active:opacity-80">
      <View className={cn('gap-1 rounded-t-plate border-2 border-b-0 border-ink bg-paper px-2.5 pb-2 pt-2.5', !r.valid && 'opacity-60')}>
        <Text numberOfLines={1} className="text-[13px] font-extrabold text-ink">
          {fill(c.from, { name: aliasFor(r.receipt.creator) })}
        </Text>
        <Text numberOfLines={1} className="text-[12px] font-semibold text-ink">
          {shortDate(r.receipt.createdAt)}
          {first ? ` · ${tagLabel(first)}` : ''}
        </Text>
      </View>
      <TornEdge height={8} />
    </Pressable>
  );
}

export function RecentReceipts({ list, own }: { list: VerifiedReceipt[]; own: boolean }) {
  const router = useRouter();
  const c = useCopy(sharedCopy).profile;
  const [all, setAll] = useState(false);
  const sorted = [...list].sort((a, b) => b.receipt.createdAt - a.receipt.createdAt);
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-[17px] font-bold">{c.receipts}</Text>
        {sorted.length > 3 ? <TextButton label={all ? c.showLess : c.seeAll} onPress={() => setAll((x) => !x)} /> : null}
      </View>
      {!sorted.length ? (
        <Text className="text-[15px] text-muted">{own ? c.noReceipts : c.none}</Text>
      ) : all ? (
        <View className="gap-3">
          {sorted.map((r, i) => (
            <Rise key={r.receipt.key} index={i}>
              <Pressable accessibilityRole="link" onPress={() => router.push(`/receipt/${r.receipt.key}`)} className={cn('active:opacity-90', !r.valid && 'opacity-60')}>
                <ReceiptCard compact from={r.receipt.creator} to={r.receipt.owner} at={r.receipt.createdAt} tags={r.receipt.tags} place={placeName(r.receipt.zone)} />
              </Pressable>
            </Rise>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5 pr-4">
          {sorted.slice(0, 8).map((r) => (
            <Ticket key={r.receipt.key} r={r} onPress={() => router.push(`/receipt/${r.receipt.key}`)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** "Next: Trusted" with a hazard-striped progress bar and what's left in plain words. */
export function LevelProgress({ profile }: { profile: Profile }) {
  const c = useCopy(sharedCopy).profile;
  const level = profile.tier.name;
  if (level === 'trusted') {
    return (
      <View className="gap-1 rounded-block border-2 border-line bg-surface p-3.5">
        <Text className="text-[16px] font-bold">{c.top}</Text>
      </View>
    );
  }
  if (level === 'new') {
    return (
      <View className="gap-2.5 rounded-block border-2 border-line bg-surface p-3.5">
        <Text className="text-[16px] font-bold">{fill(c.next, { level: levelLabel('verified') })}</Text>
        <Bar done={0} total={1} />
        <Text className="text-[14px] leading-[20px]">{c.nextVerified}</Text>
      </View>
    );
  }
  const r = Math.max(0, TRUSTED_NEED.receipts - profile.receiptsTotal);
  const p = Math.max(0, TRUSTED_NEED.residents - profile.distinctResidents);
  const done = Math.min(TRUSTED_NEED.receipts, profile.receiptsTotal);
  const reportsBlock = profile.complaints30d > TRUSTED_NEED.maxReports30d;
  return (
    <View className="gap-2.5 rounded-block border-2 border-line bg-surface p-3.5">
      <Text className="text-[16px] font-bold">{fill(c.next, { level: levelLabel('trusted') })}</Text>
      <Bar done={done} total={TRUSTED_NEED.receipts} />
      <Text className="text-[14px] leading-[20px]">
        {r || p ? fill(c.nextTrusted, { receipts: r, rs: plural(r), residents: p, ps: plural(p) }) : ''}
        {reportsBlock ? `${r || p ? ' ' : ''}${c.nextTrustedReports}` : ''}
      </Text>
    </View>
  );
}

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }} className="h-[18px] flex-row overflow-hidden rounded-plate border-2 border-paper">
      <View style={{ flex: done }} className="bg-go" />
      {total - done > 0 ? (
        <View style={{ flex: total - done }} className={cn('justify-center bg-raised', done > 0 && 'border-l-2 border-paper')}>
          <View className="mx-1 border-t-2 border-dashed border-paper/50" />
        </View>
      ) : null}
    </View>
  );
}

export function CalculatedLine() {
  const c = useCopy(sharedCopy).profile;
  return <PrivacyLine text={c.calculated} />;
}

// ------------------------------------------------------------------ device-local notification toggles

export interface NotifPrefs {
  accepted: boolean;
  gate: boolean;
  run: boolean;
  receipts: boolean;
}
const NP_KEY = 'bp.notifPrefs';
const NP_DEFAULT: NotifPrefs = { accepted: true, gate: true, run: true, receipts: true };
export const loadNotifPrefs = (): NotifPrefs => ({ ...NP_DEFAULT, ...getJSON<Partial<NotifPrefs>>('local', NP_KEY, {}) });
export const saveNotifPrefs = (p: NotifPrefs) => setJSON('local', NP_KEY, p);

// ------------------------------------------------------------------ entry motion

/**
 * Staggered rise (220ms, 45ms per index, capped) without layout transitions: the kit's Enter animates
 * layout too, which collapsed some list rows on web. Fade only under reduced motion.
 */
export function Rise({ index = 0, delay = 0, className, children }: { index?: number; delay?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const d = delay + Math.min(index, 8) * 45;
  return (
    <Animated.View entering={reduce ? FadeIn.duration(DUR.quick).delay(d) : FadeInDown.duration(DUR.base).easing(EASE).delay(d)} className={className}>
      {children}
    </Animated.View>
  );
}
