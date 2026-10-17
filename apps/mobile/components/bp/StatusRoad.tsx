/**
 * Status road (B8, D2): the request travels along a road as an auto-rickshaw. The gate milestone is a
 * boom barrier that lifts on handoff (500ms). Labels sit under the road.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { t } from '@/lib/i18n';
import { C, cn } from '@/lib/utils';
import { Text } from './Text';
import { EASE } from './motion';

export const ROAD_STEPS = () => [t('status.sent'), t('status.accepted'), t('status.atGate'), t('status.handedOver'), t('status.rated')];

export function AutoGlyph({ size = 44 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 40 30" width={size} height={size * 0.75}>
      <Path d="M4 22 L4 10 C4 6 7 3 11 3 L27 3 C32 3 35 7 35 12 L35 22 Z" fill={C.yellow} stroke={C.ink} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M11 3 L11 14 L35 14" fill="none" stroke={C.ink} strokeWidth={2} />
      <Circle cx={10} cy={24} r={4} fill={C.ink} stroke={C.paper} strokeWidth={1.5} />
      <Circle cx={30} cy={24} r={4} fill={C.ink} stroke={C.paper} strokeWidth={1.5} />
    </Svg>
  );
}

/** Boom barrier glyph; `lifted` animates the arm up −70°. */
export function Barrier({ lifted, size = 48 }: { lifted: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(lifted ? -70 : 0);
  useEffect(() => {
    r.value = reduce ? (lifted ? -70 : 0) : withTiming(lifted ? -70 : 0, { duration: 500, easing: EASE });
  }, [lifted, reduce, r]);
  const s = size / 48;
  const arm = useAnimatedStyle(() => ({ transform: [{ translateX: -19 * s }, { rotate: `${r.value}deg` }, { translateX: 19 * s }] }));
  return (
    <View style={{ width: size, height: size * 0.9 }}>
      <Svg viewBox="0 0 48 44" width={size} height={size * 0.9 + 0.5} style={{ position: 'absolute' }}>
        <Rect x={4} y={16} width={7} height={26} fill={C.paper} stroke={C.ink} strokeWidth={2} />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: 8 * s, top: 16 * s, width: 38 * s, height: 8 * s }, arm]}>
        <Svg viewBox="0 0 38 8" width={38 * s} height={8 * s}>
          <G>
            <Rect x={1} y={1} width={36} height={6} fill={C.yellow} stroke={C.ink} strokeWidth={2} />
            <Rect x={8} y={1} width={6} height={6} fill={C.ink} />
            <Rect x={20} y={1} width={6} height={6} fill={C.ink} />
            <Rect x={31} y={1} width={6} height={6} fill={C.ink} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

/** current: 0 Sent · 1 Accepted · 2 At the gate · 3 Handed over · 4 Rated. */
export function StatusRoad({ current, labels = ROAD_STEPS(), className }: { current: number; labels?: string[]; className?: string }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const handed = current >= 3;
  const p = useSharedValue(0);
  // Auto sits just past the current milestone; it rolls on to the next.
  const pos = Math.min(1, current / 4 + (current < 4 ? 0.02 : 0));
  useEffect(() => {
    p.value = reduce ? pos : withTiming(pos, { duration: 600, easing: EASE });
  }, [pos, reduce, p]);
  const inner = Math.max(0, w - 32);
  const fill = useAnimatedStyle(() => ({ width: p.value * inner }));
  const auto = useAnimatedStyle(() => ({ transform: [{ translateX: 16 + p.value * inner - 22 }] }));
  const fillColor = handed ? C.go : C.yellow;
  return (
    <View accessibilityRole="image" accessibilityLabel={`Status: ${labels[Math.min(current, 4)]}.${current < 4 ? ` Next: ${labels[current + 1]}.` : ''}`} className={cn('gap-2.5', className)}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} className="h-14 rounded-block border-2 border-edge bg-raised">
        <View className="absolute left-4 right-4 top-[25px] border-t-[3px] border-dashed border-paper opacity-50" />
        <Animated.View style={[{ position: 'absolute', left: 16, top: 24, height: 5, backgroundColor: fillColor }, fill]} />
        {[0, 1, 2, 3, 4].map((i) => {
          if (i === 2) return null;
          const done = i <= current;
          const left = 16 + (inner * i) / 4 - 10;
          return (
            <View
              key={i}
              style={{ position: 'absolute', left, top: 16, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: done ? C.ink : i === current + 1 && handed ? C.yellow : C.paper, backgroundColor: done ? (handed ? C.go : C.yellow) : C.raised }}
            />
          );
        })}
        <View style={{ position: 'absolute', left: 16 + inner / 2 - 8, top: handed ? -2 : 4 }}>
          <Barrier lifted={handed} size={44} />
        </View>
        {w > 0 ? (
          <Animated.View style={[{ position: 'absolute', top: 10 }, auto]}>
            <AutoGlyph size={44} />
          </Animated.View>
        ) : null}
      </View>
      <View className="flex-row">
        {labels.map((l, i) => (
          <Text
            key={l}
            numberOfLines={2}
            className={cn('flex-1 text-[12px] font-semibold leading-[15px]', i === 0 ? 'text-left' : i === 4 ? 'text-right' : 'text-center', i === current ? (handed && i === 3 ? 'text-go' : 'text-yellow') : i < current ? 'text-fg' : i === current + 1 && current === 3 ? 'text-yellow' : 'text-muted')}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}
