/** Bottom tabs (64px): Home · Activity · Profile. Active = paper block, ink icon, yellow hard shadow. */
import { Pressable, View } from 'react-native';
import { BadgeCheck, Home, List, User } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HardShadow, Icon, Text } from '@/components/bp';
import { useSession } from '@/components/providers';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { LiveStrip } from './LiveStrip';

/** Minimal shape of the tab bar props expo-router passes (react-navigation is vendored inside it). */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}

export function TabBar({ state, navigation }: TabBarProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { mode } = useSession();
  const tabs: Record<string, { label: string; icon: LucideIcon }> = {
    home: { label: t('tab.home'), icon: Home },
    activity: { label: mode === 'desk' ? 'Issued' : t('tab.activity'), icon: mode === 'desk' ? BadgeCheck : List },
    profile: { label: t('tab.profile'), icon: User },
  };
  return (
    <View>
      <LiveStrip />
      <View accessibilityRole="tablist" className="flex-row border-t-2 border-line bg-bg" style={{ height: 64 + insets.bottom, paddingBottom: insets.bottom }}>
        {state.routes.map((route, i) => {
          const tab = tabs[route.name];
          if (!tab) return null;
          const active = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !e.defaultPrevented) {
                  haptic.select();
                  navigation.navigate(route.name);
                }
              }}
              className="flex-1 items-center justify-center gap-0.5">
              {active ? (
                <HardShadow shadow="yellow" depth={2} radius={10} className="h-[30px] w-10 items-center justify-center rounded-[10px] border-2 border-ink bg-fg">
                  <Icon as={tab.icon} size={20} className="text-bg" />
                </HardShadow>
              ) : (
                <View className="h-[30px] w-10 items-center justify-center">
                  <Icon as={tab.icon} size={22} strokeWidth={2} className="text-muted" />
                </View>
              )}
              <Text className={cn('text-[12px]', active ? 'font-bold text-fg' : 'font-semibold text-muted')}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
