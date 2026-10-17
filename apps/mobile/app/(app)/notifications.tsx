/**
 * D7 Notifications: in-app inbox grouped by day. Unread rows carry a coral bar; opening the screen marks
 * everything read (the bars stay for this visit so you can see what was new). Rows link to the screen.
 * Rows that came from an alert (Arkiv Triggers) say "via Arkiv Trigger" and open the alert's signed
 * receipt: plain words first, IDs under Advanced.
 */
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronDown, ExternalLink, Radio } from 'lucide-react-native';
import type { EntityKey } from '@bhaiya-please/core';
import { Animated, Crowd, FadeIn, Icon, Screen, Sheet, Text, TextButton, useReducedMotion } from '@/components/bp';
import { useSession } from '@/components/providers';
import { useInspect } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { copyText } from '@/lib/clipboard';
import { fill, useCopy } from '@/lib/i18n';
import { markAllRead, useNotifs, type AlertReceipt, type Notif } from '@/lib/notifications';
import { useChannel } from '@/lib/triggers';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';
import { dayTime, timeOf, Rise } from '@/screens/shared/parts';

/** The alert's receipt in plain words; record IDs and the block only under Advanced. */
function FiringSheet({ r, onClose }: { r: AlertReceipt | null; onClose: () => void }) {
  const c = useCopy(sharedCopy).firing;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const inspect = useInspect((r?.receipt ?? undefined) as EntityKey | undefined, !!r?.receipt && open);
  useEffect(() => setOpen(false), [r?.receipt, r?.trigger]);
  const row = (label: string, value: string) => (
    <Pressable key={label} onPress={() => copyText(value, `${label} copied`)} accessibilityRole="button" accessibilityLabel={`${label}. Copy`} className="gap-0.5 py-1 active:opacity-70">
      <Text className="text-[13px] font-semibold text-muted">{label}</Text>
      <Text selectable className="text-[14px] leading-[19px]" style={{ fontFamily: 'monospace' }}>
        {value}
      </Text>
    </Pressable>
  );
  return (
    <Sheet open={!!r} onClose={onClose} title={c.title} scroll>
      {r ? (
        <>
          <Text className="text-[15px] leading-[21px] text-muted">{c.body}</Text>
          <View className="gap-2 rounded-block border-2 border-line bg-surface p-3.5">
            <View className="flex-row items-center gap-2.5">
              <Icon as={Check} size={20} strokeWidth={3} className={r.outcome === 'failed' ? 'text-mirchi' : 'text-go'} />
              <Text className="flex-1 text-[16px] font-bold">{c.outcome[r.outcome]}</Text>
            </View>
            <Text className="text-[15px]">{fill(c.checkedAt, { time: dayTime(r.at) })}</Text>
            <Text className="text-[15px]">{fill(c.by, { name: aliasFor(r.worker) })}</Text>
          </View>
          <View className="border-t-2 border-line pt-1.5">
            <Pressable onPress={() => setOpen((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="min-h-[44px] flex-row items-center justify-between active:opacity-70">
              <Text className="text-[16px] font-bold">{c.advanced}</Text>
              <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                <Icon as={ChevronDown} size={20} />
              </View>
            </Pressable>
            {open ? (
              <Animated.View entering={reduce ? undefined : FadeIn.duration(150)} className="gap-1.5 pb-1">
                {r.receipt ? row(c.receiptId, r.receipt) : null}
                {row(c.trigger, r.trigger)}
                {row(c.entity, r.entity)}
                {row(c.event, r.event)}
                {row(c.worker, r.worker)}
                {r.block ? row(c.block, r.block) : null}
                {inspect.data?.explorerUrl ? <TextButton label={c.explorer} tone="yellow" icon={ExternalLink} onPress={() => Linking.openURL(inspect.data!.explorerUrl!)} /> : null}
              </Animated.View>
            ) : null}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

function dayKey(unix: number) {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function Notifications() {
  const router = useRouter();
  const c = useCopy(sharedCopy).notifs;
  const via = useCopy(sharedCopy).firing.via;
  const { address } = useSession();
  const channel = useChannel(address);
  const [receipt, setReceipt] = useState<AlertReceipt | null>(null);
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
                    {n.alert ? (
                      <Pressable
                        onPress={() => setReceipt(n.alert!)}
                        accessibilityRole="button"
                        accessibilityLabel={`${via}. ${c.receiptOpen}`}
                        hitSlop={8}
                        className="mt-1 flex-row items-center gap-1.5 self-start active:opacity-70">
                        <Icon as={Radio} size={14} className="text-yellow" />
                        <Text className="text-[13px] font-bold text-yellow underline">{via}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              </Rise>
            ))}
          </View>
        ))
      )}
      <View className="mt-3 items-center gap-1">
        <Text className="text-center text-[13px] text-muted">{channel ? c.notePush : c.note}</Text>
        {!channel ? <TextButton label={c.pushCta} tone="yellow" onPress={() => router.push('/settings/notifications')} /> : null}
      </View>
      <FiringSheet r={receipt} onClose={() => setReceipt(null)} />
    </Screen>
  );
}
