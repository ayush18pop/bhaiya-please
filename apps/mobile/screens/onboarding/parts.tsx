/** Shared onboarding pieces: header, brand mark, item ticker, intro poster art. */
import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Animated, DUR, EASE, Easing, IconButton, Peep, Text, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from '@/components/bp';
import { FONT } from '@/lib/fonts';
import { C, cn } from '@/lib/utils';

/** Back button + display title + optional muted line (A3–A6 header). */
export function OnbHeader({ title, sub, onBack, backLabel = 'Back', className }: { title: string; sub?: string; onBack?: () => void; backLabel?: string; className?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View className={cn('gap-1.5 px-4 pb-3', className)} style={{ paddingTop: insets.top + 12 }}>
      <View className="-ml-3 self-start">
        <IconButton icon={ChevronLeft} label={backLabel} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/welcome')))} />
      </View>
      <Text variant="title" className="text-[30px] leading-[32px]">
        {title}
      </Text>
      {sub ? <Text className="text-[15px] text-muted">{sub}</Text> : null}
    </View>
  );
}

/** The भ P mark (auto yellow with a CNG-green notch). */
export function BrandMark({ width = 200 }: { width?: number }) {
  return (
    <Svg viewBox="0 0 180 100" width={width} height={(width * 100) / 180} aria-hidden>
      <G transform="translate(4 0) skewX(-10)">
        <Path
          fill={C.yellow}
          d="M10 0 H18 C 31 0, 40 9, 40 22 V30 H16 V24 C 16 21, 15 20, 12 20 H10 A10 10 0 0 1 10 0 Z M16 22 H40 V70 A10 10 0 0 1 30 80 H26 A10 10 0 0 1 16 70 Z M40 44 H62 V64 H40 Z M62 0 H86 V100 H62 Z M50 0 H126 V20 H50 Z M102 0 H126 V100 H102 Z M126 0 H150 A28 28 0 0 1 150 56 H126 V36 H150 A8 8 0 0 0 150 20 H126 Z"
        />
        <Path fill={C.cng} d="M126 20 H150 A8 8 0 0 1 150 36 H126 Z" />
      </G>
    </Svg>
  );
}

/** Yellow strip with the shopping list scrolling past (A2 footer). Stops under reduced motion. */
export function ItemTicker({ items }: { items: readonly string[] }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduce || !w) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-w, { duration: w * 30, easing: Easing.linear }), -1, false);
  }, [reduce, w, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const row = (k: number) => (
    <View key={k} className="flex-row items-center" onLayout={k === 0 ? (e) => setW(e.nativeEvent.layout.width) : undefined}>
      {items.map((it, i) => (
        <View key={i} className="flex-row items-center">
          <Text className="pl-4 font-display text-[14px] text-ink">{it}</Text>
          <Text className="pl-4 font-display text-[14px] text-ink">·</Text>
        </View>
      ))}
    </View>
  );
  return (
    <View aria-hidden pointerEvents="none" className="h-10 overflow-hidden border-t-2 border-ink bg-yellow">
      <Animated.View className="h-10 flex-row items-center" style={a}>
        {row(0)}
        {row(1)}
        {row(2)}
      </Animated.View>
    </View>
  );
}

const crowdRow = (seeds: string[], size: number, overlap: number, accent = -1) => (
  <View className="flex-row justify-center">
    {seeds.map((s, i) => (
      <View key={s} style={{ marginLeft: i === 0 ? 0 : -overlap }}>
        <Peep seed={s} size={size} accent={i === accent} />
      </View>
    ))}
  </View>
);

/** Slide art (A2): riders heading in · a kirana queue · the gate. Decorative. */
export function PosterArt({ slide }: { slide: number }) {
  if (slide === 0)
    return (
      <View aria-hidden pointerEvents="none" style={{ position: 'absolute', left: -40, right: -40, bottom: -16 }}>
        <View style={{ marginBottom: -70 }}>{crowdRow(['p0', 'p4', 'p13', 'p17', 'p25'], 110, 40)}</View>
        {crowdRow(['p11', 'p3', 'p20', 'p37'], 150, 54, 1)}
      </View>
    );
  if (slide === 1)
    return (
      <View aria-hidden pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 320 }}>
        <Svg viewBox="0 0 366 160" width="100%" height={160} preserveAspectRatio="xMidYMin meet" style={{ position: 'absolute', left: 0, top: 0 }}>
          <Rect x={20} y={10} width={326} height={56} fill={C.paper} stroke={C.ink} strokeWidth={3} />
          <SvgText x={183} y={48} textAnchor="middle" fontFamily={FONT.display} fontSize={26} fill={C.ink}>
            SHARMA KIRANA
          </SvgText>
          <Path d="M40 66 V 160 M326 66 V 160" stroke={C.ink} strokeWidth={4} />
          <G fill={C.white} stroke={C.ink} strokeWidth={3}>
            {[70, 112, 154, 196, 238].map((x) => (
              <Rect key={x} x={x} y={96} width={30} height={40} rx={6} />
            ))}
          </G>
        </Svg>
        <View style={{ position: 'absolute', left: -20, right: -20, bottom: -14 }}>{crowdRow(['p5', 'p9', 'p16', 'p27'], 140, 50, 1)}</View>
      </View>
    );
  return (
    <View aria-hidden pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 320 }}>
      <Svg viewBox="0 0 366 200" width="100%" height={200} preserveAspectRatio="xMidYMax meet" style={{ position: 'absolute', left: 0, bottom: 110 }}>
        <Rect x={20} y={70} width={18} height={130} fill={C.white} stroke={C.ink} strokeWidth={3} />
        <Rect x={28} y={74} width={300} height={16} fill={C.white} stroke={C.ink} strokeWidth={3} />
        {[58, 112, 166, 220, 274].map((x) => (
          <Rect key={x} x={x} y={74} width={22} height={16} fill={C.ink} />
        ))}
      </Svg>
      <View style={{ position: 'absolute', left: -10, right: -10, bottom: -14 }}>{crowdRow(['p12', 'p46', 'p7'], 150, 40, 1)}</View>
    </View>
  );
}

const LOCKUP = require('@/assets/brand/lockup-transparent-dark-bg-2400.png');

/** Logo lockup (mark + भैया + Please pill). The PNG has wide transparent margins, cropped here. */
export function Lockup({ height = 84, wordOnly, className }: { height?: number; wordOnly?: boolean; className?: string }) {
  const h = height * 2.17;
  const w = h * (2400 / 846);
  const left = wordOnly ? 0.31 : 0.05;
  return (
    <View accessibilityRole="image" accessibilityLabel="भैया Please" className={className} style={{ height, width: w * (0.95 - left), overflow: 'hidden' }}>
      <Image source={LOCKUP} resizeMode="contain" style={{ height: h, width: w, marginTop: -h * 0.26, marginLeft: -w * left }} />
    </View>
  );
}

/**
 * Staggered rise (opacity + 12px lift, 220ms) driven by shared values. Used instead of Reanimated
 * `entering` animations, which on web take items out of flow inside ScrollViews.
 */
export function Rise({ index = 0, delay = 0, from = 'down', className, style, children }: { index?: number; delay?: number; from?: 'down' | 'up'; className?: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay + Math.min(index, 8) * 45, withTiming(1, { duration: reduce ? DUR.quick : DUR.base, easing: EASE }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dy = from === 'up' ? 16 : 12;
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: reduce ? 0 : dy * (1 - p.value) }] }));
  return (
    <Animated.View className={className} style={[style, a]}>
      {children}
    </Animated.View>
  );
}
