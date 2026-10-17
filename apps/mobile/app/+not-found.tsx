/** D11 Not found: paper poster, "अरे!", one way out, and a crowd with someone holding a GONE sign. */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Crowd, Text } from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useCopy } from '@/lib/i18n';
import { sharedCopy } from '@/screens/shared/copy';

export default function NotFound() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCopy(sharedCopy).system;
  return (
    <View className="flex-1 overflow-hidden bg-paper" style={{ paddingTop: insets.top }}>
      <Rise className="gap-4 px-6 pt-14">
        <Text className="font-hindi text-[36px] leading-[40px] text-ink">
          {c.kicker}
        </Text>
        <Text role="heading" className="font-display text-[44px] leading-[46px] text-ink">
          {c.notFound}
        </Text>
        <Text className="text-[17px] font-semibold leading-[25px] text-ink">{c.notFoundBody}</Text>
        <Button label={c.goHome} size="lg" full={false} onPress={() => router.replace('/')} className="px-7" />
      </Rise>
      <View aria-hidden pointerEvents="none" className="absolute -bottom-4 -left-8 -right-8 items-center" style={{ height: 330 }}>
        <View className="absolute bottom-[214px] left-[50%] ml-[-30px] border-3 border-ink bg-white px-3.5 py-2.5" style={{ transform: [{ rotate: '-4deg' }] }}>
          <Text className="font-display text-[18px] leading-[19px] text-ink">{c.sign}</Text>
        </View>
        <View className="absolute bottom-[166px] left-[50%] ml-[-2px] h-[52px] w-1 bg-ink" style={{ transform: [{ rotate: '-4deg' }] }} />
        <View className="absolute bottom-[70px] left-0 right-0 items-center">
          <Crowd seeds={['p1', 'p4', 'p9', 'p6', 'p26', 'p15']} size={120} overlap={0.34} />
        </View>
        <View className="absolute bottom-0 left-0 right-0 items-center">
          <Crowd seeds={['p20', 'p12', 'p5', 'p27']} size={140} overlap={0.33} accentIndex={0} />
        </View>
      </View>
    </View>
  );
}
