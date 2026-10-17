/**
 * Signatures: three street objects that always look identical — number-plate levels, meter windows,
 * mela lights — plus stamps that mark records.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect, Text as SvgText, TextPath, G } from 'react-native-svg';
import type { TierName } from '@bhaiya-please/core';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { t } from '@/lib/i18n';
import { C, cn } from '@/lib/utils';
import { FONT } from '@/lib/fonts';
import { HardShadow } from './Sink';
import { Text } from './Text';
import { EASE, useThump } from './motion';

// ------------------------------------------------------------------ plates

const PLATE_BG: Record<TierName, string> = { new: C.paper, verified: C.yellow, trusted: C.go };
const PLATE_CLS: Record<TierName, string> = { new: 'bg-paper', verified: 'bg-yellow', trusted: 'bg-go' };
export const LEVEL_LIMITS: Record<TierName, string> = {
  new: '₹200 per order · 1 per run',
  verified: '₹500 per order · 2 per run',
  trusted: '₹1,000 per order · 3 per run',
};
export const levelLabel = (l: TierName) => t(`level.${l}` as 'level.new');

/** Level plate. sm = chip (cards), md = card, lg = profile (with the भ badge and a paper shadow). */
export function LevelPlate({ level, size = 'sm', className }: { level: TierName; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const bg = PLATE_BG[level];
  const label = levelLabel(level).toUpperCase();
  if (size === 'lg') {
    return (
      <HardShadow shadow="paper" radius={4} wrapClassName={cn('self-start', className)} className={cn('flex-row items-center gap-2.5 rounded-plate border-2 border-ink py-2 pl-2 pr-[18px]', PLATE_CLS[level])}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 3, top: 3, right: 3, bottom: 3, borderWidth: 2, borderColor: C.ink, borderRadius: 2 }} />
        <View className="h-10 w-[30px] items-center justify-center rounded-[2px] bg-ink">
          <Text className="font-extrabold text-[18px]" style={{ color: bg }}>भ</Text>
        </View>
        <Text className="font-display text-[30px] leading-[32px] text-ink">{label}</Text>
      </HardShadow>
    );
  }
  const pad = size === 'md' ? 'px-2.5 py-[5px]' : size === 'xs' ? 'px-1 py-[2px]' : 'px-1.5 py-[3px]';
  const fs = size === 'md' ? 'text-[15px] leading-[16px]' : size === 'xs' ? 'text-[9px] leading-[10px]' : 'text-[11px] leading-[12px]';
  return (
    <View accessibilityLabel={`${levelLabel(level)} level`} className={cn('self-start rounded-plate border-2 border-ink', pad, className)} style={{ backgroundColor: bg }}>
      {size === 'md' ? <View pointerEvents="none" style={{ position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderWidth: 1, borderColor: C.ink, borderRadius: 2 }} /> : null}
      <Text className={cn('font-display text-ink', fs)}>{label}</Text>
    </View>
  );
}

/** Status plates: LIVE (pulsing dot), FULL, a count, or any short sign. */
export function StatusPlate({ kind, label, className }: { kind: 'live' | 'full' | 'count' | 'sign' | 'warn'; label?: string; className?: string }) {
  if (kind === 'live') {
    return (
      <View className={cn('flex-row items-center gap-2 self-start rounded-plate border-2 border-go bg-ink px-2.5 py-[5px]', className)}>
        <LiveDot />
        <Text className="font-display text-[13px] leading-[14px] text-go">{label ?? 'LIVE'}</Text>
      </View>
    );
  }
  const cls =
    kind === 'full' ? 'bg-raised border-muted' : kind === 'warn' ? 'bg-mirchi border-ink' : kind === 'count' ? 'bg-yellow border-ink' : 'bg-paper border-ink';
  const tc = kind === 'full' ? 'text-muted' : 'text-ink';
  return (
    <View className={cn('self-start rounded-plate border-2 px-2.5 py-[5px]', cls, className)}>
      <Text className={cn('font-display text-[13px] leading-[14px]', tc)}>{label ?? (kind === 'full' ? 'FULL' : '')}</Text>
    </View>
  );
}

/** Public name plate (A5, D3): paper, double frame, yellow hard shadow (ink on yellow headers). */
export function NamePlate({ name, size = 36, className, shadow = 'yellow' }: { name: string; size?: number; className?: string; shadow?: 'yellow' | 'ink' | 'paper' }) {
  return (
    <HardShadow shadow={shadow} radius={4} wrapClassName={cn('self-start', className)} className="rounded-plate border-2 border-ink bg-paper px-6 py-3">
      <View pointerEvents="none" style={{ position: 'absolute', left: 4, top: 4, right: 4, bottom: 4, borderWidth: 2, borderColor: C.ink, borderRadius: 2 }} />
      <Text className="font-display text-ink" style={{ fontSize: size, lineHeight: size * 1.05 }} adjustsFontSizeToFit numberOfLines={1}>
        {name.toUpperCase()}
      </Text>
    </HardShadow>
  );
}

// ------------------------------------------------------------------ live dot

export function LiveDot({ size = 8, color = C.go, still }: { size?: number; color?: string; still?: boolean }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce || still) return;
    o.value = withRepeat(withTiming(0.35, { duration: 800, easing: Easing.linear }), -1, true);
  }, [reduce, still, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size, backgroundColor: color }, a]} />;
}

// ------------------------------------------------------------------ meter windows

type MeterTone = 'yellow' | 'money' | 'urgent' | 'ended' | 'muted';
const DIGIT: Record<MeterTone, string> = { yellow: C.yellow, money: C.go, urgent: C.mirchi, ended: C.muted, muted: C.muted };
const SIZES = { sm: { fs: 20, pad: 'px-2 py-1.5', unit: 'text-[13px]' }, md: { fs: 28, pad: 'px-2.5 py-1.5', unit: 'text-[14px]' }, lg: { fs: 40, pad: 'px-3.5 py-2', unit: 'text-[14px]' }, xl: { fs: 56, pad: 'px-[18px] py-3', unit: 'text-[16px]' } } as const;

/**
 * Meter window: black box, 2px border, seven-segment digits, unit in Baloo muted.
 * Digits roll per digit when the value changes (instant under reduced motion).
 */
export function Meter({
  value, unit, prefix, tone = 'yellow', size = 'md', label, className, spacing = 0, border,
}: {
  value: string | number; unit?: string; prefix?: string; tone?: MeterTone; size?: keyof typeof SIZES; label?: string; className?: string; spacing?: number;
  /** Border colour override ('paper' default, 'ink' on paper cards, 'line' for calm/ended). */
  border?: 'paper' | 'ink' | 'line' | 'yellow' | 'mirchi';
}) {
  const s = SIZES[size];
  const b = border ?? (tone === 'urgent' ? 'mirchi' : tone === 'ended' ? 'line' : 'paper');
  const bc = { paper: 'border-paper', ink: 'border-ink', line: 'border-line', yellow: 'border-yellow', mirchi: 'border-mirchi' }[b];
  const str = String(value);
  return (
    <View accessibilityRole="image" accessibilityLabel={label ?? `${prefix ?? ''}${str} ${unit ?? ''}`.trim()} className={cn('flex-row items-baseline gap-1.5 self-start rounded-block border-2 bg-ink', s.pad, bc, className)}>
      {prefix ? <Text className={cn('font-semibold text-muted', s.unit)}>{prefix}</Text> : null}
      <RollingDigits text={str} size={s.fs} color={DIGIT[tone]} spacing={spacing} />
      {unit ? <Text className={cn('font-semibold text-muted', s.unit)}>{unit}</Text> : null}
    </View>
  );
}

/** Seven-segment digits; each numeric digit rolls vertically to its new value (220ms). */
export function RollingDigits({ text, size, color, spacing = 0 }: { text: string; size: number; color: string; spacing?: number }) {
  const chars = text.split('');
  return (
    <View className="flex-row" style={{ height: Math.round(size * 1.25), overflow: 'hidden' }}>
      {chars.map((ch, i) => (
        <Digit key={`${chars.length - i}`} ch={ch} size={size} color={color} spacing={i < chars.length - 1 ? spacing : 0} />
      ))}
    </View>
  );
}

function Digit({ ch, size, color, spacing }: { ch: string; size: number; color: string; spacing: number }) {
  const reduce = useReducedMotion();
  const isNum = /\d/.test(ch);
  const h = Math.round(size * 1.25);
  const y = useSharedValue(isNum ? -Number(ch) * h : 0);
  useEffect(() => {
    if (!isNum) return;
    const target = -Number(ch) * h;
    y.value = reduce ? target : withTiming(target, { duration: 220, easing: EASE });
  }, [ch, isNum, h, reduce, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const style = { fontFamily: FONT.meter, fontSize: size, lineHeight: h, height: h, color, marginRight: spacing, includeFontPadding: false } as const;
  if (!isNum) return <Text style={style}>{ch}</Text>;
  return (
    <View style={{ height: h, overflow: 'hidden', marginRight: spacing }}>
      <Animated.View style={a}>
        {Array.from({ length: 10 }, (_, d) => (
          <Text key={d} style={{ ...style, marginRight: 0 }}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/** Slot dots: filled = taken. */
export function Slots({ taken, total, onPaper, label }: { taken: number; total: number; onPaper?: boolean; label?: string }) {
  return (
    <View accessibilityLabel={`${taken} of ${total} slots taken`} className={cn('flex-row items-center gap-2 self-start rounded-block border-2 px-3.5 py-3', onPaper ? 'border-ink bg-transparent' : 'border-paper bg-ink')}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < taken ? (onPaper ? C.ink : C.yellow) : 'transparent', borderWidth: i < taken ? 0 : 2, borderColor: onPaper ? C.ink : C.muted }} />
      ))}
      <Text className={cn('ml-1 text-[14px] font-semibold', onPaper ? 'text-ink' : 'text-muted')}>{label ?? `${taken} of ${total}`}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ mela lights

let lightsId = 0;
/**
 * Mela lights: festive bulbs (yellow, coral, green, paper on black) for moments that need a glance:
 * at the gate, sandbox, run ending, confirms. Never behind text. `marquee` slowly chases.
 */
export function MelaLights({ width, height, className, marquee }: { width?: number | `${number}%`; height?: number | `${number}%`; className?: string; marquee?: boolean }) {
  const id = useMemo(() => `ml${++lightsId}`, []);
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!marquee || reduce) return;
    x.value = withRepeat(withTiming(-28, { duration: 1400, easing: Easing.linear }), -1, false);
  }, [marquee, reduce, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View pointerEvents="none" aria-hidden className={cn('overflow-hidden bg-ink', className)} style={{ width, height }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, right: marquee ? -28 : 0 }, a]}>
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id={id} x={0} y={0} width={28} height={28} patternUnits="userSpaceOnUse">
              <Circle cx={7} cy={7} r={3.5} fill={C.yellow} />
              <Circle cx={21} cy={7} r={3.5} fill={C.mirchi} />
              <Circle cx={7} cy={21} r={3.5} fill={C.go} />
              <Circle cx={21} cy={21} r={3.5} fill={C.paper} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Scrolling sign text (sandbox banner). Stops under reduced motion. */
export function Marquee({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduce || !w) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-w, { duration: w * 28, easing: Easing.linear }), -1, false);
  }, [reduce, w, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const item = (k: number, tone: string) => (
    <Text key={k} numberOfLines={1} className={cn('font-display text-[14px] pr-7', tone)} style={{ flexShrink: 0 }}>
      {text}
    </Text>
  );
  return (
    <View className={cn('flex-1 overflow-hidden', className)}>
      <Animated.View className="flex-row" style={a}>
        <View className="flex-row" onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {item(0, 'text-yellow')}
          {item(1, 'text-paper')}
        </View>
        {item(2, 'text-yellow')}
        {item(3, 'text-paper')}
        {item(4, 'text-yellow')}
      </Animated.View>
    </View>
  );
}

// ------------------------------------------------------------------ stamps

let stampId = 0;
/**
 * Rubber stamp: double ring, text on a path, rotated −8°. Decorative (aria-hidden): the meaning is
 * always also in text. `animate` thumps it in (scale 1.3 → 1, 300ms).
 */
export function Stamp({
  ring = 'HANDED OVER · HANDED OVER ·', center, check, color = C.go, size = 120, rotate = -8, animate, delay = 0,
}: { ring?: string; center?: [string, string?]; check?: boolean; color?: string; size?: number; rotate?: number; animate?: unknown; delay?: number }) {
  const id = useMemo(() => `st${++stampId}`, []);
  const style = useThump(animate ?? 'static', rotate, delay);
  return (
    <Animated.View pointerEvents="none" aria-hidden style={[{ width: size, height: size, opacity: 0.94 }, animate === undefined ? { transform: [{ rotate: `${rotate}deg` }] } : style]}>
      <Svg viewBox="0 0 200 200" width={size} height={size}>
        <Defs>
          <Path id={id} d="M 32,100 a 68,68 0 1,1 136,0 a 68,68 0 1,1 -136,0" />
        </Defs>
        <Circle cx={100} cy={100} r={94} fill="none" stroke={color} strokeWidth={7} />
        <Circle cx={100} cy={100} r={82} fill="none" stroke={color} strokeWidth={3} />
        {ring ? (
          <SvgText fontFamily={FONT.display} fontSize={Math.min(18, (427 / ring.length - 3) / 0.72)} letterSpacing={3} fill={color}>
            <TextPath href={`#${id}`}>{ring}</TextPath>
          </SvgText>
        ) : null}
        {check ? <Path d="M70 102 L 92 124 L 132 80" fill="none" stroke={color} strokeWidth={11} strokeLinecap="square" /> : null}
        {center ? (
          <G>
            <SvgText x={100} y={center[1] ? 96 : 108} textAnchor="middle" fontFamily={FONT.display} fontSize={center[1] ? 24 : 26} fill={color}>
              {center[0]}
            </SvgText>
            {center[1] ? (
              <SvgText x={100} y={124} textAnchor="middle" fontFamily={FONT.display} fontSize={18} fill={color}>
                {center[1]}
              </SvgText>
            ) : null}
          </G>
        ) : null}
      </Svg>
    </Animated.View>
  );
}

/** Small vouch stamp for profiles ("ID / LOTUS", "LIVES / HERE"). */
export function VouchStamp({ top, bottom, rotate = -8, size = 72 }: { top: string; bottom: string; rotate?: number; size?: number }) {
  return (
    <View aria-hidden style={{ transform: [{ rotate: `${rotate}deg` }] }}>
      <Svg viewBox="0 0 200 200" width={size} height={size}>
        <Circle cx={100} cy={100} r={92} fill="none" stroke={C.go} strokeWidth={10} />
        <Circle cx={100} cy={100} r={74} fill="none" stroke={C.go} strokeWidth={4} />
        <SvgText x={100} y={94} textAnchor="middle" fontFamily={FONT.display} fontSize={top.length > 3 ? 30 : 34} fill={C.go}>
          {top}
        </SvgText>
        <SvgText x={100} y={130} textAnchor="middle" fontFamily={FONT.display} fontSize={22} fill={C.go}>
          {bottom}
        </SvgText>
      </Svg>
    </View>
  );
}

/** Keep a value from the previous render (for "changed?" triggers). */
export function usePrevious<T>(v: T) {
  const r = useRef<T>(v);
  const prev = r.current;
  r.current = v;
  return prev;
}

// ------------------------------------------------------------------ level up

/**
 * Level up: the plate flips (rotateX 600ms) from the old level to the new one, limits update, and a
 * coral Modak "सेटिंग हो गई!" appears (D6, C10). Instant under reduced motion.
 */
export function PlateFlip({ from, to, flipped, celebrate = true }: { from: TierName; to: TierName; flipped: boolean; celebrate?: boolean }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(flipped ? 180 : 0);
  useEffect(() => {
    r.value = reduce ? (flipped ? 180 : 0) : withTiming(flipped ? 180 : 0, { duration: 600, easing: EASE });
  }, [flipped, reduce, r]);
  const front = useAnimatedStyle(() => ({ opacity: r.value < 90 ? 1 : 0, transform: [{ perspective: 800 }, { rotateX: `${r.value}deg` }] }));
  const back = useAnimatedStyle(() => ({ opacity: r.value >= 90 ? 1 : 0, transform: [{ perspective: 800 }, { rotateX: `${r.value - 180}deg` }] }));
  const face = (l: TierName) => (
    <View className={cn('h-16 w-[260px] items-center justify-center rounded-plate border-2 border-ink', PLATE_CLS[l])}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 3, top: 3, right: 3, bottom: 3, borderWidth: 2, borderColor: C.ink, borderRadius: 2 }} />
      <Text className="font-display text-[30px] text-ink">{levelLabel(l).toUpperCase()}</Text>
    </View>
  );
  return (
    <View className="items-center gap-4">
      <View style={{ width: 260, height: 64 }}>
        <Animated.View style={[{ position: 'absolute', inset: 0 }, front]}>{face(from)}</Animated.View>
        <Animated.View style={[{ position: 'absolute', inset: 0 }, back]}>{face(to)}</Animated.View>
      </View>
      <Text className="min-h-[22px] text-[15px] text-muted">{LEVEL_LIMITS[flipped ? to : from]}</Text>
      {celebrate ? (
        <Text accessibilityLiveRegion="polite" className="min-h-[34px] font-hindi text-[26px] text-mirchi" style={{ opacity: flipped ? 1 : 0 }}>
          {t('celebrate.levelUp')}
        </Text>
      ) : null}
    </View>
  );
}
