import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';
import { Bike, Compass, MapPin, ShoppingBag, Truck, Home as HomeIcon } from 'lucide-react-native';
import { ArkivNote } from '@/components/ArkivNote';
import { Page } from '@/components/Bits';
import { HOME } from '@/components/AppShell';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { S } from '@/lib/strings';

/** Vector hero: a saffron disc, the bag, and neighbours converging on the gate. */
function Hero() {
  return (
    <View className="h-44 items-center justify-center overflow-hidden rounded-sheet bg-accent">
      <View className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-primary/10" />
      <View className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-secondary/10" />
      <View className="absolute left-8 top-6 h-11 w-11 items-center justify-center rounded-full bg-card shadow-lift">
        <Icon as={HomeIcon} size={20} className="text-secondary" />
      </View>
      <View className="absolute bottom-6 right-8 h-11 w-11 items-center justify-center rounded-full bg-card shadow-lift">
        <Icon as={Bike} size={20} className="text-primary-ink" />
      </View>
      <View className="absolute right-14 top-7 h-8 w-8 items-center justify-center rounded-full bg-card shadow-card">
        <Icon as={MapPin} size={15} className="text-muted-foreground" />
      </View>
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-cta">
        <Icon as={ShoppingBag} size={38} strokeWidth={2.2} className="text-white" />
      </View>
    </View>
  );
}

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
    <Page className="justify-center gap-6 pt-6">
      <Hero />
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
