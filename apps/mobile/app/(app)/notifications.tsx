/**
 * D7 Notifications: in-app inbox grouped by day. Unread rows carry a coral bar; opening the screen marks
 * everything read (the bars stay for this visit so you can see what was new). Rows link to the screen.
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Crowd, Screen, Text, TextButton } from '@/components/bp';
import { useCopy } from '@/lib/i18n';
import { markAllRead, useNotifs, type Notif } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';
import { timeOf, Rise } from '@/screens/shared/parts';

function dayKey(unix: number) {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function Notifications() {
  const router = useRouter();
  const c = useCopy(sharedCopy).notifs;
  const list = useNotifs();
  const [unread, setUnread] = useState(() => new Set(list.filter((n) => !n.read).map((n) => n.id)));
  useEffect(() => {
    markAllRead();
  }, []);
  // New ones arriving while the screen is open are shown unread too, then marked read.
  useEffect(() => {
    const fresh = list.filter((n) => !n.read);
    if (!fresh.length) return;
    setUnread((s) => new Set([...s, ...fresh.map((n) => n.id)]));
    markAllRead();
  }, [list]);

  const today = dayKey(Date.now() / 1000);
  const yesterday = dayKey(Date.now() / 1000 - 86400);
  const groups: { day: string; items: Notif[] }[] = [];
  for (const n of list) {
    const k = dayKey(n.at);
    const label = k === today ? c.today : k === yesterday ? c.yesterday : new Date(n.at * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const g = groups[groups.length - 1];
    if (g && g.day === label) g.items.push(n);
    else groups.push({ day: label, items: [n] });
  }

  let i = 0;
  return (
    <Screen title={c.title} right={list.length ? <TextButton label={c.markAll} onPress={() => setUnread(new Set())} className="mr-1" /> : undefined} contentClassName="gap-2">
      {!list.length ? (
        <View className="overflow-hidden rounded-block border-2 border-ink bg-paper" style={{ minHeight: 380 }}>
          <View className="gap-3 px-6 pt-7">
            <Text className="font-display text-[30px] leading-[32px] text-ink">{c.emptyTitle}</Text>
            <Text className="text-[16px] font-semibold leading-[23px] text-ink">{c.emptyBody}</Text>
          </View>
          <View aria-hidden pointerEvents="none" className="absolute -bottom-3 -left-5 -right-5" style={{ height: 160 }}>
            <Crowd seeds={['guard-2', 'p12', 'auntie-2', 'kid-3', 'p5', 'dada-4']} size={118} className="absolute bottom-0 left-2" />
          </View>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.day} className="gap-2">
            <Text className="mt-2 text-[14px] font-bold text-muted">{g.day}</Text>
            {g.items.map((n) => (
              <Rise key={n.id} index={i++}>
                <Pressable
                  onPress={() => n.href && router.push(n.href as never)}
                  disabled={!n.href}
                  accessibilityRole={n.href ? 'link' : undefined}
                  accessibilityLabel={`${unread.has(n.id) ? 'Unread. ' : ''}${n.title}. ${n.body ?? ''}`}
                  className="flex-row overflow-hidden rounded-block border-2 border-line bg-surface active:bg-raised">
                  <View className={cn('w-1.5', unread.has(n.id) ? 'bg-mirchi' : 'bg-transparent')} />
                  <View className="flex-1 gap-0.5 px-3 py-2.5">
                    <View className="flex-row justify-between gap-2">
                      <Text className="flex-shrink text-[15px] font-extrabold">{n.title}</Text>
                      <Text className="text-[12px] text-muted">{timeOf(n.at)}</Text>
                    </View>
                    {n.body ? <Text className="text-[14px] leading-[19px] text-muted">{n.body}</Text> : null}
                  </View>
                </Pressable>
              </Rise>
            ))}
          </View>
        ))
      )}
      <Text className="mt-3 text-center text-[13px] text-muted">{c.note}</Text>
    </Screen>
  );
}
