import { useRef } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { S } from '@/lib/strings';

/** Camera barcode scanner. Callers MUST also offer a paste fallback (desktop / denied camera). */
export function QrScanner({ onResult, active = true, hint }: { onResult: (text: string) => void; active?: boolean; hint?: string }) {
  const [perm, ask] = useCameraPermissions();
  const last = useRef('');

  if (!perm) return <View className="h-64 rounded-2xl bg-muted" />;
  if (!perm.granted) {
    return (
      <View className="h-64 items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted p-4">
        <Icon as={Camera} size={28} className="text-muted-foreground" />
        <Text variant="muted" className="text-center">{perm.canAskAgain ? hint ?? S.scan.point : S.scan.cameraDenied}</Text>
        {perm.canAskAgain && (
          <Button size="sm" onPress={ask}>
            <Text>{S.scan.allowCamera}</Text>
          </Button>
        )}
      </View>
    );
  }
  return (
    <View className="h-72 overflow-hidden rounded-2xl bg-black">
      {active && (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (data && data !== last.current) {
              last.current = data;
              onResult(data);
            }
          }}
        />
      )}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-44 w-44 rounded-2xl border-2 border-white/80" />
      </View>
    </View>
  );
}
