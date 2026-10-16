/** Two-stop draggable sheet over a full-bleed map (Swiggy-style tracking layout). */
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const SPRING = { damping: 22, stiffness: 220, mass: 0.7 };

export function BottomSheet({
  header,
  children,
  collapsed = 0.42,
  expanded = 0.88,
  onSnap,
}: {
  header?: ReactNode;
  children: ReactNode;
  /** Visible fraction of the container when collapsed / expanded. */
  collapsed?: number;
  expanded?: number;
  onSnap?: (open: boolean) => void;
}) {
  const [h, setH] = useState(0);
  const travel = h * (expanded - collapsed);
  const y = useSharedValue(0); // 0 = expanded, travel = collapsed
  const start = useSharedValue(0);
  const [ready, setReady] = useState(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const nh = e.nativeEvent.layout.height;
    if (Math.abs(nh - h) < 1) return;
    setH(nh);
    y.value = nh * (expanded - collapsed);
    setReady(true);
  };

  const snap = (open: boolean) => {
    y.value = withSpring(open ? 0 : travel, SPRING);
    onSnap?.(open);
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = y.value;
    })
    .onChange((e) => {
      y.value = Math.min(travel, Math.max(0, start.value + e.translationY));
    })
    .onEnd((e) => {
      const open = e.velocityY < -400 || (e.velocityY < 400 && y.value < travel / 2);
      y.value = withSpring(open ? 0 : travel, SPRING);
      if (onSnap) scheduleOnRN(onSnap, open);
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <View pointerEvents="box-none" className="absolute inset-0" onLayout={onLayout}>
      {ready ? (
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h * expanded }, style]}>
          <View className="flex-1 rounded-t-3xl border border-border/60 bg-background shadow-2xl shadow-black/25">
          <GestureDetector gesture={pan}>
            <View className="items-center pb-1 pt-2.5">
              <Pressable onPress={() => snap(y.value > travel / 2)} accessibilityRole="button" accessibilityLabel="Expand or collapse list" className="w-full items-center py-1">
                <View className="h-1.5 w-11 rounded-full bg-border" />
              </Pressable>
              {header ? <View className="w-full px-4 pt-1">{header}</View> : null}
            </View>
          </GestureDetector>
          {/* Bottom padding = hidden travel, so the last card can scroll into view while collapsed. */}
          <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pt-2" contentContainerStyle={{ paddingBottom: travel + 24 }}>
            {children}
          </ScrollView>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
