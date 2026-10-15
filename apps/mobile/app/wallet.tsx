import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { toast } from 'sonner-native';
import { AliasChip } from '@/components/AliasChip';
import { ArkivNote } from '@/components/ArkivNote';
import { Page } from '@/components/Bits';
import { QrDisplay } from '@/components/QrDisplay';
import { useSession } from '@/components/providers';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useBalance } from '@/hooks/queries';
import { copyText } from '@/lib/clipboard';
import { CORE_MODE, FAUCET_URL } from '@/lib/core';
import { aliasFor } from '@/lib/alias';
import { formatEth } from '@/lib/format';
import { ROLES } from '@/lib/session';
import { S } from '@/lib/strings';

function Backup({ privateKey }: { privateKey: string }) {
  const [shown, setShown] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);
  const reveal = () => {
    setShown(true);
    t.current = setTimeout(() => setShown(false), 30_000); // auto-hide
  };
  return (
    <View className="gap-3">
      <Text variant="caption" className="font-semibold text-destructive">{S.wallet.backupWarn}</Text>
      {shown ? (
        <View className="items-center gap-3">
          <QrDisplay value={privateKey} size={200} caption="Hides in 30 s" />
          <Button variant="outline" size="sm" onPress={() => { setShown(false); if (t.current) clearTimeout(t.current); }}>
            <Text>Hide now</Text>
          </Button>
        </View>
      ) : (
        <Pressable onLongPress={reveal} delayLongPress={1000} accessibilityRole="button" className="min-h-12 items-center justify-center rounded-lg border-2 border-dashed border-destructive px-4">
          <Text className="font-semibold text-destructive">{S.wallet.holdReveal}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function WalletScreen() {
  const { wallet, wallets, demo, replaceWallet, signOut, role } = useSession();
  const bal = useBalance();
  const [pk, setPk] = useState('');
  if (!wallet) return null;
  return (
    <Page>
      <Card className="gap-3">
        <CardHeader><CardTitle>{aliasFor(wallet.address)}</CardTitle></CardHeader>
        <CardContent className="items-center gap-3">
          <QrDisplay value={wallet.address} size={150} />
          <Button variant="soft" size="sm" onPress={() => copyText(wallet.address, 'Address copied')}>
            <Text className="font-mono text-xs">{wallet.address.slice(0, 10)}…{wallet.address.slice(-8)} · {S.common.copy}</Text>
          </Button>
          <Text>{S.wallet.balance}: <Text className="font-bold">{bal.data !== undefined ? formatEth(bal.data) : '…'}</Text></Text>
          {CORE_MODE === 'real' && (
            <Button variant="outline" size="sm" onPress={() => { copyText(wallet.address); Linking.openURL(FAUCET_URL); }}>
              <Text>{S.wallet.getFunds}</Text>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader><CardTitle>{S.wallet.backup}</CardTitle></CardHeader>
        <CardContent><Backup privateKey={wallet.privateKey} /></CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader><CardTitle>{S.wallet.importTitle}</CardTitle></CardHeader>
        <CardContent className="gap-2">
          <Input value={pk} onChangeText={setPk} placeholder={S.wallet.importPlaceholder} autoCapitalize="none" autoCorrect={false} secureTextEntry />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={!pk.trim()}>
                <Text>{S.wallet.import}</Text>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{S.wallet.importTitle}</AlertDialogTitle>
                <AlertDialogDescription>{S.wallet.importBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel><Text>{S.common.cancel}</Text></AlertDialogCancel>
                <AlertDialogAction
                  onPress={() => {
                    try {
                      replaceWallet(pk.trim());
                      setPk('');
                      toast.success(S.common.done);
                    } catch {
                      toast.error(S.wallet.invalidKey);
                    }
                  }}>
                  <Text>{S.wallet.importBtn}</Text>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {demo ? (
        <Card className="gap-2">
          <CardHeader><CardTitle>{S.wallet.demoWallets}</CardTitle></CardHeader>
          <CardContent className="gap-2">
            {ROLES.map((r) => wallets[r] && (
              <View key={r} className="flex-row items-center justify-between">
                <Text className="font-semibold">{S.roles[r]}{r === role ? ' (this tab)' : ''}</Text>
                <AliasChip address={wallets[r]!.address} />
              </View>
            ))}
          </CardContent>
        </Card>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost"><Text className="text-destructive">{S.wallet.signOut}</Text></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{S.wallet.signOut}</AlertDialogTitle>
              <AlertDialogDescription>Without a backup you will lose your receipts.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel><Text>{S.common.cancel}</Text></AlertDialogCancel>
              <AlertDialogAction onPress={signOut}><Text>{S.wallet.signOut}</Text></AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <ArkivNote text={S.wallet.loseNote} explainer="Receipts are records owned by your key. Import the same key on a new phone and they are yours again." />
    </Page>
  );
}
