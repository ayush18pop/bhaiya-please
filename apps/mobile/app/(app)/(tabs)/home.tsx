/** Home tab: B1 (Get things), C2/C4 (Run errands), E1 (Society desk). Crossfades on mode switch. */
import { View } from 'react-native';
import { Animated, FadeIn } from '@/components/bp';
import { useSession } from '@/components/providers';
import DeskHome from '@/screens/desk/DeskHome';
import ResidentHome from '@/screens/resident/ResidentHome';
import RunnerHome from '@/screens/runner/RunnerHome';

export default function Home() {
  const { mode } = useSession();
  return (
    <View className="flex-1 bg-bg">
      <Animated.View key={mode} entering={FadeIn.duration(220)} style={{ flex: 1 }}>
        {mode === 'get' ? <ResidentHome /> : mode === 'run' ? <RunnerHome /> : <DeskHome />}
      </Animated.View>
    </View>
  );
}
