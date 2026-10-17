/** A2 Intro: three swipeable posters, then Get started / restore / look around. */
import { useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Glass, Text, TextButton, useReducedMotion } from '@/components/bp';
import { useSession } from '@/components/providers';
import { fill, useCopy, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { onboardingCopy } from '@/screens/onboarding/copy';
import { ItemTicker, PosterArt } from '@/screens/onboarding/parts';

const BG = ['bg-paper', 'bg-yellow', 'bg-paper'] as const;

function Slide({ i, width, x, headline, tagline, sub, label }: { i: number; width: number; x: SharedValue<number>; headline: string; tagline: string; sub: string; label: string }) {
  const reduce = useReducedMotion();
  // Light parallax: the crowd drifts slower than the page, the glass panel a touch faster.
  const art = useAnimatedStyle(() => {
    if (reduce || !width) return {};
    const p = (x.value - i * width) / width;
    return { transform: [{ translateX: interpolate(p, [-1, 0, 1], [-width * 0.35, 0, width * 0.35]) }] };
  });
  const panel = useAnimatedStyle(() => {
    if (reduce || !width) return {};
    const p = (x.value - i * width) / width;
    return { opacity: interpolate(p, [-0.8, 0, 0.8], [0, 1, 0]), transform: [{ translateY: interpolate(p, [-1, 0, 1], [18, 0, 18]) }] };
  });
  return (
    <View accessibilityLabel={label} style={{ width, height: '100%', paddingHorizontal: 12, paddingTop: 12 }}>
      <View className={cn('flex-1 overflow-hidden rounded-block border-2 border-ink', BG[i])} style={{ outlineWidth: 2, outlineColor: '#F5F2EC', outlineStyle: 'solid' } as object}>
        <View className="absolute inset-0 rounded-block border-2 border-paper" pointerEvents="none" />
        <Animated.View style={[{ position: 'absolute', inset: 0 }, art]}>
          <PosterArt slide={i} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 16, right: 16, top: 16 }, panel]}>
          <View style={{ shadowColor: '#141412', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 }} className="rounded-block">
            <Glass light className="gap-2.5 p-[18px]">
              <Text variant="title" className="text-[34px] leading-[35px] text-ink">
                {headline}
              </Text>
              <Text className="font-hindi text-[24px] leading-[28px] text-ink">
                {tagline}
              </Text>
              <Text className="text-[15px] font-semibold leading-[20px] text-ink">{sub}</Text>
            </Glass>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

export default function Intro() {
  const router = useRouter();
  const t = useT();
  const c = useCopy(onboardingCopy).intro;
  const insets = useSafeAreaInsets();
  const { onboarded, browseAsGuest, mockBuild } = useSession();
  const [w, setW] = useState(0);
  const [i, setI] = useState(0);
  const ref = useRef<Animated.ScrollView>(null);
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  if (onboarded) return <Redirect href="/home" />;

  const heads = [t('intro.slide1'), t('intro.slide2'), t('intro.slide3')];
  const go = (k: number) => {
    setI(k);
    ref.current?.scrollTo({ x: k * w, animated: true });
  };
  const last = i === 2;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-1" onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w ? (
          <Animated.ScrollView
            ref={ref}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / w))}
            onScrollEndDrag={(e) => setI(Math.max(0, Math.min(2, Math.round(e.nativeEvent.contentOffset.x / w))))}
            style={{ flex: 1, scrollSnapType: 'x mandatory' } as object}
            contentContainerStyle={{ height: '100%' }}>
            {heads.map((h, k) => (
              <View key={k} style={{ scrollSnapAlign: 'start', height: '100%' } as object}>
                <Slide i={k} width={w} x={x} headline={h} tagline={c.taglines[k] ?? ''} sub={c.subs[k] ?? ''} label={fill(c.slideLabel, { n: k + 1 })} />
              </View>
            ))}
          </Animated.ScrollView>
        ) : null}
      </View>

      <View className="flex-row justify-center gap-2 pb-1.5 pt-3.5">
        {heads.map((_, k) => (
          <Pressable
            key={k}
            onPress={() => go(k)}
            accessibilityRole="button"
            accessibilityLabel={fill(c.slideLabel, { n: k + 1 })}
            accessibilityState={{ selected: k === i }}
            hitSlop={12}
            className={cn('h-3.5 rounded-[3px] border-2 border-paper', k === i ? 'w-9 bg-yellow' : 'w-[18px]')}
          />
        ))}
      </View>

      <View className="gap-1 px-4 pb-2 pt-1.5">
        <Button label={last ? c.getStarted : c.next} onPress={() => (last ? router.push('/welcome/use') : go(i + 1))} />
        <View className="flex-row flex-wrap justify-between">
          <TextButton label={c.haveAccount} onPress={() => router.push('/welcome/restore')} />
          <TextButton
            label={c.lookAround}
            onPress={() => {
              browseAsGuest();
              router.replace('/home');
            }}
          />
        </View>
        {mockBuild ? <TextButton label={c.sandbox} tone="yellow" className="min-h-[40px] self-center" onPress={() => router.push('/sandbox')} /> : null}
      </View>
      <View style={{ paddingBottom: insets.bottom }} className="bg-yellow">
        <ItemTicker items={c.ticker} />
      </View>
    </View>
  );
}
