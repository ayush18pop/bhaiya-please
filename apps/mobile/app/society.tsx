/**
 * A4 Find your society. Onboarding step (→ A5 with ?use=) and, with ?change=1, "change society"
 * from the Home header (saves prefs and goes back). Outside the AccountGate: no core here.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Crosshair, Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert, Animated, Button, DUR, EASE, FadeIn, Field, Icon, Meter, Sink, Sheet, StatusPlate, Text, TextButton, useReducedMotion,
} from '@/components/bp';
import { SlideInDown } from 'react-native-reanimated';
import { MapView } from '@/components/map/MapView';
import { useSession } from '@/components/providers';
import { fill, useCopy } from '@/lib/i18n';
import { kmBetween, searchSocieties, type Society } from '@/lib/societies';
import { getJSON, setJSON } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { onboardingCopy } from '@/screens/onboarding/copy';
import { OnbHeader, Rise } from '@/screens/onboarding/parts';

type LocState = 'idle' | 'locating' | 'denied' | 'error' | 'done';
const REQUESTS = 'bp.societyRequests';

async function locate(): Promise<{ lat: number; lng: number }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw Object.assign(new Error('denied'), { denied: true });
  const p = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
  ]);
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

function RequestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCopy(onboardingCopy).society.request;
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const close = () => {
    onClose();
    setTimeout(() => {
      setSent(false);
      setName('');
      setArea('');
      setErr(null);
    }, 300);
  };
  return (
    <Sheet open={open} onClose={close} lights={sent}>
      {sent ? (
        <Rise className="gap-3.5">
          <Text variant="heading">{c.doneTitle}</Text>
          <Text className="text-[15px] leading-[21px] text-muted">{fill(c.doneBody, { name: name.trim() })}</Text>
          <Button label={c.close} onPress={close} />
        </Rise>
      ) : (
        <View className="gap-3.5">
          <Text variant="heading">{c.title}</Text>
          <Text className="text-[15px] leading-[21px] text-muted">{c.body}</Text>
          <Field label={c.name} placeholder={c.namePh} value={name} onChangeText={(v) => (setName(v), setErr(null))} error={err} autoFocus />
          <Field label={c.area} placeholder={c.areaPh} value={area} onChangeText={setArea} />
          <Button
            label={c.send}
            onPress={() => {
              if (!name.trim()) return setErr(c.needName);
              const prev = getJSON<{ name: string; area: string; at: number }[]>('local', REQUESTS, []);
              setJSON('local', REQUESTS, [...prev, { name: name.trim(), area: area.trim(), at: Date.now() }]);
              setSent(true);
            }}
          />
        </View>
      )}
    </Sheet>
  );
}

function Row({ s, km, selected, nearest, onPress, label }: { s: Society; km: number | null; selected: boolean; nearest: boolean; onPress: () => void; label: string }) {
  return (
    <Sink
      onPress={onPress}
      haptics="select"
      shadow={selected ? 'go' : 'none'}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${s.name}, ${s.area}${km != null ? `, ${km.toFixed(1)} km` : ''}`}
      style={{ marginRight: 4, marginBottom: 4 }}
      className={cn('min-h-[64px] flex-row items-center gap-3 rounded-block bg-surface px-3.5 py-2', selected ? 'border-3 border-go' : 'border-2 border-line')}>
      <View className="flex-1">
        <Text className="text-[17px] font-bold">{s.name}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-[14px] text-muted">{s.area}</Text>
          {nearest ? <StatusPlate kind="sign" label={label.toUpperCase()} className="px-1.5 py-[2px]" /> : null}
        </View>
      </View>
      {km != null ? <Meter value={km < 10 ? km.toFixed(1) : Math.round(km)} unit="km" size="sm" border="line" /> : null}
    </Sink>
  );
}

export default function SocietyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const all = useCopy(onboardingCopy);
  const c = all.society;
  const params = useLocalSearchParams<{ use?: string; change?: string }>();
  const changing = params.change === '1';
  const { prefs, setPrefs } = useSession();
  const [q, setQ] = useState('');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [loc, setLoc] = useState<LocState>('idle');
  const [chosen, setChosen] = useState<Society | null>(null);
  const [asking, setAsking] = useState(false);

  const list = useMemo(() => {
    const found = searchSocieties(q);
    if (!me) return found.map((s) => ({ s, km: null as number | null }));
    return found.map((s) => ({ s, km: kmBetween(me, s.gate) })).sort((a, b) => a.km! - b.km!);
  }, [q, me]);

  const useLocation = async () => {
    setLoc('locating');
    try {
      const p = await locate();
      setMe(p);
      setLoc('done');
      setQ('');
      const nearest = searchSocieties('')
        .map((s) => ({ s, km: kmBetween(p, s.gate) }))
        .sort((a, b) => a.km - b.km)[0];
      if (nearest && nearest.km < 25) setChosen(nearest.s);
    } catch (e) {
      setLoc((e as { denied?: boolean }).denied ? 'denied' : 'error');
    }
  };

  const confirm = () => {
    if (!chosen) return;
    if (changing) {
      setPrefs({ societyId: chosen.id });
      if (router.canGoBack()) router.back();
      else router.replace('/home');
      return;
    }
    router.push({ pathname: '/welcome/name', params: { use: params.use ?? 'both', society: chosen.id } });
  };

  const current = changing ? prefs.societyId : null;

  return (
    <View className="flex-1 bg-bg">
      <OnbHeader title={changing ? c.changeTitle : c.title} backLabel={all.back} onBack={() => (router.canGoBack() ? router.back() : router.replace(changing ? '/home' : '/welcome'))} className="pb-0" />
      <View className="gap-3 px-4 pb-3 pt-3">
        <Field
          accessibilityLabel={c.search}
          placeholder={c.search}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          returnKeyType="search"
        />
        <Button
          label={loc === 'locating' ? c.locating : c.useLocation}
          icon={loc === 'locating' ? undefined : Crosshair}
          variant="secondary"
          size="md"
          full
          loading={loc === 'locating'}
          onPress={useLocation}
        />
        {loc === 'denied' || loc === 'error' ? (
          <Alert tone="info" title={loc === 'denied' ? c.denied : c.locError} />
        ) : (
          <Text className="text-[13px] text-muted">{c.locationNote}</Text>
        )}
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2 px-4" contentContainerStyle={{ paddingBottom: chosen ? 380 : insets.bottom + 24 }} accessibilityRole="radiogroup">
        {list.map(({ s, km }, i) => (
          <Rise key={s.id} index={i}>
            <Row s={s} km={km} selected={chosen?.id === s.id || (!chosen && current === s.id)} nearest={!!me && i === 0 && !q} label={c.nearest} onPress={() => setChosen(s)} />
          </Rise>
        ))}
        {list.length === 0 ? (
          <View className="flex-row items-center gap-2.5 py-4">
            <Icon as={Search} size={18} className="text-muted" />
            <Text className="text-[15px] text-muted">{c.noMatch}</Text>
          </View>
        ) : null}
        <TextButton label={c.notListed} onPress={() => setAsking(true)} />
      </ScrollView>

      {chosen ? (
        <Animated.View
          key={chosen.id}
          entering={reduce ? FadeIn.duration(DUR.quick) : SlideInDown.duration(DUR.base).easing(EASE)}
          className="absolute bottom-0 left-0 right-0 gap-3 rounded-t-sheet border-2 border-b-0 border-paper bg-raised px-4 pt-3.5"
          style={{ paddingBottom: insets.bottom + 20 }}>
          <Text className="text-[18px] font-extrabold">{chosen.name}</Text>
          <View className="h-[150px] overflow-hidden rounded-block border-2 border-line">
            <MapView society={{ pos: chosen.gate, label: c.gateLabel }} fit={[chosen.gate]} fitKey={chosen.id} style={{ flex: 1 }} />
          </View>
          <Text className="text-[15px] font-semibold">{c.gateLine}</Text>
          <Button label={changing ? c.saveChange : c.confirm} onPress={confirm} />
          <TextButton label={c.pickAnother} className="min-h-[40px] self-center" onPress={() => setChosen(null)} />
        </Animated.View>
      ) : null}

      <RequestSheet open={asking} onClose={() => setAsking(false)} />
    </View>
  );
}
