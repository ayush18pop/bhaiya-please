/**
 * A1 Splash: brand moment while the account restores and fonts load. Mark drops in (220ms), the
 * lockup fades in, and a thin strip of heads peeks up along the bottom edge.
 *
 * Mount as an overlay at the root: `<Splash ready={appReady} />`. It stays at least `minMs`, then
 * fades out (150ms) once `ready` is true and unmounts itself. Reduced motion: fades only.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Animated, DUR, EASE, Peep, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from '@/components/bp';
import { runOnJS } from 'react-native-reanimated';
import { C } from '@/lib/utils';
import { BrandMark, Lockup } from './parts';

const HEADS = ['p0', 'p5', 'p3', 'p16', 'p7', 'p9', 'p12', 'p14'];

export function Splash({ ready = true, minMs = 700, onHidden }: { ready?: boolean; minMs?: number; onHidden?: () => void }) {
  const reduce = useReducedMotion();
  const [gone, setGone] = useState(false);
  const [minDone, setMinDone] = useState(false);
  const mark = useSharedValue(0);
  const lock = useSharedValue(0);
  const peek = useSharedValue(0);
  const blink = useSharedValue(1);
  const out = useSharedValue(1);

  useEffect(() => {
    mark.value = withTiming(1, { duration: reduce ? DUR.quick : DUR.base, easing: EASE });
    lock.value = withDelay(reduce ? 0 : 200, withTiming(1, { duration: 300 }));
    peek.value = withDelay(reduce ? 0 : 300, withTiming(1, { duration: reduce ? DUR.quick : 400, easing: EASE }));
    // The accent head blinks once (one idle beat on loud screens).
    if (!reduce) blink.value = withDelay(800, withSequence(withTiming(0.15, { duration: 70 }), withTiming(1, { duration: 90 })));
    const t = setTimeout(() => setMinDone(true), minMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !minDone) return;
    out.value = withTiming(0, { duration: DUR.quick }, (fin) => {
      if (fin) runOnJS(setGone)(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, minDone]);

  useEffect(() => {
    if (gone) onHidden?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);

  const markS = useAnimatedStyle(() => ({ opacity: mark.value, transform: [{ scale: reduce ? 1 : 0.9 + 0.1 * mark.value }] }));
  const lockS = useAnimatedStyle(() => ({ opacity: lock.value }));
  const peekS = useAnimatedStyle(() => ({ opacity: reduce ? peek.value : 1, transform: [{ translateY: reduce ? 0 : 40 * (1 - peek.value) }] }));
  const blinkS = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const outS = useAnimatedStyle(() => ({ opacity: out.value }));

  if (gone) return null;
  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel="भैया Please"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 28, overflow: 'hidden' }, outS]}>
      <Animated.View style={markS}>
        <BrandMark width={200} />
      </Animated.View>
      <Animated.View style={lockS}>
        <Lockup height={72} wordOnly />
      </Animated.View>
      <Animated.View aria-hidden pointerEvents="none" style={[{ position: 'absolute', left: -30, right: -30, bottom: -64, flexDirection: 'row', justifyContent: 'center' }, peekS]}>
        {HEADS.map((s, i) => (
          <View key={s} style={{ marginRight: -36 }}>
            {i === 2 ? (
              <Animated.View style={blinkS}>
                <Peep seed={s} size={100} tone="night" accent />
              </Animated.View>
            ) : (
              <Peep seed={s} size={100} tone="night" />
            )}
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

export default Splash;
