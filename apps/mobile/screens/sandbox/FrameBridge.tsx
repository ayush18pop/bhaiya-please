/**
 * Sandbox bridge, mounted once at the root (inside CoreProvider):
 * 1. Follows the sandbox clock: applies `{bp:'clock', offset}` posted by the split view (F5
 *    fast-forward) and re-syncs from the mock chain's persisted clock every few seconds.
 * 2. On phones (no split view), shows the compact guided-tour coach card while a tour runs.
 * Renders nothing outside the sandbox.
 */
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconButton, MelaLights, Text } from '@/components/bp';
import { useSession } from '@/components/providers';
import { Rise } from '@/screens/onboarding/parts';
import { setClockOffset } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { onAppEvent } from '@/lib/events';
import { fill, useCopy } from '@/lib/i18n';
import type { Mode } from '@/lib/session';
import { sandboxCopy, tourSteps } from './copy';
import { setTourStep, useTourStep } from './tourState';

function useClockSync() {
  const { core, sandbox } = useSession();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { bp?: string; offset?: number } | null;
      if (d && d.bp === 'clock' && typeof d.offset === 'number') setClockOffset(d.offset);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    const dev = core?.dev;
    if (!sandbox || !dev) return;
    const sync = () => setClockOffset(dev.now() - Math.floor(Date.now() / 1000));
    sync();
    const id = setInterval(sync, 4000);
    return () => clearInterval(id);
  }, [core, sandbox]);
}

function TourCoach() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCopy(sandboxCopy);
  const step = useTourStep();
  const { personas, mode, setMode } = useSession();
  const steps = tourSteps(personas ? aliasFor(personas.run) : 'the runner', personas ? aliasFor(personas.get) : 'the resident');
  const cur = step != null ? steps[step] : undefined;
  useEffect(() => {
    if (step == null) return;
    const off = onAppEvent((e) => {
      const s = steps[step];
      if (s?.done === e) setTourStep(Math.min(steps.length - 1, step + 1));
    });
    return () => {
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  if (step == null || !cur) return null;
  const want: Mode | null = cur.frame === 'get' || cur.frame === 'run' ? cur.frame : null;
  const role = want === 'run' ? c.split.runner : c.split.resident;
  const last = step === steps.length - 1;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 132, alignItems: 'center', zIndex: 900 }}>
      <Rise key={step} from="up" style={{ width: '94%', maxWidth: 440 }}>
        <View accessibilityRole="summary" accessibilityLiveRegion="polite" className="overflow-hidden rounded-block border-2 border-ink bg-paper" style={{ shadowColor: '#FFB400', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 }}>
          <MelaLights height={10} />
          <View className="gap-2 px-3.5 pb-3 pt-2">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 font-display text-[13px] text-ink">
                {c.coach.title.toUpperCase()} · {fill(c.split.stepOf, { n: step + 1, total: steps.length })}
              </Text>
              <IconButton icon={X} tone="ink" size={36} label={c.coach.skip} onPress={() => setTourStep(null)} />
            </View>
            <Text className="text-[17px] font-extrabold leading-[22px] text-ink">{cur.label}</Text>
            <Text className="text-[14px] font-semibold leading-[19px] text-ink">{cur.hint}</Text>
            <View className="flex-row flex-wrap gap-2 pt-0.5">
              {want && mode !== want ? (
                <Button
                  label={fill(c.coach.switchTo, { role })}
                  size="sm"
                  full={false}
                  onPress={() => {
                    setMode(want);
                    router.replace('/home');
                  }}
                />
              ) : null}
              <Button label={last ? c.coach.skip : c.coach.next} variant="paper" size="sm" full={false} onPress={() => setTourStep(last ? null : step + 1)} />
            </View>
          </View>
        </View>
      </Rise>
    </View>
  );
}

export function FrameBridge() {
  const { sandbox, framed } = useSession();
  useClockSync();
  if (!sandbox || framed) return null;
  return <TourCoach />;
}

export default FrameBridge;
