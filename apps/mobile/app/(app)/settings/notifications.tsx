/**
 * D8 Settings → Notifications: "Push to this phone" (web push via the alert service, sandbox: in-app),
 * what to be told about, the live alerts this account has set (stop any of them), alerts that
 * couldn't be saved, and a line explaining that alerts are run by Arkiv Triggers (→ Help).
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, HelpCircle, Trash2 } from 'lucide-react-native';
import type { EntityKey } from '@bhaiya-please/core';
import {
  Alert, Button, ConfirmSheet, Empty, Icon, IconButton, ListGroup, MelaLights, PrivacyLine, SaveButton, Screen, Skeleton, StatusPlate, Switch, Text, TextButton,
  type SaveState,
} from '@/components/bp';
import { useCore, useSession } from '@/components/providers';
import { useNow } from '@/hooks/useNow';
import { fill, useCopy } from '@/lib/i18n';
import { useOnline } from '@/lib/online';
import { societyByZone } from '@/lib/societies';
import {
  disablePush, dismissIssue, enablePush, protocol, pushPermission, pushSupport, useChannel, useIssues, type MyAlert,
} from '@/lib/triggers';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';
import { loadNotifPrefs, Rise, saveNotifPrefs, timeOf, type NotifPrefs } from '@/screens/shared/parts';

function endsIn(seconds: number) {
  const s = Math.max(0, seconds);
  if (s < 3600) return `${Math.max(1, Math.ceil(s / 60))} min`;
  if (s < 48 * 3600) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} days`;
}

function PushCard() {
  const c = useCopy(sharedCopy).alerts;
  const { wallet, address } = useSession();
  const online = useOnline();
  const channel = useChannel(address);
  const support = pushSupport();
  const [state, setState] = useState<SaveState>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [perm, setPerm] = useState(pushPermission);
  const [off, setOff] = useState(false);
  const on = !!channel;

  const enable = async () => {
    if (!wallet || state === 'saving') return;
    setState('saving');
    setErr(null);
    try {
      await enablePush(wallet);
      setState('saved');
    } catch (e) {
      setState('failed');
      setErr((e as Error)?.message ?? c.failed);
    } finally {
      setPerm(pushPermission());
    }
  };
  useEffect(() => {
    if (state !== 'saved') return;
    const id = setTimeout(() => setState('idle'), 1200);
    return () => clearTimeout(id);
  }, [state]);

  const blocked = support === 'web' && perm === 'denied';
  const unavailable = support === 'native' ? { t: c.native, b: c.nativeBody } : support === 'unsupported' ? { t: c.unsupported, b: c.unsupportedBody } : support === 'unconfigured' ? { t: c.notConfigured, b: c.notConfiguredBody } : null;

  return (
    <View className="overflow-hidden rounded-block border-2 border-paper bg-surface">
      <MelaLights height={14} className="border-b-2 border-paper" />
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <Icon as={BellRing} size={24} />
          <Text className="flex-1 text-[18px] font-extrabold">{c.push}</Text>
          {unavailable ? null : on ? <StatusPlate kind="live" label={c.pushOn.toUpperCase()} /> : <StatusPlate kind="full" label={c.pushOff.toUpperCase()} />}
        </View>
        <Text className="text-[15px] leading-[21px] text-muted">{on ? (support === 'sandbox' ? c.pushSandbox : c.pushOnBody) : c.pushBody}</Text>
        {unavailable ? (
          <Alert tone="info" title={unavailable.t} body={unavailable.b} />
        ) : blocked ? (
          <Alert tone="error" title={c.denied} body={c.deniedBody} actions={<Button label={c.turnOn} size="sm" full={false} variant="secondary" onPress={enable} />} />
        ) : on ? (
          support === 'sandbox' ? null : <TextButton label={c.turnOff} tone="mirchi" onPress={() => setOff(true)} />
        ) : (
          <View className="gap-1.5">
            {state === 'idle' && perm === 'default' ? <PrivacyLine text={c.explainer} /> : null}
            <Button label={c.turnOn} savingLabel={c.enabling} savedLabel={c.enabled} failedLabel={c.failed} state={state} disabled={!online || !wallet} onPress={enable} />
            {err ? (
              <Text accessibilityRole="alert" className="text-[13px] font-semibold text-mirchi">
                {err}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      <ConfirmSheet
        open={off}
        onClose={() => setOff(false)}
        title={c.turnOffTitle}
        body={c.turnOffBody}
        destructive
        confirmLabel={c.turnOffConfirm}
        onConfirm={() => {
          setOff(false);
          if (wallet) void disablePush(wallet);
        }}
      />
    </View>
  );
}

function ToggleRow({ label, value, onChange, last }: { label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View className={cn('min-h-[56px] flex-row items-center gap-3 px-3.5 py-2.5', !last && 'border-b-2 border-line')}>
      <Text className="flex-1 text-[16px] font-semibold">{label}</Text>
      <Switch value={value} onChange={onChange} label={label} />
    </View>
  );
}

function AlertRow({ a, now, last, onStop }: { a: MyAlert; now: number; last: boolean; onStop: () => void }) {
  const c = useCopy(sharedCopy).alerts;
  const zone = protocol.zoneOf(a.trigger);
  const watch = a.kind === 'runHere' ? fill(c.watch.runHere, { society: societyByZone(zone)?.name ?? zone ?? '' }) : c.watch[a.kind];
  return (
    <View className={cn('min-h-[64px] flex-row items-center gap-3 py-2.5 pl-3.5 pr-1.5', !last && 'border-b-2 border-line')}>
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-bold">{c.label[a.kind]}</Text>
        <Text className="text-[14px] leading-[19px] text-muted">{watch}</Text>
        <Text className="text-[13px] font-semibold text-yellow">{fill(c.endsIn, { time: endsIn(a.expiresAt - now) })}</Text>
      </View>
      <IconButton icon={Trash2} label={`${c.deleteLabel}: ${c.label[a.kind]}`} onPress={onStop} />
    </View>
  );
}

export default function NotificationSettings() {
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const c = useCopy(sharedCopy);
  const a = c.alerts;
  const now = useNow();
  const { address, prefs, setPrefs, guest } = useSession();
  const issues = useIssues(address);
  const [np, setNp] = useState<NotifPrefs>(loadNotifPrefs);
  const [stop, setStop] = useState<MyAlert | null>(null);
  const setN = (k: keyof NotifPrefs) => (v: boolean) => {
    const next = { ...np, [k]: v };
    setNp(next);
    saveNotifPrefs(next);
  };
  const list = useQuery({
    queryKey: [address, 'alerts', 'mine'],
    queryFn: () => protocol.listMyAlerts(core, address!),
    enabled: !!address && !guest,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const live = (list.data ?? []).filter((x) => x.expiresAt > now);

  return (
    <Screen title={a.title} contentClassName="gap-[18px] pb-10">
      <Rise index={0}>
        <PushCard />
      </Rise>

      <Rise index={1}>
        <ListGroup title={a.kinds}>
          <ToggleRow label={c.settings.nAccepted} value={np.accepted} onChange={setN('accepted')} />
          <ToggleRow label={c.settings.nGate} value={np.gate} onChange={setN('gate')} />
          <ToggleRow label={c.settings.nHere} value={prefs.notifyMe} onChange={(v) => setPrefs({ notifyMe: v })} />
          <ToggleRow label={c.settings.nRun} value={np.run} onChange={setN('run')} />
          <ToggleRow label={c.settings.nReceipts} value={np.receipts} onChange={setN('receipts')} last />
        </ListGroup>
      </Rise>

      {issues.length ? (
        <Rise index={2} className="gap-2">
          <Text className="px-1 text-[14px] font-semibold text-muted">{a.problems}</Text>
          {issues.map((x) => (
            <Alert
              key={x.id}
              tone="error"
              title={fill(a.problemLine, { what: a.what[x.what], time: timeOf(x.at) })}
              body={x.reason}
              actions={<TextButton label={a.dismiss} onPress={() => address && dismissIssue(address, x.id)} />}
            />
          ))}
        </Rise>
      ) : null}

      <Rise index={3} className="gap-2">
        <View className="gap-0.5 px-1">
          <Text className="text-[14px] font-semibold text-muted">{a.active}</Text>
          <Text className="text-[13px] text-muted">{a.activeHint}</Text>
        </View>
        {list.isLoading ? (
          <View className="gap-3 rounded-block border-2 border-line bg-surface p-3.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-4/5 bg-raised" />
            <Skeleton className="h-4 w-1/3" />
          </View>
        ) : list.isError && !list.data ? (
          <Alert tone="error" title={a.loadFailed} actions={<Button label={a.retry} size="sm" full={false} variant="secondary" onPress={() => void list.refetch()} />} />
        ) : live.length ? (
          <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
            {live.map((x, i) => (
              <AlertRow key={x.key} a={x} now={now} last={i === live.length - 1} onStop={() => setStop(x)} />
            ))}
          </View>
        ) : (
          <Empty title={a.noneActive} body={a.noneActiveBody} />
        )}
      </Rise>

      <Rise index={4}>
        <View className="flex-row items-center gap-2.5 px-1">
          <Icon as={HelpCircle} size={18} className="text-muted" />
          <Text className="flex-shrink text-[14px] text-muted">{a.poweredBy}</Text>
          <TextButton label={a.howAlerts} tone="yellow" onPress={() => router.push('/help?faq=alerts')} />
        </View>
      </Rise>

      <ConfirmSheet
        open={!!stop}
        onClose={() => setStop(null)}
        title={a.deleteTitle}
        body={stop ? fill(a.deleteBody, { label: a.label[stop.kind] }) : undefined}
        confirm={
          <View className="flex-row gap-3 pt-1">
            <View className="flex-1">
              <Button label={a.goBack} variant="secondary" onPress={() => setStop(null)} />
            </View>
            <View className="flex-1">
              <SaveButton
                label={a.deleteConfirm}
                savingLabel={a.stopping}
                savedLabel={a.stopped}
                variant="destructive"
                onSave={() => protocol.deleteAlerts(core, [stop!.key as EntityKey])}
                onDone={() => {
                  setStop(null);
                  if (stop?.kind === 'runHere') setPrefs({ notifyMe: false });
                  void qc.invalidateQueries({ queryKey: [address, 'alerts'] });
                }}
              />
            </View>
          </View>
        }
      />
    </Screen>
  );
}
