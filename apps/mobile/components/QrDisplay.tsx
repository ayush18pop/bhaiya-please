import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Text } from '@/components/bp';
import { C } from '@/lib/utils';

/** QR on a white panel with an ink frame (scans in any light). No decoration. */
export function QrDisplay({ value, size = 220, caption, label = 'QR code' }: { value: string; size?: number; caption?: string; label?: string }) {
  return (
    <View className="items-center gap-2">
      <View accessibilityRole="image" accessibilityLabel={label} className="border-2 border-ink bg-white p-4">
        <QRCode value={value} size={size} color={C.ink} backgroundColor={C.white} ecl="M" />
      </View>
      {caption ? <Text className="text-center text-[14px] text-muted">{caption}</Text> : null}
    </View>
  );
}
