/** C3 Start a run: where to, from where, arriving in, how many requests, live location → Go live. */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LocateFixed, MapPin } from 'lucide-react-native';
import { zoneFromLatLng } from '@bhaiya-please/core/mock';
import {
  Alert, Button, Icon, IconButton, OptionCard, PrivacyLine, SaveButton, Screen, Section, Sheet, SlotPicker, Stepper, Switch, Text, levelLabel,
} from '@/components/bp';
import { useCore, useSession } from '@/components/providers';
import { useProfile } from '@/hooks/queries';
import { appEvent } from '@/lib/events';
import { nowSec } from '@/lib/format';
import { logActivity } from '@/lib/history';
import { fill, t, useCopy } from '@/lib/i18n';
import { setSharing } from '@/lib/sharing';
import { AREAS, placeName, SOCIETIES, societyById } from '@/lib/societies';
import { cn } from '@/lib/utils';
import { runnerCopy } from '@/screens/runner/copy';
import { SunButton, useActiveRun } from '@/screens/runner/parts';
import { saveSnap } from '@/screens/runner/store';

const NEXT_LEVEL = ['verified', 'trusted'] as const;

function SelectRow({ label, value, onPress, className }: { label: string; value: string; onPress: () => void; className?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Change`}
      className={cn('min-h-[56px] flex-row items-center gap-2 rounded-block border-2 border-edge bg-surface px-4 active:opacity-80', className)}>
      <Text numberOfLines={1} className="flex-1 text-[18px] font-bold">
        {value}
      </Text>
      <Icon as={ChevronDown} size={20} strokeWidth={2.6} />
    </Pressable>
  );
}

export default function StartRun() {
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const c = useCopy(runnerCopy);
  const p = useLocalSearchParams<{ dest?: string; from?: string; min?: string; cap?: string }>();
  const { address, prefs, setPrefs } = useSession();
  const profile = useProfile(address);
  const active = useActiveRun();
  const maxCap = profile.data?.tier.requestsPerRun ?? 1;

  const [dest, setDest] = useState(() => societyById(p.dest ?? prefs.societyId).id);
  const [from, setFrom] = useState<string>(() => p.from ?? AREAS[0]!.zone6);
  const [fromLabel, setFromLabel] = useState<string | null>(null);
  const [mins, setMins] = useState(() => Math.min(60, Math.max(5, Number(p.min) || 20)));
  const [capWanted, setCap] = useState(() => Math.max(1, Number(p.cap) || 3));
  const [share, setShare] = useState(prefs.shareLocation);
  const [picker, setPicker] = useState<'dest' | 'from' | null>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);

  const cap = Math.min(capWanted, maxCap);
  const society = societyById(dest);
  const same = society.zone6 === from;
  const fromName = fromLabel ?? placeName(from);
  const nextLevel = maxCap < 3 ? NEXT_LEVEL[maxCap - 1] : null;

  const useMyLocation = async () => {
    setLocating(true);
    setLocErr(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') throw new Error('denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const z = zoneFromLatLng(pos.coords.latitude, pos.coords.longitude).zone6;
      setFrom(z);
      setFromLabel(placeName(z) === 'Nearby area' ? c.start.nearYou : null);
      setPicker(null);
    } catch {
      setLocErr(c.start.locDenied);
      setShare(false);
    } finally {
      setLocating(false);
    }
  };

  const fromOptions = useMemo(
    () => [
      ...AREAS.map((a) => ({ id: a.zone6, title: a.name, body: c.start.areas })),
      ...SOCIETIES.filter((s) => s.zone6 !== society.zone6).map((s) => ({ id: s.zone6, title: s.name, body: s.area })),
    ],
    [society.zone6, c.start.areas],
  );

  return (
    <Screen
      runner
      title={c.start.title}
      right={<SunButton className="mr-1.5" />}
      footer={
        <>
          <Text className="text-center text-[16px] font-bold leading-[22px]">{fill(c.start.review, { society: society.name, min: mins })}</Text>
          <SaveButton
            label={t('run.goLive')}
            size="xl"
            savedLabel={t('run.live')}
            disabled={same || !!active.run}
            onSave={async () => {
              setSharing({ enabled: share });
              return core.announceRun({ destZone: society.zone6, fromZone: from, etaMinutes: mins, capacity: cap });
            }}
            onDone={(r) => {
              if (profile.data) saveSnap(r.key, { tier: profile.data.tier.name, receipts: profile.data.receiptsTotal, residents: profile.data.distinctResidents });
              logActivity({ kind: 'run', key: r.key, dest: society.name, from: fromName, minutes: mins, capacity: cap, at: nowSec() });
              setPrefs((pr) => ({
                shareLocation: share,
                recentTrips: [{ dest: society.id, from, minutes: mins, capacity: cap }, ...pr.recentTrips.filter((x) => !(x.dest === society.id && x.from === from))].slice(0, 3),
              }));
              appEvent('run.started');
              void qc.invalidateQueries();
              router.replace('/home');
            }}
          />
        </>
      }>
      {active.run ? (
        <Alert tone="info" title={c.start.alreadyLive} actions={<Button label={c.start.openRun} size="sm" full={false} onPress={() => router.replace('/home')} />} />
      ) : null}

      <Section title={c.start.goingTo}>
        <SelectRow label={c.start.goingTo} value={`${society.name}, ${society.area}`} onPress={() => setPicker('dest')} />
      </Section>

      <Section title={c.start.comingFrom}>
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <SelectRow label={c.start.comingFrom} value={fromName} onPress={() => setPicker('from')} className={same ? 'border-mirchi' : undefined} />
          </View>
          <IconButton icon={LocateFixed} label={c.start.useLocation} size={56} onPress={useMyLocation} className="border-2 border-edge" />
        </View>
        {same ? (
          <Text accessibilityRole="alert" className="text-[14px] font-semibold text-mirchi">
            {fill(c.start.same, { place: society.name })}
          </Text>
        ) : locErr ? (
          <Text className="text-[14px] font-semibold text-mirchi">{locErr}</Text>
        ) : locating ? (
          <Text className="text-[14px] text-muted">{c.start.locating}</Text>
        ) : null}
      </Section>

      <Section title={c.start.arrivingIn}>
        <Stepper value={mins} onChange={setMins} min={5} max={60} step={5} unit="min" label={c.start.arrivingIn} size={64} />
      </Section>

      <Section title={c.start.canTake}>
        <SlotPicker value={cap} onChange={setCap} max={maxCap} lockedHint={nextLevel ? fill(c.start.unlocks, { n: maxCap + 1, level: levelLabel(nextLevel) }) : undefined} />
      </Section>

      <View className="gap-2.5">
        <View className="min-h-[64px] flex-row items-center justify-between gap-4 rounded-block border-2 border-line bg-surface px-4 py-3">
          <Text className="flex-1 text-[17px] font-bold">{c.start.share}</Text>
          <Switch value={share} onChange={setShare} label={c.start.share} />
        </View>
        <PrivacyLine text={share ? c.start.locOn : c.start.locOff} />
      </View>

      <Sheet open={picker === 'dest'} onClose={() => setPicker(null)} title={c.start.pickSociety} scroll>
        {SOCIETIES.map((s) => (
          <OptionCard
            key={s.id}
            title={s.name}
            body={s.area}
            selected={s.id === dest}
            onPress={() => {
              setDest(s.id);
              setPicker(null);
            }}
          />
        ))}
      </Sheet>

      <Sheet open={picker === 'from'} onClose={() => setPicker(null)} title={c.start.pickFrom} scroll>
        <Button label={locating ? c.start.locating : c.start.useLocation} icon={MapPin} variant="secondary" size="lg" onPress={useMyLocation} />
        {fromOptions.map((o) => (
          <OptionCard
            key={o.id}
            title={o.title}
            body={o.body}
            selected={o.id === from}
            onPress={() => {
              setFrom(o.id);
              setFromLabel(null);
              setPicker(null);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}
