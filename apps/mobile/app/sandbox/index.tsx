/** F1 Sandbox start (mock build only; the real build redirects to the app). */
import { Linking, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Button, HardShadow, Text, TextButton } from '@/components/bp';
import { useSession } from '@/components/providers';
import { REAL_APP_URL } from '@/lib/core';
import { useCopy } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Lockup, Rise } from '@/screens/onboarding/parts';
import { sandboxCopy } from '@/screens/sandbox/copy';
import { CrowdBanner, SandboxStrip } from '@/screens/sandbox/parts';
import { setTourStep } from '@/screens/sandbox/tourState';

export default function SandboxStart() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const c = useCopy(sandboxCopy).start;
  const banner = useCopy(sandboxCopy).banner;
  const { mockBuild, startSandbox } = useSession();
  if (!mockBuild) return <Redirect href="/" />;
  const wide = width >= 900;

  const tour = () => {
    startSandbox('get');
    if (wide && Platform.OS === 'web') {
      setTourStep(null);
      router.push('/sandbox/split?tour=1');
    } else {
      setTourStep(0);
      router.replace('/home');
    }
  };
  const explore = () => {
    setTourStep(null);
    startSandbox('get');
    router.replace('/home');
  };

  return (
    <View className="flex-1 bg-bg">
      <SandboxStrip text={`${banner} ·`} />
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className={cn('flex-1 justify-center', wide ? 'flex-row items-center gap-14 px-24 pb-10 pt-14' : 'gap-8 px-4 pb-8 pt-8')}>
          <Rise className={cn('gap-[26px]', wide && 'flex-[7]')}>
            <Lockup height={wide ? 96 : 64} />
            <Text variant="display-xl" className={cn(wide ? 'text-[64px] leading-[64px]' : 'text-[40px] leading-[42px]')}>
              {c.title}
            </Text>
            <Text className={cn('max-w-[640px] text-muted', wide ? 'text-[21px] leading-[30px]' : 'text-[17px] leading-[25px]')}>{c.pitch}</Text>
            <View className={cn('gap-4', wide ? 'flex-row items-center' : '')}>
              <Button label={c.tour} size="xl" full={!wide} onPress={tour} />
              <Button label={c.explore} variant="secondary" size="xl" full={!wide} onPress={explore} />
            </View>
            <View className="flex-row flex-wrap gap-x-6">
              <TextButton label={c.real} onPress={() => Linking.openURL(REAL_APP_URL)} />
              <TextButton label={c.signup} onPress={() => router.push('/welcome')} />
            </View>
            <Text className="text-[14px] text-muted">{c.note}</Text>
          </Rise>
          <Rise index={2} className={cn(wide && 'flex-[5]')} style={{ transform: [{ rotate: '1.5deg' }] }}>
            <HardShadow shadow="yellow" depth={6} className="gap-3 rounded-block border-2 border-ink bg-paper p-6">
              <Text variant="title" className="text-[20px] text-ink">
                {c.loopTitle}
              </Text>
              {c.loop.map((line, i) => (
                <View key={i} className="flex-row items-center gap-3">
                  <View className="h-8 w-8 items-center justify-center rounded-plate border-2 border-ink">
                    <Text className="font-display text-[15px] text-ink">{i + 1}</Text>
                  </View>
                  <Text className="flex-1 text-[17px] font-bold text-ink">{line}</Text>
                </View>
              ))}
            </HardShadow>
          </Rise>
        </View>
        <CrowdBanner height={wide ? 230 : 170} />
      </ScrollView>
    </View>
  );
}
