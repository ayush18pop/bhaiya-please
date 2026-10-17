/** A3 How will you use it? Choice travels forward as a route param (the account doesn't exist yet). */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Peep, Sink, Text } from '@/components/bp';
import { useCopy } from '@/lib/i18n';
import type { UseIntent } from '@/lib/session';
import { cn } from '@/lib/utils';
import { onboardingCopy } from '@/screens/onboarding/copy';
import { OnbHeader, Rise } from '@/screens/onboarding/parts';

const TILES: { id: UseIntent; seeds: string[]; accent: number }[] = [
  { id: 'get', seeds: ['p5'], accent: -1 },
  { id: 'run', seeds: ['p3'], accent: 0 },
  { id: 'both', seeds: ['p16', 'p11'], accent: -1 },
];

export default function UseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const all = useCopy(onboardingCopy);
  const c = all.use;
  const [pick, setPick] = useState<UseIntent | null>(null);
  return (
    <View className="flex-1 bg-bg">
      <OnbHeader title={c.title} sub={c.sub} backLabel={all.back} className="pb-4" />
      <ScrollView className="flex-1" contentContainerClassName="gap-3.5 px-4 pb-4" accessibilityRole="radiogroup" accessibilityLabel={c.a11y}>
        {TILES.map((tile, i) => {
          const on = pick === tile.id;
          const text = c[tile.id];
          return (
            <Rise key={tile.id} index={i}>
              <Sink
                onPress={() => setPick(tile.id)}
                haptics="select"
                shadow={on ? 'paper' : 'none'}
                depth={6}
                radius={4}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${text.title}. ${text.line}`}
                style={{ marginRight: 6, marginBottom: 6 }}
                className={cn('min-h-[130px] flex-row items-stretch gap-2 overflow-hidden rounded-plate border-3 border-ink px-[18px] pt-[18px]', on ? 'bg-go' : 'bg-paper')}>
                <View className="flex-1 gap-1 pb-4">
                  <Text variant="title" className="text-[20px] leading-[22px] text-ink">
                    {text.title}
                  </Text>
                  <Text className="text-[15px] font-semibold text-ink">{text.line}</Text>
                </View>
                <View aria-hidden className="flex-row self-end" style={{ marginBottom: -18, marginRight: -6 }}>
                  {tile.seeds.map((s, k) => (
                    <View key={s} style={{ marginLeft: k ? -34 : 0 }}>
                      <Peep seed={s} size={84} accent={k === tile.accent} />
                    </View>
                  ))}
                </View>
              </Sink>
            </Rise>
          );
        })}
      </ScrollView>
      <View className="h-[100px] px-4 pt-3" style={{ paddingBottom: insets.bottom + 20 }}>
        {pick ? (
          <Rise from="up">
            <Button label={c.continue} onPress={() => router.push({ pathname: '/society', params: { use: pick } })} />
          </Rise>
        ) : null}
      </View>
    </View>
  );
}
