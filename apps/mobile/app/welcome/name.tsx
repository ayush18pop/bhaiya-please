/** A5 Your public name: candidate account + Shuffle + language. Continue creates the account. */
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Shuffle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Animated, Button, EASE, HardShadow, NamePlate, Peep, PrivacyLine, Sink, Text, useAnimatedStyle, useReducedMotion, useSharedValue, useThump, withTiming,
} from '@/components/bp';
import { useSession } from '@/components/providers';
import { aliasFor } from '@/lib/alias';
import { appEvent } from '@/lib/events';
import { fill, LANGUAGES, setLanguage, useCopy, useLanguage, useT } from '@/lib/i18n';
import { newWallet, type Language, type UseIntent } from '@/lib/session';
import { societyById } from '@/lib/societies';
import { cn } from '@/lib/utils';
import { onboardingCopy } from '@/screens/onboarding/copy';
import { OnbHeader } from '@/screens/onboarding/parts';

const USES: UseIntent[] = ['get', 'run', 'both'];

export default function NameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const all = useCopy(onboardingCopy);
  const c = all.name;
  const lang = useLanguage();
  const reduce = useReducedMotion();
  const { onboarded, finishOnboarding } = useSession();
  const params = useLocalSearchParams<{ use?: string; society?: string }>();
  const use: UseIntent = USES.includes(params.use as UseIntent) ? (params.use as UseIntent) : 'both';
  const societyId = societyById(params.society).id;

  const [wallet, setWallet] = useState(newWallet);
  const [n, setN] = useState(0);
  const name = aliasFor(wallet.address);

  // Plate spins on rotateX (300ms) on every shuffle; the bust thumps in.
  const spin = useSharedValue(0);
  useEffect(() => {
    if (n === 0 || reduce) return;
    spin.value = 0;
    spin.value = withTiming(360, { duration: 300, easing: EASE });
  }, [n, reduce, spin]);
  const plate = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateX: `${spin.value}deg` }] }));
  const bust = useThump(n, 0);

  if (onboarded) return <Redirect href="/home" />;

  return (
    <View className="flex-1 bg-bg">
      <OnbHeader title={c.title} backLabel={all.back} className="pb-2" />
      <ScrollView className="flex-1" contentContainerClassName="items-center gap-[22px] px-4 pb-6 pt-5">
        <Animated.View style={bust}>
          <HardShadow shadow="yellow" radius={999} className="h-[132px] w-[132px] items-center justify-end overflow-hidden rounded-pill border-3 border-paper bg-paper">
            <Peep seed={wallet.address} size={142} />
          </HardShadow>
        </Animated.View>
        <Animated.View style={plate} accessibilityLiveRegion="polite" accessibilityLabel={fill(all.name.a11yName, { name })}>
          <NamePlate name={name} size={30} />
        </Animated.View>
        <Button
          label={c.shuffle}
          icon={Shuffle}
          variant="secondary"
          size="md"
          full={false}
          wrapClassName="self-center"
          onPress={() => {
            setWallet(newWallet());
            setN((x) => x + 1);
          }}
        />
        <PrivacyLine text={t('privacy.signup')} className="max-w-[320px]" />

        <View className="w-full gap-2">
          <Text className="text-[14px] font-semibold">{c.language}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={c.language} className="flex-row gap-2">
            {LANGUAGES.map((l) => {
              const on = lang === l.id;
              return (
                <Sink
                  key={l.id}
                  onPress={() => setLanguage(l.id as Language)}
                  haptics="select"
                  shadow={on ? 'edge' : 'none'}
                  depth={3}
                  radius={999}
                  wrapClassName="flex-1"
                  style={{ marginRight: 3, marginBottom: 3 }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={l.label}
                  className={cn('h-12 items-center justify-center rounded-pill border-2', on ? 'border-ink bg-go' : 'border-edge')}>
                  <Text className={cn('text-[16px]', on ? 'font-extrabold text-ink' : 'font-bold')} style={l.id === 'kn' && Platform.OS !== 'web' ? { fontFamily: on ? 'BalooTamma2_800ExtraBold' : 'BalooTamma2_700Bold' } : undefined}>
                    {l.native}
                  </Text>
                </Sink>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View className="border-t-2 border-line px-4 pt-3" style={{ paddingBottom: insets.bottom + 20 }}>
        <Button
          label={fill(c.continueAs, { name })}
          onPress={() => {
            finishOnboarding(wallet, { use, societyId, language: lang });
            appEvent('onboarding.done');
            router.replace('/home');
          }}
        />
      </View>
    </View>
  );
}
