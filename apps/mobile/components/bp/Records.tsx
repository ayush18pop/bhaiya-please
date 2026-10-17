/**
 * Paper records: the request bill, the receipt (stamped, torn edge), and the domain cards used across
 * screens (run card for residents, the runner's own run on paper, runner-side request cards).
 */
import { Pressable, View } from 'react-native';
import type { Address, ReceiptTag, Run, TierName } from '@bhaiya-please/core';
import { aliasFor } from '@/lib/alias';
import { placeName } from '@/lib/societies';
import { t } from '@/lib/i18n';
import { rupees } from '@/lib/format';
import { C, cn } from '@/lib/utils';
import { Button } from './Button';
import { Avatar } from './Peep';
import { LevelPlate, LiveDot, MelaLights, Meter, Slots, Stamp, StatusPlate } from './Signatures';
import { HardShadow } from './Sink';
import { Card, DashRule, TornEdge } from './Surface';
import { Text } from './Text';

export const TAG_KEY: Record<ReceiptTag, Parameters<typeof t>[0]> = {
  on_time: 'compliment.onTime',
  exact_item: 'compliment.exactItem',
  polite: 'compliment.polite',
  good_price: 'compliment.goodPrice',
  careful_packing: 'compliment.carefulPacking',
};
export const tagLabel = (tag: ReceiptTag) => t(TAG_KEY[tag]);

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-[16px] text-ink">{k}</Text>
      <Text numberOfLines={2} className={cn('flex-shrink text-right text-[16px] text-ink', strong ? 'font-extrabold' : 'font-bold')}>
        {v}
      </Text>
    </View>
  );
}

/** Request summary as a paper bill: shop, items, max price, tip, "Pay at the gate, up to". */
export function BillCard({ shop, via, items, maxPrice, tip, className }: { shop: string; via?: string; items: string[]; maxPrice: number; tip: number; className?: string }) {
  return (
    <View className={className}>
      <View className="gap-2.5 rounded-t-sheet border-2 border-b-0 border-ink bg-paper px-5 pb-4 pt-5">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text numberOfLines={1} className="flex-shrink font-display text-[18px] text-ink">
            {shop}
          </Text>
          {via ? <Text className="text-[13px] font-semibold text-ink">via {via}</Text> : null}
        </View>
        <DashRule />
        {items.map((it, i) => (
          <Text key={i} className="text-[16px] font-semibold text-ink">
            {it}
          </Text>
        ))}
        <DashRule />
        <Line k="Max price" v={rupees(maxPrice)} />
        <Line k="Tip" v={rupees(tip)} />
        <DashRule />
        <View className="flex-row items-center justify-between">
          <Text className="text-[16px] font-extrabold text-ink">Pay at the gate, up to</Text>
          <Meter value={maxPrice + tip} prefix="₹" size="sm" border="ink" />
        </View>
      </View>
      <TornEdge />
    </View>
  );
}

/** The receipt: resident → runner, items, compliments, HANDED OVER stamp, torn bottom edge. */
export function ReceiptCard({
  from, to, at, items, tags, place, animateStamp, compact, className,
}: { from: Address | string; to: Address | string; at: number; items?: string[]; tags: ReceiptTag[]; place?: string; animateStamp?: unknown; compact?: boolean; className?: string }) {
  const when = new Date(at * 1000);
  const date = when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return (
    <View className={className}>
      <View className={cn('gap-2.5 rounded-t-sheet border-2 border-b-0 border-ink bg-paper', compact ? 'px-4 pb-3 pt-4' : 'px-[22px] pb-[18px] pt-[22px]')}>
        <Text className="font-display text-[20px] text-ink">Receipt</Text>
        <Text className="text-[14px] font-semibold text-ink">
          {date} · {time}
          {place ? ` · ${place}` : ''}
        </Text>
        <DashRule />
        <Line k="From" v={aliasFor(from)} strong />
        <Line k="To" v={aliasFor(to)} strong />
        {items?.length ? <Line k="Items" v={items.join(' · ')} /> : null}
        <DashRule />
        <Text className="text-[15px] font-bold text-ink">{tags.length ? tags.map(tagLabel).join(' · ') : 'Handed over'}</Text>
        <Text className="max-w-[220px] text-[14px] leading-[19px] text-ink">{aliasFor(to)} owns this receipt. Nobody can edit it.</Text>
        <View pointerEvents="none" style={{ position: 'absolute', right: 14, bottom: 6 }}>
          <Stamp check color={C.cng} size={compact ? 96 : 120} animate={animateStamp} delay={animateStamp !== undefined ? 250 : 0} />
        </View>
      </View>
      <TornEdge />
    </View>
  );
}

// ------------------------------------------------------------------ run cards

export type RunCardState = 'live' | 'full' | 'atGate' | 'stale' | 'ended' | 'offline';

/** Resident view of a run heading to the society. */
export function RunCard({
  run, level, handoffs, now, state = 'live', staleText, onPress, onAsk, askLabel, actionNode, className,
}: {
  run: Run; level?: TierName | null; handoffs?: number; now: number; state?: RunCardState; staleText?: string;
  onPress?: () => void; onAsk?: () => void; askLabel?: string; actionNode?: React.ReactNode; className?: string;
}) {
  const mins = Math.max(0, Math.ceil((run.eta - now) / 60));
  const slots = run.capacityLeft;
  const dim = state === 'full' || state === 'ended';
  const meta = [`from ${placeName(run.fromZone)}`, state === 'full' ? 'no slots left' : `${slots} slot${slots === 1 ? '' : 's'} left`, handoffs ? `${handoffs} handoffs` : null].filter(Boolean).join(' · ');
  return (
    <Card tone={dim || state === 'offline' ? 'calm' : 'default'} className={cn('gap-3.5', className)}>
      <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'link' : undefined} className={cn('flex-row items-center gap-3', dim && 'opacity-55')}>
        <Avatar seed={run.creator} size={48} dashed={state === 'stale'} faded={state === 'stale'} />
        <View className="flex-1 gap-1">
          <Text numberOfLines={1} className="text-[19px] font-bold leading-[23px]">
            {aliasFor(run.creator)}
          </Text>
          {level ? <LevelPlate level={level} /> : null}
        </View>
        {state === 'full' ? (
          <StatusPlate kind="full" />
        ) : state === 'atGate' ? (
          <View className="flex-row overflow-hidden rounded-plate border-2 border-paper">
            <MelaLights width={18} />
            <Text className="bg-yellow px-2.5 py-1.5 text-[14px] font-extrabold text-ink">{t('status.atGate')}</Text>
          </View>
        ) : (
          <Meter value={mins} unit="min" tone={state === 'offline' ? 'muted' : mins <= 1 ? 'urgent' : 'yellow'} border={state === 'offline' ? 'line' : undefined} label={`Arriving in ${mins} minutes`} />
        )}
      </Pressable>
      {state === 'stale' && staleText ? (
        <View className="flex-row items-center gap-2">
          <View className="h-2.5 w-2.5 rounded-pill border-2 border-dashed border-muted" />
          <Text className="text-[14px] font-semibold text-muted">{staleText}</Text>
        </View>
      ) : (
        <Text className="text-[14px] font-semibold text-muted">{meta}</Text>
      )}
      {actionNode ?? (onAsk ? <Button label={askLabel ?? t('request.cta.ask')} variant={state === 'full' ? 'secondary' : 'ask'} size="md" full onPress={onAsk} disabled={state === 'offline'} className="bg-surface" /> : null)}
    </Card>
  );
}

/** The runner's own run, on paper with a yellow shadow ("yours"). Ending soon gets a lights edge. */
export function OwnRunCard({ title, minutesLeft, taken, total, live = true, ending, endingText, className }: { title: string; minutesLeft: number; taken: number; total: number; live?: boolean; ending?: boolean; endingText?: string; className?: string }) {
  return (
    <HardShadow shadow="yellow" className={cn('flex-row overflow-hidden rounded-block border-2 border-ink bg-paper', className)}>
      {ending ? <MelaLights width={14} /> : null}
      <View className="flex-1 gap-3.5 p-[18px]">
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="flex-shrink font-display text-[20px] leading-[23px] text-ink">
            {title}
          </Text>
          {live && !ending ? (
            <View className="flex-row items-center gap-1.5 rounded-plate bg-ink px-2 py-1">
              <LiveDot />
              <Text className="font-display text-[12px] text-go">LIVE</Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-3">
          <Meter value={minutesLeft} unit="min" size="lg" tone={ending ? 'urgent' : 'yellow'} border="ink" label={`${minutesLeft} minutes left`} />
          {ending && endingText ? (
            <Text className="flex-1 text-[15px] font-bold leading-[20px] text-ink">{endingText}</Text>
          ) : (
            <View className="gap-1.5">
              <View className="flex-row gap-1.5">
                {Array.from({ length: total }, (_, i) => (
                  <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: i < taken ? C.ink : 'transparent', borderWidth: i < taken ? 0 : 2, borderColor: C.ink }} />
                ))}
              </View>
              <Text className="text-[14px] font-bold text-ink">
                {taken} of {total} slots taken
              </Text>
            </View>
          )}
        </View>
      </View>
    </HardShadow>
  );
}

// ------------------------------------------------------------------ runner request cards

export type RequestCardState = 'new' | 'accepted' | 'handed' | 'full' | 'cancelled' | 'declined';

/** Runner-side request card. `actions` is where the screen puts Decline / Accept SaveButtons. */
export function RequestCard({
  resident, items, shop, maxPrice, tip, ago, state, actions, onPress, className,
}: { resident: Address | string; items: string[]; shop: string; maxPrice: number; tip: number; ago?: string; state: RequestCardState; actions?: React.ReactNode; onPress?: () => void; className?: string }) {
  if (state === 'handed') {
    return (
      <Card tone="calm" onPress={onPress} className={cn('flex-row items-center gap-3 px-4 py-3', className)}>
        <View className="h-7 w-7 items-center justify-center rounded-pill bg-go">
          <Text className="font-display text-[14px] text-ink">✓</Text>
        </View>
        <Text className="flex-1 text-[15px] font-semibold">Handed over to {aliasFor(resident)}</Text>
        <Text className="text-[13px] font-bold text-go">{rupees(maxPrice + tip)}</Text>
      </Card>
    );
  }
  if (state === 'cancelled' || state === 'declined') {
    return (
      <Card tone="calm" className={cn('flex-row items-center justify-between px-4 py-3', className)}>
        <Text className="flex-shrink text-[15px] font-semibold text-muted line-through" style={{ textDecorationLine: 'line-through' }}>
          {items.join(' · ')}
        </Text>
        <Text className="text-[13px] text-muted">{state === 'cancelled' ? 'Cancelled by resident' : 'You declined'}</Text>
      </Card>
    );
  }
  if (state === 'full') {
    return (
      <Card tone="dashed" className={cn('gap-1.5 px-4 py-3', className)}>
        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className="flex-shrink text-[15px] font-bold text-muted">
            {items.join(' · ')}
          </Text>
          <StatusPlate kind="full" label="RUN FULL" />
        </View>
        <Text className="text-[13px] text-muted">
          from {aliasFor(resident)}
          {ago ? ` · ${ago}` : ''}
        </Text>
      </Card>
    );
  }
  if (state === 'accepted') {
    return (
      <Card onPress={onPress} className={cn('flex-row overflow-hidden p-0', className)}>
        <View className="w-1.5 bg-yellow" />
        <View className="flex-1 gap-1.5 px-4 py-3.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text numberOfLines={1} className="flex-shrink text-[17px] font-bold">
              {items.join(' · ')}
            </Text>
            <Text className="text-[13px] font-bold text-yellow">{t('status.accepted')}</Text>
          </View>
          <Text className="text-[14px] text-muted">
            for {aliasFor(resident)} · {shop} · collect up to {rupees(maxPrice + tip)}
          </Text>
          {actions}
        </View>
      </Card>
    );
  }
  return (
    <Card onPress={onPress} className={cn('gap-3', className)}>
      <View className="flex-row items-center gap-2.5">
        <View className="rounded-plate border-2 border-ink bg-yellow px-1.5 py-[3px]">
          <Text className="font-display text-[11px] leading-[12px] text-ink">NEW</Text>
        </View>
        <Avatar seed={resident} size={28} ring="none" />
        <Text className="text-[15px] font-bold">{aliasFor(resident)}</Text>
        {ago ? <Text className="ml-auto text-[14px] text-muted">{ago}</Text> : null}
      </View>
      <View className="gap-0.5">
        <Text className="text-[19px] font-bold leading-[24px]">{items[0]}</Text>
        {items.length > 1 ? <Text className="text-[15px] text-muted">{items.slice(1).join(' · ')}</Text> : null}
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text numberOfLines={1} className="flex-shrink text-[15px] font-semibold">
          {shop}
        </Text>
        <View className="flex-row items-baseline gap-1 rounded-block border-2 border-paper bg-ink px-2.5 py-1.5">
          <Text className="text-[13px] text-muted">max ₹</Text>
          <Meter value={maxPrice} tone="money" size="sm" className="border-0 bg-transparent p-0" />
          <Text className="text-[13px] text-muted">+ ₹</Text>
          <Meter value={tip} tone="money" size="sm" className="border-0 bg-transparent p-0" />
        </View>
      </View>
      {actions}
    </Card>
  );
}

export { Slots };
