/** C1 Runner setup (first time only): how it works → levels → gate rules → live location (+ optional UPI QR). */
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Check, ChevronLeft, ClipboardPaste, Plus, QrCode } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TierName } from '@bhaiya-please/core';
import {
  Animated, Button, DUR, EASE, Field, Footer, FadeIn, Icon, IconButton, LevelPlate, LEVEL_LIMITS, PrivacyLine, SlideInRight, SunlightScope, Text,
  useReducedMotion,
} from '@/components/bp';
import { useSession } from '@/components/providers';
import { useProfile } from '@/hooks/queries';
import { pasteText } from '@/lib/clipboard';
import { haptic } from '@/lib/haptics';
import { fill, t, useCopy } from '@/lib/i18n';
import { getSharing } from '@/lib/sharing';
import { cn } from '@/lib/utils';
import { runnerCopy } from '@/screens/runner/copy';
import { UpiSetup } from '@/screens/runner/UpiSetup';

const STEPS = 4;

export default function RunnerSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const c = useCopy(runnerCopy);
  const { address, prefs, setPrefs } = useSession();
  const profile = useProfile(address);
  const [step, setStep] = useState(0);
  const [asking, setAsking] = useState(false);
  const [denied, setDenied] = useState(false);
  const last = step === STEPS - 1;

  const finish = async () => {
    setAsking(true);
    let share = prefs.shareLocation;
    // Explainer first (this screen), then the system prompt — only when real GPS will be used.
    if (Platform.OS !== 'web' && !getSharing().simulate) {
      try {
        const p = await Location.requestForegroundPermissionsAsync();
        if (p.status !== 'granted') {
          share = false;
          setDenied(true);
        }
      } catch {
        share = false;
      }
    }
    setAsking(false);
    setPrefs((p) => ({ runnerSetup: { ...p.runnerSetup, [address ?? '']: true }, shareLocation: share }));
    haptic.success();
    router.replace('/runner/start');
  };

  return (
    <SunlightScope>
      <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
        <View className="min-h-[56px] flex-row items-center justify-between px-1.5">
          <IconButton icon={ChevronLeft} label={c.setup.step} onPress={() => (step ? setStep(step - 1) : router.canGoBack() ? router.back() : router.replace('/home'))} />
          <Text className="pr-3 text-[15px] font-bold text-muted">{fill(c.setup.step, { n: step + 1, total: STEPS })}</Text>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS, now: step + 1 }} className="flex-row gap-2 px-4 pb-2">
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} className={cn('h-2.5 flex-1 rounded-[2px] border-2 border-edge', i <= step ? 'bg-yellow' : 'bg-transparent')} />
          ))}
        </View>
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-4">
          <Animated.View key={step} entering={reduce ? FadeIn.duration(DUR.quick) : SlideInRight.duration(DUR.base).easing(EASE)} className="gap-5">
            {step === 0 ? <How /> : step === 1 ? <Levels current={profile.data?.tier.name ?? 'new'} /> : step === 2 ? <Rules /> : <LocationStep denied={denied} />}
          </Animated.View>
        </ScrollView>
        <Footer runner>
          {last ? (
            <Button label={Platform.OS === 'web' || getSharing().simulate ? c.setup.start : c.setup.allowStart} size="xl" loading={asking} onPress={finish} />
          ) : (
            <Button label={c.setup.next} size="xl" onPress={() => setStep(step + 1)} />
          )}
        </Footer>
      </View>
    </SunlightScope>
  );
}

function How() {
  const c = useCopy(runnerCopy);
  return (
    <>
      <Text variant="display">{c.setup.howTitle}</Text>
      <View className="gap-3">
        {c.setup.how.map((line, i) => (
          <View key={i} className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-plate border-2 border-edge">
              <Text className="font-display text-[15px]">{i + 1}</Text>
            </View>
            <Text className="flex-1 text-[17px] font-bold leading-[22px]">{line}</Text>
          </View>
        ))}
      </View>
      <Text className="text-[15px] leading-[21px] text-muted">{c.setup.howNote}</Text>
    </>
  );
}

function Levels({ current }: { current: TierName }) {
  const c = useCopy(runnerCopy);
  const rows: [TierName, string][] = [
    ['new', c.setup.newLine],
    ['verified', c.setup.verifiedLine],
    ['trusted', c.setup.trustedLine],
  ];
  return (
    <>
      <Text variant="display">{c.setup.levelsTitle}</Text>
      <View className="gap-3.5">
        {rows.map(([lvl, line]) => {
          const on = lvl === current;
          return (
            <View key={lvl} className={cn('gap-2 rounded-block bg-surface p-4', on ? 'border-3 border-yellow' : 'border-2 border-line')}>
              <View className="flex-row items-center justify-between">
                <LevelPlate level={lvl} size="md" />
                {on ? <Icon as={Check} size={20} strokeWidth={3} className="text-yellow" /> : null}
              </View>
              <Text className="text-[17px] font-bold">{LEVEL_LIMITS[lvl].replace('per run', lvl === 'new' ? 'request per run' : 'per run')}</Text>
              <Text className="text-[14px] text-muted">{line}</Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function Rules() {
  const c = useCopy(runnerCopy);
  return (
    <>
      <Text variant="display">{c.setup.rulesTitle}</Text>
      <View className="gap-3">
        {c.setup.rules.map((r, i) => (
          <View key={i} className="min-h-[56px] flex-row items-center gap-3 rounded-block border-2 border-line bg-surface px-4">
            <Text className="font-display text-[18px] text-yellow">{i + 1}</Text>
            <Text className="flex-1 text-[17px] font-bold">{r}</Text>
          </View>
        ))}
      </View>
      <Text className="text-[15px] font-semibold leading-[21px]">{c.setup.rulesNote}</Text>
    </>
  );
}

function LocationStep({ denied }: { denied: boolean }) {
  const c = useCopy(runnerCopy);
  return (
    <>
      <Text variant="display">{c.setup.locTitle}</Text>
      <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
        {c.setup.loc.map(([k, v], i) => (
          <View key={k} className={cn('gap-0.5 px-4 py-3', i < c.setup.loc.length - 1 && 'border-b-2 border-line')}>
            <Text className="text-[13px] font-semibold text-muted">{k}</Text>
            <Text className="text-[16px] font-bold">{v}</Text>
          </View>
        ))}
      </View>
      <PrivacyLine text={t('privacy.location')} />
      {denied ? <Text className="text-[14px] font-semibold text-mirchi">{c.setup.locDenied}</Text> : Platform.OS !== 'web' && !getSharing().simulate ? <Text className="text-[14px] text-muted">{c.setup.locNote}</Text> : null}
      <UpiSetup />
    </>
  );
}
