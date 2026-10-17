/** B8 Request tracking: live map, status road, plain-words status, handoff code, outcomes. */
import { useEffect, useRef, useState } from 'react';
import type { EntityKey } from '@bhaiya-please/core';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, QrCode } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert, Animated, Avatar, Button, ConfirmSheet, Easing, Glass, IconButton, LevelPlate, LiveIndicator, MelaLights, Meter, SaveButton, SkeletonCards,
  StatusRoad, Text, TextButton, toast, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from '@/components/bp';
import { MapView } from '@/components/map/MapView';
import { useCore, useSession } from '@/components/providers';
import { STAGE_INDEX, useNoShow, useProfile, useRequestStatus, useRunTrail, usePings, useShop } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { setDraft } from '@/lib/draft';
import { rupees } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { findLog, logActivity, type RequestLog } from '@/lib/history';
import { fill, useCopy, useT } from '@/lib/i18n';
import { runnerPin } from '@/lib/mapModel';
import { sawAccepted } from '@/lib/triggers';
import { residentCopy } from '@/screens/resident/copy';
import { minsTo, useInvalidate, Rise } from '@/screens/resident/parts';

const clock = (unix: number) => new Date(unix * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** "Ravi is at the gate. Show your code." — yellow band, mela-light edge, one shine sweep, vibration. */
function GateBand({ text, since }: { text: string; since?: string }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);
  useEffect(() => {
    haptic.warn();
    if (reduce) return;
    x.value = withTiming(1, { duration: 1200, easing: Easing.linear });
  }, [reduce, x]);
  const shine = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }], opacity: x.value > -1 && x.value < 1 ? 1 : 0 }));
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" onLayout={(e) => setW(e.nativeEvent.layout.width)} className="flex-row overflow-hidden rounded-block border-2 border-ink bg-yellow">
      <MelaLights width={22} />
      <View className="flex-1 gap-1 px-3.5 py-3">
        <Text className="font-display text-[22px] leading-[25px] text-ink">{text}</Text>
        {since ? <Text className="text-[14px] font-bold text-ink">{since}</Text> : null}
      </View>
      {w > 0 ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: w }, shine]}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']} locations={[0.2, 0.45, 0.7]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Pulses twice when it becomes the thing to do (gate / near). */
function Pulse({ on, children }: { on: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (!on || reduce) return;
    s.value = withDelay(1200, withSequence(withTiming(1.04, { duration: 175 }), withTiming(1, { duration: 175 }), withTiming(1.04, { duration: 175 }), withTiming(1, { duration: 175 })));
  }, [on, reduce, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

export default function Track() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const core = useCore();
  const t = useT();
  const c = useCopy(residentCopy);
  const now = useNow();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidate();
  const { society, address } = useSession();
  const q = useRequestStatus(key);
  const s = q.data;
  const req = s?.request ?? null;
  const run = s?.run ?? null;
  const rider = s?.accept?.rider ?? run?.creator ?? null;
  const profile = useProfile(rider);
  const shop = useShop(req?.shop);
  const pings = usePings(run ? [run.key] : []);
  const trail = useRunTrail(run?.key);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [h, setH] = useState(800);

  const stage = s?.stage ?? 'posted';
  // "Runner didn't show up": the run ended after an accept with no handoff. The accept expires with the
  // run, so it's known from the proof the no-show alert saved, or from this phone having seen the accept.
  const ended = !!s?.lapsed && !s?.declined;
  const noShowQ = useNoShow(key, ended);
  const noShowProof = noShowQ.data?.proof ?? null;
  const noShowReported = !!noShowQ.data?.complaint;
  const noShow = ended && (noShowProof ? noShowProof.valid : sawAccepted(address, key));
  const noShowRider = noShowProof?.noshow.rider ?? (findLog(key) as RequestLog | undefined)?.runner ?? null;
  const name = aliasFor(rider ?? (noShow ? noShowRider : null));
  const ping = pings.data?.[0];
  const pin = run ? runnerPin(run, ping, now, { tier: profile.data?.tier.name ?? null, focused: true, trail: trail.data }) : null;
  const mins = run ? minsTo(run.eta, now) : 0;
  const lapsed = !!s?.lapsed || !!s?.declined;
  const accepted = !!s?.accept;
  const delivered = !!s?.delivery;
  const near = accepted && !delivered && (stage === 'atGate' || mins <= 2);

  // Log outcomes for Activity (D1) as they are learnt.
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!s || !req) return;
    const outcome: RequestLog['outcome'] = s.complaint ? 'reported' : s.receipt ? 'rated' : s.delivery ? 'handed' : s.declined ? 'declined' : noShow ? 'accepted' : s.lapsed ? 'lapsed' : s.accept ? 'accepted' : 'sent';
    if (logged.current === outcome) return;
    logged.current = outcome;
    logActivity({ kind: 'request', key: req.key, runKey: req.run, runner: rider ?? noShowRider ?? '', items: req.items, maxPrice: req.maxPrice, tip: req.tip, at: req.createdAt, outcome, ...(shop.data ? { shop: shop.data.nameTag } : {}) });
  }, [s, req, rider, shop.data, noShow]);

  const sendOther = () => {
    if (req) setDraft({ runKey: null, shopKey: null, items: req.items, maxPrice: req.maxPrice, tip: req.tip });
    router.replace('/home');
  };

  if (!s && q.isLoading)
    return (
      <View className="flex-1 bg-bg p-4" style={{ paddingTop: insets.top + 16 }}>
        <SkeletonCards n={2} kind="map" />
      </View>
    );

  if (!req)
    return (
      <View className="flex-1 gap-4 bg-bg p-4" style={{ paddingTop: insets.top + 16 }}>
        <IconButton icon={ChevronLeft} label={c.common.back} onPress={() => router.replace('/home')} />
        <Alert tone="expired" title={c.track.gone} body={c.track.goneBody} actions={<Button label={c.common.seeOtherRuns} size="md" onPress={() => router.replace('/home')} />} />
      </View>
    );

  const statusLine =
    stage === 'posted'
      ? fill(c.track.waiting, { name, min: run ? minsTo(run.expiresAt, now) : 0 })
      : stage === 'accepted'
        ? fill(c.track.accepted, { name, society: society.name })
        : stage === 'delivered'
          ? fill(c.track.delivered, { name })
          : stage === 'rated'
            ? s?.complaint
              ? c.track.reported
              : fill(c.track.rated, { name })
            : '';
  const summary = fill(c.track.summary, { items: req.items.join(' · '), max: rupees(req.maxPrice), tip: rupees(req.tip) });
  const live = ping && now - ping.createdAt < 60;

  const primary = lapsed ? (
    <Button label={t('expired.sendOther')} onPress={sendOther} />
  ) : stage === 'delivered' ? (
    <Button label={fill(c.track.rate, { name })} variant="go" onPress={() => router.push(`/request/${key}/rate`)} />
  ) : stage === 'rated' ? (
    <Button label={c.common.done} variant="secondary" onPress={() => router.replace('/home')} />
  ) : (
    <View className="gap-1.5">
      <Pulse on={near}>
        <Button
          label={t('track.showCode')}
          icon={QrCode}
          size={near ? 'xl' : 'lg'}
          disabled={!accepted}
          onPress={() => router.push(`/request/${key}/code`)}
          className={near ? 'min-h-[72px]' : undefined}
        />
      </Pulse>
      {!accepted ? <Text className="text-center text-[13px] font-semibold text-muted">{fill(c.track.codeLocked, { name })}</Text> : null}
    </View>
  );

  return (
    <View className="flex-1 bg-bg" onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <View style={{ height: h * 0.36 }}>
        <MapView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: lapsed || delivered ? 0.6 : 1 }}
          society={{ pos: society.gate, label: c.track.mainGate }}
          runners={pin && !delivered ? [pin] : []}
          routes={pin && !delivered ? [{ id: pin.id, from: { runner: pin.id }, to: society.gate, tone: 'primary' }] : []}
          fit={[society.gate, ...(pin && !delivered ? [pin.pos] : [])]}
          fitKey={`${key}:${pin ? 1 : 0}:${stage}`}
          padding={{ top: 72, bottom: 40, left: 48, right: 48 }}
        />
        <View pointerEvents="box-none" className="absolute left-3 right-3 flex-row items-start justify-between" style={{ top: insets.top + 12 }}>
          <IconButton icon={ChevronLeft} label={c.common.back} glass onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          {!delivered && !lapsed && run ? (
            <Glass className="rounded-pill px-3 py-2">
              <LiveIndicator state={ping ? (live ? 'live' : 'stale') : 'stale'} text={ping ? fill(c.track.lastSeen, { ago: `${Math.max(1, now - ping.createdAt)} s ago` }) : c.track.locOff} />
            </Glass>
          ) : null}
        </View>
      </View>
      <View className="-mt-4 flex-1 overflow-hidden rounded-t-sheet border-2 border-b-0 border-paper bg-raised">
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
          {stage === 'atGate' ? (
            <Rise from="fade">
              <GateBand text={t('track.atGate', { name })} since={run?.atGateAt ? fill(c.track.since, { time: clock(run.atGateAt) }) : undefined} />
            </Rise>
          ) : !delivered && !lapsed && run ? (
            <Rise index={0} className="flex-row items-center gap-3.5">
              <Meter value={mins} unit={c.common.min} size="lg" label={`Arriving in ${mins} minutes`} />
              <View className="flex-1 gap-0.5">
                <Text variant="title">{mins > 0 ? c.track.arriving : c.track.atGateTitle}</Text>
                <Text className="text-[14px] font-semibold text-muted">{fill(c.track.endsIn, { min: minsTo(req.expiresAt, now) })}</Text>
              </View>
            </Rise>
          ) : null}
          {noShow ? (
            <Alert
              tone="expired"
              title={fill(c.track.noShow, { name })}
              body={noShowReported ? c.track.reported : `${fill(c.track.noShowBody, { name })} ${fill(noShowProof?.valid ? c.track.noShowProven : c.track.noShowPending, { name })}`}
              actions={
                noShowProof?.valid && !noShowReported ? (
                  <Button label={c.track.noShowReport} variant="destructive" size="md" full={false} onPress={() => router.push(`/request/${key}/report`)} />
                ) : undefined
              }
            />
          ) : lapsed ? (
            <Alert tone="expired" title={fill(s?.declined ? c.track.declined : c.track.lapsed, { name })} body={c.track.lapsedBody} />
          ) : (
            <Rise index={1}>
              <StatusRoad current={STAGE_INDEX[stage]} />
            </Rise>
          )}
          {statusLine && !lapsed ? (
            <Text accessibilityLiveRegion="polite" className="text-[17px] font-bold leading-[23px]">
              {statusLine}
            </Text>
          ) : null}
          {stage === 'atGate' ? <Text className="text-[15px] leading-[21px] text-muted">{fill(c.track.payGate, { name, max: rupees(req.maxPrice), tip: rupees(req.tip) })}</Text> : null}
          {rider ? (
            <Rise index={2}>
              <View className="flex-row items-center gap-3 rounded-block border-2 border-line bg-surface p-3" accessibilityLabel={`${name}. ${summary}`}>
                <Avatar seed={rider} size={40} ring="none" />
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[16px] font-bold">{name}</Text>
                    {profile.data ? <LevelPlate level={profile.data.tier.name} size="xs" /> : null}
                  </View>
                  <Text className="text-[14px] text-muted">{shop.data ? `${shop.data.nameTag} · ${summary}` : summary}</Text>
                </View>
                <TextButton label="Profile" tone="muted" onPress={() => router.push(`/p/${rider}`)} />
              </View>
            </Rise>
          ) : null}
          {primary}
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            {stage === 'posted' && !lapsed ? <TextButton label={c.track.cancel} onPress={() => setCancelOpen(true)} /> : null}
            {(stage === 'delivered' || stage === 'rated') && !s?.complaint ? <TextButton label={t('report.cta')} tone="mirchi" onPress={() => router.push(`/request/${key}/report`)} /> : null}
            {s?.receipt ? <TextButton label={c.track.record} onPress={() => router.push(`/receipt/${s.receipt!.key}`)} /> : null}
          </View>
        </ScrollView>
      </View>
      <ConfirmSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={c.track.cancelTitle}
        body={fill(c.track.cancelBody, { name })}
        confirm={
          <View className="flex-row gap-3 pt-1">
            <View className="flex-1">
              <Button label={c.track.keep} variant="secondary" onPress={() => setCancelOpen(false)} />
            </View>
            <View className="flex-1">
              <SaveButton
                label={c.track.cancelConfirm}
                variant="destructive"
                onSave={() => core.cancelRequest(key as EntityKey)}
                onDone={() => {
                  logActivity({ kind: 'request', key, outcome: 'cancelled' });
                  setDraft({ runKey: null, shopKey: null, items: req.items, maxPrice: req.maxPrice, tip: req.tip });
                  toast.success(c.track.cancelled);
                  void invalidate();
                  setCancelOpen(false);
                  router.replace('/home');
                }}
              />
            </View>
          </View>
        }
      />
    </View>
  );
}
