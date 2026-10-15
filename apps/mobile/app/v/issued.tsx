import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AliasChip } from '@/components/AliasChip';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { useCore } from '@/components/providers';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useMyIssued } from '@/hooks/queries';
import { monthYear, fmt } from '@/lib/format';
import { S } from '@/lib/strings';
import { useState } from 'react';
import { TxBanner } from '@/components/TxBanner';

export default function Issued() {
  const core = useCore();
  const qc = useQueryClient();
  const q = useMyIssued();
  const [failed, setFailed] = useState<unknown>(null);
  return (
    <Page>
      <Text variant="h2">{S.verifier.issued}</Text>
      {q.isLoading && !q.data ? (
        <SkeletonCards n={1} />
      ) : !q.data?.length ? (
        <EmptyState title={S.verifier.nothingIssued} />
      ) : (
        <View className="gap-3">
          {q.data.map((a) => (
            <Card key={a.key} className="gap-2 px-4">
              <AliasChip address={a.subject} />
              <Text variant="muted">{a.level.replace('_', ' ')} · {fmt(S.profile.until, { d: monthYear(a.expiresAt) })}</Text>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="self-start">
                    <Text>{S.verifier.revoke}</Text>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{S.verifier.revokeTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{S.verifier.revokeBody}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel><Text>{S.common.cancel}</Text></AlertDialogCancel>
                    <AlertDialogAction
                      onPress={() => {
                        setFailed(null);
                        core.revokeAttestation(a.key).then(() => qc.invalidateQueries()).catch(setFailed);
                      }}>
                      <Text>{S.verifier.revoke}</Text>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </View>
      )}
      {failed ? <TxBanner error={failed} /> : null}
    </Page>
  );
}
