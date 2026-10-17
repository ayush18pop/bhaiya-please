/**
 * The brutal "sink": a block with a hard offset shadow drawn as a real layer (works the same on web,
 * iOS and Android, where elevation can't draw coloured hard shadows). Pressing slides the face onto
 * its shadow (translate 4,4 in 90ms linear) and releases with 140ms ease.
 */
import { useState } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { C, cn } from '@/lib/utils';

export type ShadowTone = 'paper' | 'ink' | 'yellow' | 'mirchi' | 'go' | 'edge' | 'none';
const SHADOW: Record<Exclude<ShadowTone, 'none' | 'edge'>, string> = { paper: C.paper, ink: C.ink, yellow: C.yellow, mirchi: C.mirchi, go: C.go };

export interface SinkProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Hard shadow colour. 'edge' follows the theme (paper on dark, ink in Sunlight). */
  shadow?: ShadowTone;
  /** Shadow offset in px (4 default, 2–3 for small things). */
  depth?: number;
  radius?: number;
  /** Classes for the face (bg, border, padding, layout). */
  className?: string;
  /** Classes for the outer wrapper (margins, flex, self-*). */
  wrapClassName?: string;
  style?: StyleProp<ViewStyle>;
  haptics?: 'tap' | 'press' | 'select' | false;
  children?: React.ReactNode;
}

export function Sink({ shadow = 'paper', depth = 4, radius = 12, className, wrapClassName, style, haptics = 'tap', disabled, onPress, onPressIn, onPressOut, children, ...rest }: SinkProps) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const [pressed, setPressed] = useState(false);
  const hasShadow = shadow !== 'none' && !disabled;
  const face = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * depth }, { translateY: p.value * depth }] }));
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={(e) => {
        if (haptics) haptic[haptics]();
        onPress?.(e);
      }}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduce && hasShadow) p.value = withTiming(1, { duration: 90, easing: Easing.linear });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        if (!reduce) p.value = withTiming(0, { duration: 140, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
        onPressOut?.(e);
      }}
      className={cn('relative', wrapClassName)}
      style={[{ marginRight: hasShadow ? depth : 0, marginBottom: hasShadow ? depth : 0 }, style]}>
      {hasShadow ? (
        <View
          pointerEvents="none"
          className={shadow === 'edge' ? 'bg-edge' : undefined}
          style={{ position: 'absolute', left: depth, top: depth, right: -depth, bottom: -depth, borderRadius: radius, backgroundColor: shadow === 'edge' ? undefined : SHADOW[shadow] }}
        />
      ) : null}
      <Animated.View className={cn(className, pressed && !hasShadow && 'opacity-80')} style={[{ borderRadius: radius }, face]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** Static hard shadow for non-pressable blocks (cards, plates, toasts). */
export function HardShadow({ shadow = 'paper', depth = 4, radius = 12, className, wrapClassName, style, children }: Omit<SinkProps, 'onPress' | 'haptics'>) {
  return (
    <View className={cn('relative', wrapClassName)} style={[{ marginRight: shadow === 'none' ? 0 : depth, marginBottom: shadow === 'none' ? 0 : depth }, style]}>
      {shadow !== 'none' ? (
        <View
          pointerEvents="none"
          className={shadow === 'edge' ? 'bg-edge' : undefined}
          style={{ position: 'absolute', left: depth, top: depth, right: -depth, bottom: -depth, borderRadius: radius, backgroundColor: shadow === 'edge' ? undefined : SHADOW[shadow] }}
        />
      ) : null}
      <View className={className} style={{ borderRadius: radius }}>
        {children}
      </View>
    </View>
  );
}
