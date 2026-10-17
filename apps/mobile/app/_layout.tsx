import '../global.css';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { DarkTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortalHost } from '@rn-primitives/portal';
import { Asset } from 'expo-asset';
import { FontDisplay, useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Toaster } from '@/components/bp';
import { CoreProvider, useSession } from '@/components/providers';
import { SandboxBanner } from '@/components/shell/SandboxBanner';
import { Splash } from '@/screens/onboarding/Splash';
import { FrameBridge } from '@/screens/sandbox/FrameBridge';
import { FONT_ASSETS } from '@/lib/fonts';
import { C, cn } from '@/lib/utils';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Web: font-display swap so text paints immediately, then swaps to the brand fonts.
const FONT_MAP = Object.fromEntries(
  Object.entries(FONT_ASSETS).map(([k, mod]) => [k, Platform.OS === 'web' ? { uri: Asset.fromModule(mod as number).uri, display: FontDisplay.SWAP } : mod]),
) as Record<string, never>;

const THEME = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.ink, card: C.ink, text: C.paper, border: C.line, primary: C.yellow } };

/** Phone-width column on desktop web, except full-width surfaces (sandbox split view, society desk). */
function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { mode, sandbox, framed } = useSession();
  const wide = path.startsWith('/sandbox') || (mode === 'desk' && !framed);
  return (
    <View className="flex-1 items-center bg-[#0D0D0B]">
      <View className={cn('w-full flex-1 bg-bg', !wide && 'max-w-[480px] md:border-x-2 md:border-line')}>
        {sandbox && !framed && !path.startsWith('/sandbox') ? <SandboxBanner /> : null}
        <View className="flex-1">{children}</View>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  const ready = fontsLoaded || !!fontError || Platform.OS === 'web';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <ThemeProvider value={THEME}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.ink }}>
        <SafeAreaProvider>
          <CoreProvider>
            <StatusBar style="light" />
            <Frame>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: C.ink },
                  animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
                  animationDuration: 220,
                }}
              />
            </Frame>
            <PortalHost />
            <Toaster />
            <FrameBridge />
            <Splash ready />
          </CoreProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
