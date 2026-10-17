/**
 * D8 Advanced: the only place the account ID, network and (real build only) saving credit appear.
 */
import { Linking, View } from 'react-native';
import { Copy, ExternalLink } from 'lucide-react-native';
import { Button, MelaLights, Meter, PrivacyLine, Screen, Text, TextButton } from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useSession } from '@/components/providers';
import { useBalance } from '@/hooks/queries';
import { copyText } from '@/lib/clipboard';
import { CORE_MODE, EXPLORER_URL, FAUCET_URL } from '@/lib/core';
import { formatEth } from '@/lib/format';
import { useCopy } from '@/lib/i18n';
import { sharedCopy } from '@/screens/shared/copy';
import { CONFIGURED_WORKER_ADDRESS, SANDBOX_TRIGGERS, TRIGGERS_URL, sandboxWorker, useChannel, ZERO_ADDRESS } from '@/lib/triggers';

function Balance() {
  const c = useCopy(sharedCopy).advanced;
  const bal = useBalance();
  return (
    <View className="gap-2.5 rounded-block border-2 border-line bg-surface p-4">
      <Text className="text-[14px] font-semibold text-muted">{c.balance}</Text>
      <Meter value={bal.data !== undefined ? formatEth(bal.data) : '-.----'} tone={bal.data && bal.data > 0n ? 'money' : 'muted'} size="sm" />
      <Text className="text-[14px] text-muted">{c.balanceHint}</Text>
      <Button label={c.faucet} variant="secondary" size="md" full={false} icon={ExternalLink} onPress={() => Linking.openURL(FAUCET_URL)} />
    </View>
  );
}

/** Arkiv Triggers: which alert service runs this account's alerts, and this phone's channel. */
function AlertsInfo() {
  const c = useCopy(sharedCopy).advanced;
  const { address } = useSession();
  const channel = useChannel(address);
  const worker = SANDBOX_TRIGGERS ? (address ? sandboxWorker(address) : '') : CONFIGURED_WORKER_ADDRESS === ZERO_ADDRESS ? c.anyWorker : CONFIGURED_WORKER_ADDRESS;
  const rows: [string, string][] = [
    [c.alertService, SANDBOX_TRIGGERS ? c.alertServiceSandbox : TRIGGERS_URL || c.notSet],
    [c.alertWorker, worker],
    [c.alertChannel, channel?.id ?? c.notSet],
  ];
  return (
    <View className="gap-2.5 rounded-block border-2 border-line bg-surface p-4">
      <Text className="text-[14px] font-semibold text-muted">{c.alerts}</Text>
      {rows.map(([k, v]) => (
        <View key={k} className="gap-0.5">
          <Text className="text-[13px] text-muted">{k}</Text>
          <Text selectable className="text-[14px] leading-[19px]" style={{ fontFamily: 'monospace' }}>
            {v}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function Advanced() {
  const c = useCopy(sharedCopy).advanced;
  const { address, sandbox } = useSession();
  const real = CORE_MODE === 'real';
  return (
    <Screen title={c.title} contentClassName="gap-4 pb-10">
      <Rise index={0}>
        <View className="overflow-hidden rounded-block border-2 border-paper bg-surface">
          <MelaLights height={14} className="border-b-2 border-paper" />
          <View className="gap-2 p-4">
            <Text className="text-[14px] font-semibold text-muted">{c.accountId}</Text>
            <Text selectable className="text-[15px] leading-[21px]" style={{ fontFamily: 'monospace' }}>
              {address}
            </Text>
            <TextButton label={c.copy} tone="yellow" icon={Copy} onPress={() => address && copyText(address, c.copied)} />
          </View>
        </View>
      </Rise>
      <Rise index={1}>
        <View className="gap-1 rounded-block border-2 border-line bg-surface p-4">
          <Text className="text-[14px] font-semibold text-muted">{c.network}</Text>
          <Text className="text-[16px] font-bold">{real && !sandbox ? c.networkTest : c.networkSandbox}</Text>
          {real ? <TextButton label={c.explorer} tone="yellow" icon={ExternalLink} onPress={() => Linking.openURL(address ? `${EXPLORER_URL}/address/${address}` : EXPLORER_URL)} /> : null}
        </View>
      </Rise>
      <Rise index={2}>
        <AlertsInfo />
      </Rise>
      {real ? (
        <Rise index={3}>
          <Balance />
        </Rise>
      ) : null}
      <PrivacyLine text={c.note} />
    </Screen>
  );
}
