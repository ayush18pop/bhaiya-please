/**
 * D8 Settings: everything that isn't a daily task. Device-local switches save instantly; the only
 * account action (sign out) asks first. Account IDs and network details live under Advanced only.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { BadgeCheck, ChevronRight, FileText, HelpCircle, Info, LogOut, QrCode, ShieldCheck } from 'lucide-react-native';
import {
  Avatar, Button, Chip, ConfirmSheet, Field, Icon, ListGroup, ListRow, MelaLights, NamePlate, Screen, Sheet, Sink, Switch, Text,
} from '@/components/bp';
import { QrDisplay } from '@/components/QrDisplay';
import { useSession } from '@/components/providers';
import { aliasFor } from '@/lib/alias';
import { fill, LANGUAGES, useCopy } from '@/lib/i18n';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';
import { loadNotifPrefs, saveNotifPrefs, type NotifPrefs } from '@/screens/shared/parts';

function ToggleRow({ label, hint, value, onChange, last }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View className={cn('min-h-[56px] flex-row items-center gap-3 px-3.5 py-2.5', !last && 'border-b-2 border-line')}>
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-semibold">{label}</Text>
        {hint ? <Text className="text-[13px] text-muted">{hint}</Text> : null}
      </View>
      <Switch value={value} onChange={onChange} label={label} />
    </View>
  );
}

function UpiSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCopy(sharedCopy).settings;
  const { prefs, setPrefs } = useSession();
  const [text, setText] = useState(prefs.upi ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    const v = text.trim();
    if (!/^upi:\/\//i.test(v)) return setErr(c.upiInvalid);
    setPrefs({ upi: v });
    haptic.success();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={c.upiTitle} scroll>
      <Text className="text-[15px] leading-[21px] text-muted">{c.upiBody}</Text>
      {prefs.upi ? (
        <View className="items-center">
          <QrDisplay value={prefs.upi} size={160} label="Your UPI QR" />
        </View>
      ) : null}
      <Field label={c.upiField} value={text} onChangeText={(v) => (setText(v), setErr(null))} placeholder="upi://pay?pa=…" autoCapitalize="none" autoCorrect={false} error={err} />
      <Button label={c.upiSave} onPress={save} />
      {prefs.upi ? (
        <Button
          label={c.upiRemove}
          variant="destructive"
          onPress={() => {
            setPrefs({ upi: null });
            setText('');
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

export default function Settings() {
  const router = useRouter();
  const c = useCopy(sharedCopy).settings;
  const { address, prefs, setPrefs, society, sandbox, deskVisible, setMode, signOut, exitSandbox, guest } = useSession();
  const [np, setNp] = useState<NotifPrefs>(loadNotifPrefs);
  const [sheet, setSheet] = useState<null | 'name' | 'upi' | 'signout' | 'how'>(null);
  const setN = (k: keyof NotifPrefs) => (v: boolean) => {
    const next = { ...np, [k]: v };
    setNp(next);
    saveNotifPrefs(next);
  };
  const backedUp = !!(address && prefs.backedUp[address]);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const name = address ? aliasFor(address) : '';

  return (
    <Screen title={c.title} contentClassName="gap-[18px] pb-10">
      <ListGroup title={c.profile}>
        <ListRow label={c.publicName} right={<Text className="text-[15px] text-muted">{name}</Text>} onPress={() => setSheet('name')} />
        <ListRow label={c.society} right={<Text numberOfLines={1} className="max-w-[160px] text-[15px] text-muted">{society.name}</Text>} onPress={() => router.push('/society?change=1')} last />
      </ListGroup>

      <View className="gap-2">
        <Text className="px-1 text-[14px] font-semibold text-muted">{c.language}</Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l.id} label={l.native} selected={prefs.language === l.id} onPress={() => setPrefs({ language: l.id })} className="min-w-[96px] justify-center" />
          ))}
        </View>
      </View>

      <ListGroup title={c.notifications}>
        <ToggleRow label={c.nAccepted} value={np.accepted} onChange={setN('accepted')} />
        <ToggleRow label={c.nGate} value={np.gate} onChange={setN('gate')} />
        <ToggleRow label={c.nHere} value={prefs.notifyMe} onChange={(v) => setPrefs({ notifyMe: v })} />
        <ToggleRow label={c.nRun} value={np.run} onChange={setN('run')} />
        <ToggleRow label={c.nReceipts} value={np.receipts} onChange={setN('receipts')} />
        <ToggleRow label={c.shareLocation} hint={c.shareLocationHint} value={prefs.shareLocation} onChange={(v) => setPrefs({ shareLocation: v })} />
        <ToggleRow label={c.sunlight} hint={c.sunlightHint} value={prefs.sunlight} onChange={(v) => setPrefs({ sunlight: v })} last />
      </ListGroup>

      <ListGroup title={c.payments}>
        <ListRow icon={QrCode} label={c.upi} right={<Text className="text-[14px] text-muted">{prefs.upi ? c.upiHint : c.upiNone}</Text>} onPress={() => setSheet('upi')} />
        <ListRow icon={ShieldCheck} label={c.privacy} onPress={() => router.push('/settings/privacy')} last />
      </ListGroup>

      {!guest ? (
        <View className="gap-2">
          <ListGroup title={c.account}>
            <ListRow
              label={c.backup}
              right={!backedUp ? <View accessibilityLabel="Not backed up yet" className="h-2.5 w-2.5 rounded-pill bg-mirchi" /> : undefined}
              onPress={() => router.push('/backup')}
            />
            <ListRow icon={HelpCircle} label={c.help} onPress={() => router.push('/help')} />
            {deskVisible ? (
              <ListRow
                icon={BadgeCheck}
                label={c.desk}
                hint={c.deskHint}
                onPress={() => {
                  setMode('desk');
                  router.replace('/home');
                }}
              />
            ) : null}
            {sandbox ? (
              <ListRow
                icon={LogOut}
                label={c.leaveSandbox}
                hint={c.leaveSandboxHint}
                tone="mirchi"
                chevron={false}
                onPress={() => {
                  exitSandbox();
                  router.replace('/sandbox');
                }}
                last
              />
            ) : (
              <ListRow icon={LogOut} label={c.signOut} tone="mirchi" chevron={false} onPress={() => setSheet('signout')} last />
            )}
          </ListGroup>
          {!sandbox ? <Text className="px-1 text-[13px] text-muted">{c.signOutLine}</Text> : null}
        </View>
      ) : null}

      <ListGroup title={c.about}>
        <ListRow icon={Info} label={c.howItWorks} onPress={() => setSheet('how')} />
        <ListRow icon={FileText} label={c.licence} chevron={false} last />
      </ListGroup>

      <Sink onPress={() => router.push('/settings/advanced')} shadow="none" accessibilityRole="link" className="overflow-hidden rounded-block border-2 border-paper bg-surface">
        <MelaLights height={14} className="border-b-2 border-paper" />
        <View className="flex-row items-center gap-3 p-3.5">
          <View className="flex-1 gap-1">
            <Text className="text-[16px] font-extrabold">{c.advanced}</Text>
            <Text className="text-[14px] text-muted">{c.advancedHint}</Text>
          </View>
          <Icon as={ChevronRight} size={20} />
        </View>
      </Sink>

      <Text className="text-center text-[13px] text-muted">{fill(c.version, { v: version })}</Text>

      <Sheet open={sheet === 'name'} onClose={() => setSheet(null)} title={c.publicName}>
        <View className="flex-row items-center gap-4">
          {address ? <Avatar seed={address} size={72} /> : null}
          <NamePlate name={name} size={22} />
        </View>
        <Text className="text-[15px] leading-[21px] text-muted">{c.publicNameHint}</Text>
        <Text className="text-[15px] leading-[21px] text-muted">{c.avatarHint}</Text>
        <Button label="OK" variant="secondary" onPress={() => setSheet(null)} />
      </Sheet>
      <UpiSheet open={sheet === 'upi'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'how'} onClose={() => setSheet(null)} title={c.howItWorks}>
        <Text className="text-[15px] leading-[22px]">{c.howItWorksBody}</Text>
        <Button label={c.help} variant="secondary" onPress={() => (setSheet(null), router.push('/help'))} />
      </Sheet>
      <ConfirmSheet
        open={sheet === 'signout'}
        onClose={() => setSheet(null)}
        title={c.signOutTitle}
        body={c.signOutBody}
        destructive
        confirmLabel={c.signOutConfirm}
        onConfirm={() => {
          setSheet(null);
          signOut();
          router.replace('/welcome');
        }}>
        {!backedUp ? <Button label={c.backup} variant="secondary" size="md" onPress={() => (setSheet(null), router.push('/backup'))} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}
