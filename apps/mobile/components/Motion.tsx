/** Small motion kit on reanimated: Reveal (enter), AnimatedNumber (tick), Shimmer (skeleton), SuccessBurst (check + confetti-lite). */
import { memo, useEffect, useRef, useState } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { cssInterop, useColorScheme } from 'nativewind';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// NativeWind needs to be told that className maps to style on animated views.
cssInterop(Animated.View, { className: 'style' });

export { FadeIn, FadeInDown, FadeOut, LinearTransition };

/** Staggered fade-up for list rows. Index caps at 8 so long lists never feel slow. */
export function Reveal({ index = 0, className, style, children }: { index?: number; className?: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 55).duration(320).springify().damping(18)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(220)}
      className={className}
      style={style}>
      {children}
    </Animated.View>
  );
}

/** Counts from the previous value to the new one (JS tween so it works inside plain <Text>). */
export const AnimatedNumber = memo(function AnimatedNumber({ value, className, format = (n: number) => String(n), duration = 600 }: { value: number; className?: string; format?: (n: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, reduce, duration]);
  return (
    <Text className={className} style={{ fontVariant: ['tabular-nums'] }}>
      {format(shown)}
    </Text>
  );
});

/** Skeleton block with a soft light sweep. Static under reduced motion. */
export function Shimmer({ className, style }: { className?: string; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const { colorScheme } = useColorScheme();
  const x = useSharedValue(-1);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [reduce, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }] }));
  const hi = colorScheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.7)';
  return (
    <View className={cn('overflow-hidden bg-muted', className)} style={style} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!reduce && w > 0 ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: w }, a]}>
          <LinearGradient colors={['transparent', hi, 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const CONFETTI = ['#e2591b', '#0f766e', '#f5b301', '#1a1d24', '#ef6f8b', '#4aa3ff'];
function Piece({ i, n }: { i: number; n: number }) {
  const p = useSharedValue(0);
  const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.25;
  const dist = 70 + (i % 4) * 22;
  useEffect(() => {
    p.value = withDelay(120 + (i % 5) * 25, withTiming(1, { duration: 900 + (i % 3) * 150, easing: Easing.out(Easing.cubic) }));
  }, [i, p]);
  const a = useAnimatedStyle(() => ({
    opacity: p.value < 0.7 ? 1 : 1 - (p.value - 0.7) / 0.3,
    transform: [
      { translateX: Math.cos(ang) * dist * p.value },
      { translateY: Math.sin(ang) * dist * p.value + 40 * p.value * p.value },
      { rotate: `${p.value * (180 + i * 40)}deg` },
      { scale: 1 - p.value * 0.3 },
    ],
  }));
  const round = i % 2 === 0;
  return <Animated.View style={[{ position: 'absolute', width: round ? 8 : 10, height: round ? 8 : 5, borderRadius: round ? 4 : 1.5, backgroundColor: CONFETTI[i % CONFETTI.length] }, a]} />;
}

/** Animated tick in a teal disc with a short confetti burst. `still` under reduced motion. */
export function SuccessBurst({ size = 88, className }: { size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(reduce ? 1 : 0.2);
  const ring = useSharedValue(0);
  const tick = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    haptic.success();
    if (reduce) return;
    s.value = withSpring(1, { damping: 9, stiffness: 160 });
    tick.value = withDelay(180, withSpring(1, { damping: 10, stiffness: 220 }));
    ring.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
  }, [reduce, s, tick, ring]);
  const disc = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const chk = useAnimatedStyle(() => ({ transform: [{ scale: tick.value }], opacity: tick.value }));
  const rg = useAnimatedStyle(() => ({ opacity: (1 - ring.value) * 0.5, transform: [{ scale: 1 + ring.value * 0.9 }] }));
  return (
    <View className={cn('items-center justify-center self-center', className)} style={{ width: size * 2.2, height: size * 1.5 }} accessibilityRole="image" accessibilityLabel="Success">
      {reduce ? null : Array.from({ length: 18 }).map((_, i) => <Piece key={i} i={i} n={18} />)}
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: '#0f766e' }, rg]} />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2 }, disc]} className="items-center justify-center bg-secondary shadow-lift">
        <Animated.View style={chk}>
          <Icon as={Check} size={size * 0.5} strokeWidth={3.2} className="text-secondary-foreground" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Opacity pulse used for the LIVE dot. */
export function Pulse({ className, color = '#16a34a', size = 10 }: { className?: string; color?: string; size?: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [reduce, p]);
  const a = useAnimatedStyle(() => ({ opacity: (1 - p.value) * 0.6, transform: [{ scale: 1 + p.value * 1.4 }] }));
  return (
    <View className={cn('items-center justify-center', className)} style={{ width: size, height: size }}>
      {reduce ? null : <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, a]} />}
      <View style={{ width: size * 0.8, height: size * 0.8, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

export const isWeb = Platform.OS === 'web';
