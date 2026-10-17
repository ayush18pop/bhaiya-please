/** "SANDBOX · NOTHING HERE IS REAL" marquee with mela-light ends, on every sandbox screen. */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MelaLights, Marquee, Text } from '@/components/bp';
import { useSession } from '@/components/providers';

export function SandboxBanner() {
  const router = useRouter();
  const { mode, setMode, modes } = useSession();
  const next = modes[(modes.indexOf(mode) + 1) % modes.length]!;
  const label = { get: 'Resident', run: 'Runner', desk: 'Desk' } as const;
  return (
    <View className="h-11 flex-row border-b-2 border-paper bg-ink">
      <MelaLights width={40} />
      <Pressable accessibilityRole="link" accessibilityLabel="Sandbox. Nothing here is real. Open sandbox controls" onPress={() => router.push('/sandbox')} className="flex-1 justify-center">
        <Marquee text="SANDBOX · NOTHING HERE IS REAL ·" className="px-3" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${label[next]}`}
        onPress={() => {
          setMode(next);
          router.replace('/home');
        }}
        className="justify-center border-l-2 border-paper bg-yellow px-3 active:opacity-80">
        <Text className="font-display text-[12px] text-ink">AS {label[mode].toUpperCase()} ⇄</Text>
      </Pressable>
    </View>
  );
}
