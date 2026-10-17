import { Tabs } from 'expo-router';
import { TabBar } from '@/components/shell/TabBar';
import { C } from '@/lib/utils';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(p) => <TabBar {...(p as unknown as Parameters<typeof TabBar>[0])} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.ink }, animation: 'fade' }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
