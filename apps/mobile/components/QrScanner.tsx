/**
 * Camera QR scanner (C8, E1). Pure function: torch, frame corners and one pill are the only overlays.
 * Frame states: searching (dashed yellow) · detected (solid green) · wrong (coral). Callers MUST also
 * offer a paste fallback (desktop, denied camera).
 */
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Flashlight } from 'lucide-react-native';
import { Button, Icon, IconButton, Text } from '@/components/bp';
import { cn } from '@/lib/utils';

export type ScanFrame = 'searching' | 'detected' | 'wrong';

function Corners({ state, size }: { state: ScanFrame; size: number }) {
  const col = state === 'detected' ? 'border-go' : state === 'wrong' ? 'border-mirchi' : 'border-yellow';
  const c = 'absolute h-11 w-11';
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <View className={cn(c, col, 'left-0 top-0 border-l-4 border-t-4')} />
      <View className={cn(c, col, 'right-0 top-0 border-r-4 border-t-4')} />
      <View className={cn(c, col, 'bottom-0 left-0 border-b-4 border-l-4')} />
      <View className={cn(c, col, 'bottom-0 right-0 border-b-4 border-r-4')} />
    </View>
  );
}

export function QrScanner({
  onResult, active = true, state = 'searching', pill, top, height = 420, className,
}: { onResult: (text: string) => void; active?: boolean; state?: ScanFrame; pill?: string; top?: React.ReactNode; height?: number; className?: string }) {
  const [perm, ask] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const last = useRef('');

  if (!perm) return <View className={cn('rounded-block bg-[#0D0D0B]', className)} style={{ height }} />;
  if (!perm.granted) {
    return (
      <View className={cn('items-center justify-center gap-3 rounded-block border-2 border-dashed border-line bg-[#0D0D0B] p-5', className)} style={{ height }}>
        <Icon as={Camera} size={30} className="text-muted" />
        <Text className="text-center text-[15px] text-muted">
          {perm.canAskAgain ? 'Allow the camera to scan codes. It is only used while this screen is open.' : 'Camera is blocked. Allow it in your phone settings, or paste the handoff link instead.'}
        </Text>
        {perm.canAskAgain ? <Button label="Allow camera" size="md" full={false} onPress={ask} /> : null}
      </View>
    );
  }
  return (
    <View className={cn('overflow-hidden rounded-block border-2 border-paper bg-[#0D0D0B]', className)} style={{ height }}>
      {active ? (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (data && data !== last.current) {
              last.current = data;
              onResult(data);
              setTimeout(() => (last.current = ''), 2500);
            }
          }}
        />
      ) : null}
      <View pointerEvents="box-none" className="absolute left-3 right-3 top-3 flex-row items-center justify-between gap-2">
        <View className="flex-1">{top}</View>
        {Platform.OS !== 'web' ? <IconButton icon={Flashlight} label={torch ? 'Torch off' : 'Torch on'} glass size={56} onPress={() => setTorch((x) => !x)} /> : null}
      </View>
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <Corners state={state} size={Math.min(260, height - 140)} />
      </View>
      {pill ? (
        <View pointerEvents="none" className="absolute bottom-4 left-4 right-4 items-center">
          <View className="rounded-pill border-2 border-paper bg-ink px-[18px] py-2.5">
            <Text className="text-[16px] font-bold text-paper">{pill}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
