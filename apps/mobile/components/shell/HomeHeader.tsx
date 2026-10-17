/**
 * Home header (Home screens only): society name (tap to change) + notification bell, and the mode
 * toggle (Get things / Run errands / Society desk) under it.
 */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, ChevronDown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, Segmented, Text } from '@/components/bp';
import { useSession } from '@/components/providers';
import { useT } from '@/lib/i18n';
import { useUnreadCount } from '@/lib/notifications';
import type { Mode } from '@/lib/session';
import { cn } from '@/lib/utils';

export function ModeToggle({ className }: { className?: string }) {
  const t = useT();
  const { mode, setMode, modes, framed } = useSession();
  if (framed) return null;
  const label: Record<Mode, string> = { get: t('mode.get'), run: t('mode.run'), desk: t('mode.desk') };
  return <Segmented className={className} options={modes.map((m) => ({ id: m, label: label[m] }))} value={mode} onChange={setMode} />;
}

export function HomeHeader({ title, overlay, showToggle = true }: { title?: string; overlay?: boolean; showToggle?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { society } = useSession();
  const unread = useUnreadCount();
  return (
    <View style={{ paddingTop: insets.top + 4 }} className={cn('gap-2 border-b-2 border-line bg-bg px-4 pb-3', overlay && 'z-10')}>
      <View className="h-14 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title ?? society.name}. Change society`}
          onPress={() => router.push('/society?change=1')}
          className="h-12 flex-row items-center gap-1.5 active:opacity-70">
          <Text className="text-[19px] font-bold" numberOfLines={1}>
            {title ?? society.name}
          </Text>
          <Icon as={ChevronDown} size={20} strokeWidth={2.5} />
        </Pressable>
        <IconButton icon={Bell} label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
      </View>
      {showToggle ? <ModeToggle /> : null}
    </View>
  );
}
