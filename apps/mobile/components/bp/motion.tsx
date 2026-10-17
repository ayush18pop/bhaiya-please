/**
 * Motion tokens and small reusable animations (design system "Type and motion" + "Signature moments").
 * tap 90ms linear · release 140ms ease · quick 150ms · base 220ms · sheet spring 380/36 · moments 450–700ms.
 * Reduced motion: movement becomes 150ms fades, marquees stop, meter digits change instantly.
 */
import { useEffect } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

/** Layout transitions make Reanimated position items absolutely on web (lists overlap): native only. */
const NATIVE = Platform.OS !== 'web';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { cssInterop } from 'nativewind';

cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.Text, { className: 'style' });

export const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
export const DUR = { tap: 90, release: 140, quick: 150, base: 220, moment: 600 } as const;
export const SHEET_SPRING = { stiffness: 380, damping: 36, mass: 1 } as const;

export { Animated, Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition, SlideInRight, SlideOutLeft, useReducedMotion, useSharedValue, useAnimatedStyle, withDelay, withRepeat, withSequence, withSpring, withTiming };

/** Enter animation for content blocks: 220ms rise, staggered by index (capped). Fade only under reduced motion. */
export function Enter({ index = 0, delay = 0, from = 'down', className, style, children }: { index?: number; delay?: number; from?: 'down' | 'up' | 'fade' | 'right'; className?: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const d = delay + Math.min(index, 8) * 45;
  const entering = reduce || from === 'fade'
    ? FadeIn.duration(DUR.quick).delay(d)
    : from === 'up'
      ? FadeInUp.duration(DUR.base).easing(EASE).delay(d)
      : from === 'right'
        ? SlideInRight.duration(DUR.base).easing(EASE).delay(d)
        : FadeInDown.duration(DUR.base).easing(EASE).delay(d);
  return (
    <Animated.View entering={entering} exiting={NATIVE ? FadeOut.duration(DUR.quick) : undefined} layout={reduce || !NATIVE ? undefined : LinearTransition.duration(DUR.base)} className={className} style={style}>
      {children}
    </Animated.View>
  );
}

/** "New run arrives": card slides in from the right with a small drop (B1, 220ms). */
export function SlideInCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={reduce ? FadeIn.duration(DUR.quick) : SlideInRight.duration(DUR.base).easing(EASE)}
      exiting={NATIVE ? FadeOut.duration(DUR.base) : undefined}
      layout={reduce || !NATIVE ? undefined : LinearTransition.duration(DUR.base)}
      className={className}>
      {children}
    </Animated.View>
  );
}

/** Opacity pulse 1 → .35 → 1 over 1.6 s (live dot). Static under reduced motion. */
export function usePulse(period = 1600) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withSequence(withTiming(0.35, { duration: period / 2 }), withTiming(1, { duration: period / 2 })), -1, false);
  }, [reduce, o, period]);
  return useAnimatedStyle(() => ({ opacity: o.value }));
}

/** Stamp "thump": scale 1.3 → .96 → 1 with a −8° settle, 300ms. Returns style; re-fires when `key` changes. */
export function useThump(trigger: unknown, rotate = -8, delay = 0) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: reduce ? DUR.quick : 300, easing: EASE }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return useAnimatedStyle(() => {
    if (reduce) return { opacity: p.value, transform: [{ rotate: `${rotate}deg` }] };
    const k = p.value;
    const scale = k < 0.6 ? 1.3 - (0.34 * k) / 0.6 : 0.96 + (0.04 * (k - 0.6)) / 0.4;
    const rot = k < 0.6 ? -2 + ((rotate + 2) * k) / 0.6 : rotate;
    return { opacity: Math.min(1, k / 0.6), transform: [{ scale }, { rotate: `${rot}deg` }] };
  });
}
