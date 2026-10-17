/**
 * F2–F5 Sandbox split view (desktop web): resident and runner phones side by side as iframes sharing
 * the mock chain through localStorage, a guided tour that advances on app events posted by the
 * frames, "How it works" callouts, and sandbox controls (clock, reset, movement, new tabs).
 * Native: redirects to Home (phones use the compact tour coach instead).
 */
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { BellRing, ExternalLink, FastForward, Footprints, Lightbulb, RotateCcw, X } from 'lucide-react-native';
import { Button, HardShadow, Icon, IconButton, Meter, Stamp, Switch, Text, TextButton } from '@/components/bp';
import { useSession } from '@/components/providers';
import { Rise } from '@/screens/onboarding/parts';
import { setClockOffset } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { createCore, type AnyCore } from '@/lib/core';
import { fill, useCopy } from '@/lib/i18n';
import { ensurePersonas, openModeInNewTab, setSandboxFlag, wipeSandbox, type Mode, type Wallet } from '@/lib/session';
import { C, cn } from '@/lib/utils';
import { sandboxCopy, tourSteps, type TourStep } from '@/screens/sandbox/copy';
import { SandboxStrip } from '@/screens/sandbox/parts';

const realNow = () => Math.floor(Date.now() / 1000);
const SIDE_L = 268;
const SIDE_R = 248;

function PhoneFrame({
  mode, title, width, height, target, nonce, register,
}: { mode: Mode; title: string; width: number; height: number; target: boolean; nonce: number; register: (m: Mode, el: HTMLIFrameElement | null) => void }) {
  const src = `/home?sandbox=1&frame=${mode}`;
  const iframe = createElement('iframe', {
    key: nonce,
    src,
    title,
    ref: (el: HTMLIFrameElement | null) => register(mode, el),
    allow: 'camera; clipboard-read; clipboard-write; geolocation',
    style: { width: width - 6, height: height - 6, border: 0, display: 'block', background: C.ink, borderRadius: 25 },
  });
  return (
    <View className="items-center gap-2.5">
      <Text className="text-[15px] font-extrabold">{title}</Text>
      <HardShadow shadow={target ? 'yellow' : 'none'} depth={8} radius={28} className={cn('overflow-hidden rounded-[28px] border-3', target ? 'border-yellow' : 'border-paper')}>
        <View style={{ width: width - 6, height: height - 6 }}>{iframe}</View>
      </HardShadow>
    </View>
  );
}

function StepNav({ steps, step, onGo }: { steps: TourStep[]; step: number; onGo: (i: number) => void }) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel="Guided tour" className="flex-1 flex-row gap-2.5">
      {steps.map((s, i) => {
        const cur = i === step;
        const done = i < step;
        return (
          <Pressable
            key={i}
            onPress={() => onGo(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: cur }}
            style={cur ? { shadowColor: C.paper, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 } : undefined}
            className={cn('min-h-[64px] flex-1 flex-row items-center gap-2.5 rounded-block px-3 py-2', cur ? 'border-3 border-ink bg-yellow' : done ? 'border-2 border-go bg-surface' : 'border-2 border-line bg-surface')}>
            <Text className={cn('font-display text-[13px]', cur ? 'text-ink' : done ? 'text-go' : 'text-fg')}>{done ? '✓' : i + 1}</Text>
            <Text numberOfLines={3} className={cn('flex-1 text-[13px] font-bold leading-[16px]', cur ? 'text-ink' : done ? 'text-go' : 'text-fg')}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Callout({ title, body, onDismiss, dismissLabel, icon = Lightbulb, foot }: { title: string; body: string; onDismiss: () => void; dismissLabel: string; icon?: typeof X; foot?: string }) {
  return (
    <Rise>
      <HardShadow shadow="yellow" className="gap-2.5 rounded-block border-2 border-ink bg-paper p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-shrink flex-row items-center gap-2">
            <Icon as={icon} size={20} className="text-cng" />
            <Text className="font-display text-[15px] text-ink">{title}</Text>
          </View>
          <IconButton icon={X} tone="ink" size={40} label={dismissLabel} onPress={onDismiss} />
        </View>
        <Text className="text-[15px] font-semibold leading-[22px] text-ink">{body}</Text>
        {foot ? <Text className="font-display text-[13px] text-ink">{foot}</Text> : null}
      </HardShadow>
    </Rise>
  );
}

function CtlButton({ label, icon, onPress, disabled }: { label: string; icon?: typeof X; onPress: () => void; disabled?: boolean }) {
  return <Button label={label} icon={icon} variant="secondary" size="sm" full onPress={onPress} disabled={disabled} className="min-h-[44px] px-3" />;
}

export default function SandboxSplit() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tour?: string }>();
  const { width, height } = useWindowDimensions();
  const cc = useCopy(sandboxCopy);
  const c = cc.split;
  const { mockBuild, startSandbox } = useSession();
  const web = Platform.OS === 'web';

  const [personas, setPersonas] = useState<Record<Mode, Wallet> | null>(() => {
    if (!mockBuild || !web) return null;
    setSandboxFlag(true);
    return ensurePersonas(); // before the frames mount, so both frames share the same personas
  });
  useEffect(() => {
    if (mockBuild && web) startSandbox('get');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [core, setCore] = useState<AnyCore | null>(null);
  useEffect(() => {
    if (!personas) return;
    let dead = false;
    let made: AnyCore | null = null;
    createCore(personas.desk, personas.desk.address).then((x) => {
      made = x;
      if (dead) x.close();
      else setCore(x);
    });
    return () => {
      dead = true;
      made?.close();
    };
  }, [personas]);

  const runner = personas ? aliasFor(personas.run.address) : 'Runner';
  const resident = personas ? aliasFor(personas.get.address) : 'Resident';
  const steps = useMemo(() => tourSteps(runner, resident), [runner, resident]);
  const [touring, setTouring] = useState(params.tour === '1');
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [how, setHow] = useState(true);
  const [dismissed, setDismissed] = useState<Record<number, boolean>>({});
  const [desk, setDesk] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [offsetMin, setOffsetMin] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [fired, setFired] = useState(0);
  const [triggersHidden, setTriggersHidden] = useState(false);
  const frames = useRef<Partial<Record<Mode, HTMLIFrameElement | null>>>({});
  const stepRef = useRef(step);
  stepRef.current = step;

  const register = useCallback((m: Mode, el: HTMLIFrameElement | null) => {
    frames.current[m] = el;
  }, []);

  const post = useCallback((msg: object) => {
    if (typeof window === 'undefined') return;
    for (const el of Object.values(frames.current)) {
      try {
        el?.contentWindow?.postMessage(msg, window.location.origin);
      } catch {}
    }
  }, []);

  // F2: auto-advance on events the frames post with appEvent().
  useEffect(() => {
    if (!web || typeof window === 'undefined') return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { bp?: string; type?: string } | null;
      if (!d || d.bp !== 'event') return;
      if (d.type === 'trigger.fired') {
        setFired((n) => n + 1);
        setTriggersHidden(false);
        return;
      }
      const cur = steps[stepRef.current];
      if (cur?.done && cur.done === d.type) {
        if (stepRef.current >= steps.length - 1) setFinished(true);
        else setStep(stepRef.current + 1);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [web, steps]);

  const syncClock = useCallback(() => {
    if (!core?.dev) return;
    const offset = core.dev.now() - realNow();
    setClockOffset(offset);
    setOffsetMin(Math.round(offset / 60));
    post({ bp: 'clock', offset });
  }, [core, post]);
  useEffect(() => {
    syncClock();
  }, [syncClock]);

  const ff = (sec: number) => {
    core?.dev?.advance(sec);
    syncClock();
  };

  const reset = async () => {
    setResetting(true);
    try {
      core?.dev?.reset();
      await new Promise((r) => setTimeout(r, 1200)); // let the reseed persist before the frames reload
      wipeSandbox();
      setSandboxFlag(true);
      setClockOffset(0);
      setOffsetMin(0);
      setPersonas(ensurePersonas());
      setStep(0);
      setFinished(false);
      setDismissed({});
      setNonce((n) => n + 1);
    } finally {
      setResetting(false);
    }
  };

  if (!mockBuild) return <Redirect href="/" />;
  if (!web) return <Redirect href="/home" />;

  if (width < 900) {
    return (
      <View className="flex-1 bg-bg">
        <SandboxStrip text={`${cc.banner} ·`} height={44} />
        <View className="flex-1 justify-center gap-4 p-6">
          <Text variant="title">{c.narrow}</Text>
          <Button label={c.openPhone} onPress={() => router.replace('/home')} />
        </View>
      </View>
    );
  }

  const cur = steps[step]!;
  const showLeft = !desk;
  const n = desk ? 3 : 2;
  const gap = 40;
  const avail = width - 64 - SIDE_R - 32 - (showLeft ? SIDE_L + 32 : 0);
  const fw = Math.max(280, Math.min(380, Math.floor((avail - gap * (n - 1)) / n)));
  const fh = Math.max(560, Math.min(780, height - (touring ? 236 : 150)));
  const target = (m: Mode) => touring && !finished && (cur.frame === m || (cur.frame === 'both' && m !== 'desk'));
  const stepCallout = how && !dismissed[step] ? <Callout title={c.howItWorks} body={cur.how} dismissLabel={c.dismiss} onDismiss={() => setDismissed((d) => ({ ...d, [step]: true }))} /> : null;
  const triggersCallout =
    how && !triggersHidden ? (
      <Callout
        icon={BellRing}
        title={c.triggersTitle}
        body={c.triggersBody}
        foot={fired ? fill(c.triggersFired, { n: fired, s: fired === 1 ? '' : 's' }) : undefined}
        dismissLabel={c.dismiss}
        onDismiss={() => setTriggersHidden(true)}
      />
    ) : null;
  const callout = (
    <>
      {stepCallout}
      {triggersCallout}
    </>
  );

  const tourCard = touring ? (
    <View className="gap-3 rounded-block border-2 border-paper bg-raised p-4">
      <Text className="text-[13px] font-bold text-muted">{fill(c.stepOf, { n: step + 1, total: steps.length })}</Text>
      {/* progress meter */}
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: step + (finished ? 1 : 0) }} className="h-3 flex-row gap-1">
        {steps.map((_, i) => (
          <View key={i} className={cn('flex-1 rounded-[2px] border-2', i < step || finished ? 'border-go bg-go' : i === step ? 'border-yellow bg-yellow' : 'border-line')} />
        ))}
      </View>
      {finished ? (
        <Rise className="items-start gap-2">
          <Stamp ring="TOUR DONE · TOUR DONE ·" check size={84} animate={finished} />
          <Text className="text-[16px] font-bold">{c.done}</Text>
        </Rise>
      ) : (
        <Rise key={step} className="gap-1.5">
          <Text className="text-[18px] font-extrabold leading-[23px]">{cur.label}</Text>
          <Text className="text-[14px] leading-[20px] text-muted">{cur.hint}</Text>
          {cur.done ? <Text className="text-[13px] font-semibold text-yellow">{c.waiting}</Text> : null}
        </Rise>
      )}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label={c.back} variant="secondary" size="sm" full disabled={step === 0 && !finished} onPress={() => (finished ? setFinished(false) : setStep((s) => Math.max(0, s - 1)))} />
        </View>
        <View className="flex-1">
          <Button label={c.next} size="sm" full disabled={finished} onPress={() => (step >= steps.length - 1 ? setFinished(true) : setStep(step + 1))} />
        </View>
      </View>
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-bg">
      <SandboxStrip
        text={`${cc.banner} ·`}
        height={44}
        right={
          <Pressable accessibilityRole="link" onPress={() => router.push('/sandbox')} className="justify-center px-5 active:opacity-70">
            <Text className="text-[14px] font-bold underline" style={{ textDecorationLine: 'underline' }}>
              {touring ? c.exit : '← Sandbox'}
            </Text>
          </Pressable>
        }
      />

      {touring ? (
        <View className="flex-row items-stretch gap-2.5 px-8 py-4">
          <StepNav steps={steps} step={finished ? steps.length : step} onGo={(i) => (setFinished(false), setStep(i))} />
          <View className="justify-center gap-1.5">
            <Button label={c.skip} variant="secondary" size="sm" full={false} className="min-h-[36px] px-3" onPress={() => (step >= steps.length - 1 ? setFinished(true) : setStep(step + 1))} />
            <Button label={c.restart} variant="secondary" size="sm" full={false} className="min-h-[36px] border-line px-3" onPress={() => (setStep(0), setFinished(false), setDismissed({}))} />
          </View>
        </View>
      ) : null}

      <View className="flex-1 flex-row justify-center gap-8 px-8 pb-6 pt-2">
        {showLeft ? (
          <View style={{ width: SIDE_L }} className="gap-4 pt-9">
            {tourCard}
            {callout}
            {!touring ? <Button label="Start guided tour" size="md" onPress={() => (setTouring(true), setStep(0), setFinished(false))} /> : null}
          </View>
        ) : null}

        <View className="flex-row items-start" style={{ gap }}>
          <PhoneFrame mode="get" title={`${c.resident} · ${resident}`} width={fw} height={fh} target={target('get')} nonce={nonce} register={register} />
          <PhoneFrame mode="run" title={`${c.runner} · ${runner}`} width={fw} height={fh} target={target('run')} nonce={nonce} register={register} />
          {desk ? <PhoneFrame mode="desk" title={c.desk} width={fw} height={fh} target={false} nonce={nonce} register={register} /> : null}
        </View>

        <View style={{ width: SIDE_R }} className="gap-4 pt-9">
          <View accessibilityLabel="Sandbox controls" className="gap-2.5 rounded-block border-2 border-paper bg-raised p-4">
            <Text className="font-display text-[15px]">{c.controls}</Text>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-[13px] font-semibold text-muted">{c.clock}</Text>
              <Meter value={offsetMin > 0 ? `+${offsetMin}` : '0'} unit="min" size="sm" tone={offsetMin > 0 ? 'yellow' : 'muted'} label={offsetMin > 0 ? fill(c.ahead, { min: offsetMin }) : c.onTime} />
            </View>
            <CtlButton label={c.ff5} icon={FastForward} disabled={!core} onPress={() => ff(5 * 60)} />
            <CtlButton label={c.ff30} icon={FastForward} disabled={!core} onPress={() => ff(30 * 60)} />
            <CtlButton label={c.move} icon={Footprints} disabled={!core} onPress={() => core?.dev?.pingTick()} />
            <CtlButton label={resetting ? c.resetting : c.reset} icon={RotateCcw} disabled={!core || resetting} onPress={reset} />
            <View className="flex-row items-center justify-between gap-2 pt-1">
              <Text className="flex-1 text-[14px] font-semibold">{desk ? c.hideDesk : c.showDesk}</Text>
              <Switch value={desk} onChange={setDesk} label={c.showDesk} />
            </View>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-[14px] font-semibold">{c.howItWorks}</Text>
              <Switch value={how} onChange={(v) => (setHow(v), v && setDismissed({}))} label={c.howItWorks} />
            </View>
            <Text className="pt-1 text-[13px] font-semibold text-muted">{c.openAs}</Text>
            <View className="flex-row flex-wrap gap-x-3">
              {(['get', 'run', 'desk'] as Mode[]).map((m) => (
                <TextButton key={m} icon={ExternalLink} label={m === 'get' ? c.resident : m === 'run' ? c.runner : c.desk} className="min-h-[40px]" onPress={() => openModeInNewTab(m)} />
              ))}
            </View>
          </View>
          {!showLeft ? (
            <>
              {tourCard}
              {callout}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}
