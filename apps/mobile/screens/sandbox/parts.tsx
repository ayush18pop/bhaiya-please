/** Sandbox chrome: the mela-light banner and the full-width crowd strip (F1). */
import { View } from 'react-native';
import { MelaLights, Marquee, Peep } from '@/components/bp';
import { cn } from '@/lib/utils';

export function SandboxStrip({ text, right, height = 48, className }: { text: string; right?: React.ReactNode; height?: number; className?: string }) {
  return (
    <View accessibilityRole="summary" accessibilityLabel="Sandbox. Nothing here is real." className={cn('flex-row border-b-2 border-paper bg-ink', className)} style={{ height }}>
      <MelaLights width={72} />
      <Marquee text={text} className="justify-center px-6" />
      {right ?? <MelaLights width={72} />}
    </View>
  );
}

const BACK = ['p0', 'p5', 'p13', 'p4', 'p7', 'p16', 'p2', 'p22', 'p8', 'p17', 'p10', 'p24', 'p1', 'p26', 'p18', 'p33', 'p6', 'p14', 'p9', 'p27', 'p15', 'p31', 'p36', 'p23'];
const FRONT = ['p50', 'p60', 'p25', 'p61', 'p3', 'p48', 'p63', 'p59', 'p20', 'p52', 'p71', 'p41', 'p34', 'p56', 'p11', 'p42', 'p45'];

/** Packed crowd bleeding off both edges; one yellow accent. Decorative. */
export function CrowdBanner({ height = 230 }: { height?: number }) {
  return (
    <View aria-hidden pointerEvents="none" className="overflow-hidden border-t-3 border-ink bg-paper" style={{ height }}>
      <View className="absolute flex-row" style={{ left: -40, bottom: 70 }}>
        {BACK.map((s) => (
          <View key={s} style={{ marginRight: -40 }}>
            <Peep seed={s} size={110} />
          </View>
        ))}
      </View>
      <View className="absolute flex-row" style={{ left: -70, bottom: -24 }}>
        {FRONT.map((s, i) => (
          <View key={s} style={{ marginRight: -54 }}>
            <Peep seed={s} size={150} accent={i === 4} />
          </View>
        ))}
      </View>
    </View>
  );
}
