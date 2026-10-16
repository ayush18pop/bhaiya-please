import { useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { Redirect } from 'expo-router';
import { toast } from 'sonner-native';
import { ArkivNote } from '@/components/ArkivNote';
import { Page } from '@/components/Bits';
import { QrDisplay } from '@/components/QrDisplay';
import { useCore, useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useBalance } from '@/hooks/queries';
import { copyText } from '@/lib/clipboard';
import { CORE_MODE, FAUCET_URL } from '@/lib/core';
import { aliasFor } from '@/lib/alias';
import { formatEth } from '@/lib/format';
import { S } from '@/lib/strings';

function Centered({ children }: { children: React.ReactNode }) {
  return <Page className="justify-center">{children}</Page>;
}

function NoWallet() {
  const { createMyWallet, replaceWallet, role } = useSession();
  const [pk, setPk] = useState('');
  const [showImport, setShowImport] = useState(false);
  return (
    <Centered>
      <Card>
        <CardHeader>
          <CardTitle>{S.wallet.create}</CardTitle>
          <CardDescription>{S.wallet.createHint}</CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Button size="lg" onPress={createMyWallet}>
            <Text>{S.wallet.create}</Text>
          </Button>
          <Button variant="ghost" onPress={() => setShowImport((s) => !s)}>
            <Text>{S.wallet.import}</Text>
          </Button>
          {showImport && (
            <View className="gap-2">
              <Input value={pk} onChangeText={setPk} placeholder={S.wallet.importPlaceholder} autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <Button
                variant="outline"
                disabled={!pk.trim() || !role}
                onPress={() => {
                  try {
                    replaceWallet(pk.trim());
                  } catch {
                    toast.error(S.wallet.invalidKey);
                  }
                }}>
                <Text>{S.wallet.import}</Text>
              </Button>
            </View>
          )}
          <ArkivNote text={S.wallet.backupNudge} />
        </CardContent>
      </Card>
    </Centered>
  );
}

function Unfunded() {
  const core = useCore();
  const { address } = useSession();
  const bal = useBalance();
  const [opened, setOpened] = useState(false);
  const addr = core.address ?? address!;
  return (
    <Centered>
      <Card>
        <CardHeader>
          <CardTitle>{S.wallet.unfundedTitle}</CardTitle>
          <CardDescription>{S.wallet.unfundedBody}</CardDescription>
        </CardHeader>
        <CardContent className="items-center gap-3">
          <Text className="font-semibold">{aliasFor(addr)}</Text>
          <QrDisplay value={addr} size={160} />
          <Button variant="outline" size="sm" onPress={() => copyText(addr)}>
            <Text className="font-mono text-xs">{addr.slice(0, 10)}…{addr.slice(-6)}  ·  {S.common.copy}</Text>
          </Button>
          <Button
            size="lg"
            className="w-full"
            onPress={() => {
              copyText(addr, 'Address copied. Paste it in the faucet.');
              Linking.openURL(FAUCET_URL);
              setOpened(true);
            }}>
            <Text>{S.wallet.getFunds}</Text>
          </Button>
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" />
            <Text variant="muted">{opened ? S.wallet.waiting : `${S.wallet.balance}: ${formatEth(bal.data ?? 0n)}`}</Text>
          </View>
        </CardContent>
      </Card>
    </Centered>
  );
}

/** Unfunded wallets can still browse the live chain read-only; funding is only needed to write. */
function Funded({ children }: { children: React.ReactNode }) {
  const bal = useBalance();
  const [showFunding, setShowFunding] = useState(false);
  const unfunded = CORE_MODE === 'real' && bal.isSuccess && bal.data === 0n;
  if (unfunded && showFunding) return <Unfunded />;
  return (
    <View className="flex-1">
      {unfunded && (
        <View className="flex-row items-center gap-3 border-b border-border bg-muted px-4 py-2">
          <Text variant="caption" className="flex-1">
            {S.wallet.readOnlyBanner}
          </Text>
          <Button size="sm" onPress={() => setShowFunding(true)}>
            <Text>{S.wallet.getFunds}</Text>
          </Button>
        </View>
      )}
      {children}
    </View>
  );
}

/** Wraps every screen that needs a wallet: no wallet -> create, unfunded -> faucet, ready -> children. */
export function WalletGate({ children }: { children: React.ReactNode }) {
  const { wallet, core, coreError, setRole, role } = useSession();
  if (!role) return <Redirect href="/" />;
  if (!wallet) return <NoWallet />;
  if (coreError)
    return (
      <Centered>
        <Text className="text-center font-semibold">{S.common.notSent}</Text>
        <Text variant="muted" className="text-center">{coreError}</Text>
        <Button onPress={() => role && setRole(role)}>
          <Text>{S.common.tryAgain}</Text>
        </Button>
      </Centered>
    );
  if (!core)
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  return <Funded>{children}</Funded>;
}
