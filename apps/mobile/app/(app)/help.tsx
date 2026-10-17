/** D10 Help and safety: emergency numbers, the rules for both sides, FAQ, feedback. No support team needed. */
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { ChevronDown, Phone, ShieldAlert } from 'lucide-react-native';
import {
  Animated, Crowd, FadeIn, Icon, Screen, Text, TextButton, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useSession } from '@/components/providers';
import { fill, useCopy } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';

const FEEDBACK_URL = 'https://github.com/bhaiya-please/bhaiya-please/issues';

function Faq({ q, a, first, defaultOpen }: { q: string; a: string; first: boolean; defaultOpen?: boolean }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(!!defaultOpen);
  const r = useSharedValue(defaultOpen ? 180 : 0);
  const chev = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <View className={cn(!first && 'border-t-2 border-line')}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen((o) => !o);
          r.value = reduce ? (open ? 0 : 180) : withTiming(open ? 0 : 180, { duration: 150 });
        }}
        className="min-h-[56px] flex-row items-center justify-between gap-2.5 px-3.5 active:bg-raised">
        <Text className="flex-1 text-[16px] font-bold">{q}</Text>
        <Animated.View style={chev}>
          <Icon as={ChevronDown} size={20} />
        </Animated.View>
      </Pressable>
      {open ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(150)}>
          <Text className="px-3.5 pb-3.5 text-[15px] leading-[22px] text-muted">{a}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Banner: two people at the gate, the rules in one line. Decorative crowd. */
function GateBanner({ text }: { text: string }) {
  return (
    <View className="h-[170px] overflow-hidden rounded-block border-2 border-ink bg-paper">
      <Text className="z-10 max-w-[230px] px-4 pt-4 font-display text-[22px] leading-[25px] text-ink">{text}</Text>
      <View aria-hidden pointerEvents="none" className="absolute bottom-[-14px] right-[-6px] flex-row items-end">
        <View className="mb-[40px] mr-[-8px] h-[64px] w-[10px] border-2 border-ink bg-white" />
        <View className="mb-[96px] mr-[-60px] h-3 w-[70px] border-2 border-ink bg-yellow" />
        <Crowd seeds={['guard-2', 'rider-7']} size={112} overlap={0.12} accentIndex={1} />
      </View>
    </View>
  );
}

export default function Help() {
  const c = useCopy(sharedCopy).help;
  const { society } = useSession();
  return (
    <Screen title={c.title} contentClassName="gap-[18px] pb-10">
      <Rise index={0}>
        <GateBanner text={c.banner} />
      </Rise>
      <Rise index={1} className="gap-2">
        <Pressable accessibilityRole="link" accessibilityLabel={`${c.emergency}, call 112`} onPress={() => Linking.openURL('tel:112')} className="min-h-[56px] flex-row items-center gap-3 rounded-block border-2 border-mirchi bg-surface px-3.5 active:opacity-80">
          <Text className="font-display text-[20px] text-mirchi">112</Text>
          <Text className="flex-1 text-[16px] font-bold">{c.emergency}</Text>
          <Icon as={Phone} size={20} className="text-mirchi" />
        </Pressable>
        <View className="min-h-[56px] flex-row items-center gap-3 rounded-block border-2 border-paper bg-surface px-3.5 py-2.5">
          <Icon as={ShieldAlert} size={22} />
          <View className="flex-1">
            <Text className="text-[16px] font-bold">{fill(c.security, { society: society.name })}</Text>
            <Text className="text-[13px] text-muted">{c.securityHint}</Text>
          </View>
        </View>
      </Rise>
      <Rise index={2} className="gap-2">
        <Text className="text-[17px] font-extrabold">{c.rulesTitle}</Text>
        {c.rules.map((r, i) => (
          <View key={r} className="flex-row gap-2.5">
            <Text className="w-4 text-[15px] font-extrabold text-yellow">{i + 1}</Text>
            <Text className="flex-1 text-[15px] leading-[21px]">{r}</Text>
          </View>
        ))}
      </Rise>
      <Rise index={3} className="gap-2">
        <Text className="text-[17px] font-extrabold">{c.faqTitle}</Text>
        <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
          {c.faq.map((f, i) => (
            <Faq key={f.q} q={f.q} a={f.a} first={i === 0} defaultOpen={i === 0} />
          ))}
        </View>
      </Rise>
      <TextButton label={c.feedback} onPress={() => Linking.openURL(FEEDBACK_URL)} />
    </Screen>
  );
}
