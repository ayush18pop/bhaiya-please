import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';
import { Compass, Truck, Home as HomeIcon } from 'lucide-react-native';
import { ArkivNote } from '@/components/ArkivNote';
import { Page } from '@/components/Bits';
import { HOME } from '@/components/AppShell';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { S } from '@/lib/strings';

export default function Welcome() {
  const router = useRouter();
  const { role, wallet, setRole, startDemo } = useSession();

  // Returning user with a wallet skips straight to their home.
  if (role && wallet) return <Redirect href={HOME[role] as never} />;

  const pick = (r: 'resident' | 'runner') => {
    setRole(r);
    router.push(`/zone?next=${encodeURIComponent(HOME[r])}`);
  };

  return (
    <Page className="justify-center gap-6 pt-10">
      <View className="gap-3">
        <Text variant="caption" className="font-bold uppercase tracking-widest text-secondary">{S.app.name}</Text>
        <Text variant="h1" className="text-4xl leading-[44px]">{S.welcome.title}</Text>
        <Text variant="p" className="text-lg text-muted-foreground">{S.welcome.pitch}</Text>
      </View>

      <View className="gap-3">
        <Button
          size="lg"
          onPress={() => {
            startDemo();
            router.replace('/r');
          }}>
          <Icon as={Compass} size={20} className="text-primary-foreground" />
          <Text>{S.welcome.demo}</Text>
        </Button>
        <Button size="lg" variant="outline" onPress={() => pick('resident')}>
          <Icon as={HomeIcon} size={20} />
          <Text>{S.welcome.resident}</Text>
        </Button>
        <Button size="lg" variant="outline" onPress={() => pick('runner')}>
          <Icon as={Truck} size={20} />
          <Text>{S.welcome.runner}</Text>
        </Button>
        <Text variant="muted" className="text-center">{S.welcome.noPii}</Text>
      </View>

      <ArkivNote text={S.welcome.footer} explainer={S.welcome.footerNote} />
    </Page>
  );
}
