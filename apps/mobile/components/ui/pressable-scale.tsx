import { Pressable, type GestureResponderEvent } from 'react-native';
import { cssInterop } from 'nativewind';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

const APressable = Animated.createAnimatedComponent(Pressable);
// NativeWind: let className flow into the animated wrapper's style.
cssInterop(APressable, { className: 'style' });
const SPRING = { damping: 18, stiffness: 400, mass: 0.5 };

type Props = React.ComponentProps<typeof Pressable> & { scaleTo?: number };

/** Pressable with a springy press-scale (skipped under reduced motion). */
export function PressScale({ scaleTo = 0.97, onPressIn, onPressOut, style, ...props }: Props) {
  const s = useSharedValue(1);
  const reduce = useReducedMotion();
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...props}
      onPressIn={(e: GestureResponderEvent) => {
        if (!reduce) s.value = withSpring(scaleTo, SPRING);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        if (!reduce) s.value = withSpring(1, SPRING);
        onPressOut?.(e);
      }}
      style={[a, style as never]}
    />
  );
}
