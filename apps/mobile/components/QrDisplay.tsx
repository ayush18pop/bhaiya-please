import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Text } from '@/components/ui/text';

/** QR sits on a white tile so it scans in dark mode too. */
export function QrDisplay({ value, size = 220, caption }: { value: string; size?: number; caption?: string }) {
  return (
    <View className="items-center gap-2">
      <View className="rounded-2xl bg-white p-4" accessibilityLabel="QR code">
        <QRCode value={value} size={size} color="#1a1d24" backgroundColor="#ffffff" ecl="M" />
      </View>
      {caption ? <Text variant="muted" className="text-center">{caption}</Text> : null}
    </View>
  );
}
