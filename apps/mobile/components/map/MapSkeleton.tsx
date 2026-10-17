import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { C, FONT } from './glyphs';

/** Dark map placeholder while MapLibre loads: land, a few road blocks, a soft breathing fade. */
export function MapSkeleton() {
  const o = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(o, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(o, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [o]);
  return (
    <View style={s.root} accessibilityLabel="Loading map" accessibilityRole="progressbar">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: o }]}>
        <View style={[s.block, { left: 0, right: 0, top: '32%', height: 14 }]} />
        <View style={[s.block, { top: 0, bottom: 0, left: '46%', width: 14 }]} />
        <View style={[s.block, { left: 0, right: 0, top: '68%', height: 8 }]} />
        <View style={[s.block, { top: 0, bottom: 0, left: '18%', width: 8 }]} />
        <View style={[s.block, { top: 0, bottom: 0, right: '16%', width: 8 }]} />
      </Animated.View>
      <View style={s.pill}>
        <Text style={s.text}>Loading map…</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: C.land, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  block: { position: 'absolute', backgroundColor: C.surface },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.raised, borderWidth: 2, borderColor: C.paper },
  text: { color: C.paper, fontFamily: FONT.body700, fontSize: 13 },
});
