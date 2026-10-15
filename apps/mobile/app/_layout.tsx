import '../global.css';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { colorScheme, useColorScheme } from 'nativewind';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortalHost } from '@rn-primitives/portal';
import { Toaster } from 'sonner-native';
import { AppShell } from '@/components/AppShell';
import { CoreProvider } from '@/components/providers';
import { WalletGate } from '@/components/WalletGate';

const PUBLIC = ['index', 'zone'];
const LIGHT = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#faf8f3', card: '#ffffff', text: '#1a1d24', border: '#dcd6cb', primary: '#c94a10' } };
const DARK = { ...DarkTheme, colors: { ...DarkTheme.colors, background: '#12141a', card: '#1b1e26', text: '#f3eee6', border: '#2d313b', primary: '#ee6a2e' } };

export default function RootLayout() {
  const { colorScheme: scheme } = useColorScheme();
  // Follow the OS setting until the user taps the toggle.
  useEffect(() => {
    colorScheme.set('system');
  }, []);
  // NativeWind's class strategy on web needs the `dark` class on <html> for the CSS variables.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', scheme === 'dark');
  }, [scheme]);
  return (
    <ThemeProvider value={scheme === 'dark' ? DARK : LIGHT}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CoreProvider>
          <StatusBar style="auto" />
          <AppShell>
            <Stack
              screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
              // Gate inside each screen so the navigator itself never unmounts (role switch, wallet setup).
              screenLayout={({ route, children }) => (PUBLIC.includes(route.name) ? children : <WalletGate>{children}</WalletGate>)}
            />
          </AppShell>
          <PortalHost />
          <Toaster position="top-center" />
        </CoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ThemeProvider>
  );
}
