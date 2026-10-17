/**
 * Signed-in area. AccountGate: not onboarded → welcome (or sandbox start in the mock build); core
 * failed → maintenance poster; core starting → skeleton. Mounts app-wide watchers and the live strip
 * on stack screens (tab screens draw it above the tab bar).
 */
import { View } from 'react-native';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Poster, SkeletonCards } from '@/components/bp';
import { PingBeacon } from '@/components/PingBeacon';
import { useSession } from '@/components/providers';
import { AppWatchers } from '@/components/shell/AppWatchers';
import { LiveStrip } from '@/components/shell/LiveStrip';
import { C } from '@/lib/utils';

function Gate({ children }: { children: React.ReactNode }) {
  const { onboarded, guest, core, coreError, retryCore, mockBuild } = useSession();
  const insets = useSafeAreaInsets();
  if (!onboarded && !guest) return <Redirect href={mockBuild ? '/sandbox' : '/welcome'} />;
  if (coreError)
    return (
      <View className="flex-1 bg-bg p-4" style={{ paddingTop: insets.top + 16 }}>
        <Poster night lights title="Road work at the gate." body="Saving is paused for a few minutes. Your receipts are safe." action={{ label: 'Try again', onPress: retryCore, variant: 'secondary' }} />
      </View>
    );
  if (!core)
    return (
      <View className="flex-1 bg-bg p-4" style={{ paddingTop: insets.top + 72 }}>
        <SkeletonCards n={2} kind="map" />
      </View>
    );
  return <>{children}</>;
}

export default function AppLayout() {
  const segments = useSegments();
  const { mode, sandbox, guest } = useSession();
  const inTabs = segments.includes('(tabs)' as never);
  return (
    <Gate>
      <View className="flex-1 bg-bg">
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.ink }, animation: 'slide_from_right', animationDuration: 220 }}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        </Stack>
        {!inTabs ? <LiveStrip /> : null}
      </View>
      {!guest && (mode === 'run' || !sandbox) ? <PingBeacon /> : null}
      {!guest ? <AppWatchers /> : null}
    </Gate>
  );
}
