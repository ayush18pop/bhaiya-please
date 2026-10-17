/**
 * D11 Maintenance: night poster with mela lights. "Try again" re-creates the connection; if it comes
 * back the app continues home, otherwise it says so plainly. Rendered outside the account gate.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { Button, Crowd, MelaLights, Text } from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useSession } from '@/components/providers';
import { useCopy } from '@/lib/i18n';
import { C } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';

function Barricade() {
  return (
    <Svg viewBox="0 0 438 120" width={438} height={120} style={{ marginBottom: -40 }}>
      <G fill={C.yellow} stroke={C.ink} strokeWidth={3}>
        <Path d="M60 118 L 80 40 L 100 118 Z" />
        <Path d="M330 118 L 350 40 L 370 118 Z" />
      </G>
      <G fill={C.ink}>
        <Rect x={68} y={70} width={24} height={10} />
        <Rect x={338} y={70} width={24} height={10} />
      </G>
      <Rect x={80} y={54} width={270} height={14} fill={C.paper} stroke={C.ink} strokeWidth={3} />
      <G fill={C.mirchi}>
        {[110, 160, 210, 260, 310].map((x) => (
          <Rect key={x} x={x} y={54} width={22} height={14} />
        ))}
      </G>
    </Svg>
  );
}

export default function Maintenance() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCopy(sharedCopy).system;
  const { core, coreError, retryCore, onboarded } = useSession();
  const [phase, setPhase] = useState<'idle' | 'checking' | 'still'>('idle');
  useEffect(() => {
    if (phase !== 'checking') return;
    if (core && !coreError) router.replace(onboarded ? '/home' : '/');
    else if (coreError) {
      const t = setTimeout(() => setPhase('still'), 900);
      return () => clearTimeout(t);
    }
  }, [phase, core, coreError, onboarded, router]);
  return (
    <View className="flex-1 overflow-hidden bg-ink" style={{ paddingTop: insets.top }}>
      <MelaLights height={32} marquee className="border-b-2 border-paper" />
      <Rise className="gap-4 px-6 pt-10">
        <Text role="heading" className="font-display text-[44px] leading-[46px] text-paper">
          {c.maintTitle}
        </Text>
        <Text className="text-[17px] leading-[25px] text-muted">{c.maintBody}</Text>
        <Button
          label={c.tryAgain}
          variant="secondary"
          size="lg"
          full={false}
          state={phase === 'checking' ? 'saving' : 'idle'}
          savingLabel={c.checking}
          onPress={() => {
            setPhase('checking');
            retryCore();
            setTimeout(() => setPhase((p) => (p === 'checking' ? 'still' : p)), 4000);
          }}
          className="px-7"
        />
        {phase === 'still' ? (
          <Text accessibilityRole="alert" className="text-[15px] font-bold text-yellow">
            {c.still}
          </Text>
        ) : null}
      </Rise>
      <View aria-hidden pointerEvents="none" className="absolute -bottom-3.5 -left-6 -right-6 items-center">
        <Barricade />
        <Crowd seeds={['p30', 'p38', 'p46', 'p2', 'p21']} size={134} overlap={0.33} accentIndex={2} tone="night" />
      </View>
    </View>
  );
}
