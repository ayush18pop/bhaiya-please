/**
 * Native map. @maplibre/maplibre-react-native needs a dev/production build (native code), so in
 * Expo Go — or if the native module is missing — we render a schematic map instead: the same pins,
 * routes and freshness, drawn with react-native-svg over a quiet grid. No tiles, no crash.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import Constants from 'expo-constants';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { arc, BRAND, boundsOf, TIER_RING } from './types';
import type { MapPoint, MapViewProps } from './types';
import { useGlide } from './useGlide';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ML: any = null;
if (Constants.executionEnvironment !== 'storeClient') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ML = require('@maplibre/maplibre-react-native');
  } catch {
    ML = null;
  }
}

const W = 360;
const H = 240;

function Schematic(props: MapViewProps) {
  const runners = props.runners ?? [];
  const glide = useGlide(runners.map((r) => ({ id: r.id, pos: r.pos })));
  const b = boundsOf(props.fit) ?? [[77.74, 12.97], [77.75, 12.98]];
  const [[w, s], [e, n]] = b;
  const padX = (e - w) * 0.12;
  const padY = (n - s) * 0.12;
  const xy = (p: MapPoint) => ({
    x: ((p.lng - (w - padX)) / (e - w + 2 * padX)) * W,
    y: H - ((p.lat - (s - padY)) / (n - s + 2 * padY)) * H,
  });
  const routes = useMemo(
    () =>
      (props.routes ?? []).flatMap((r) => {
        const from = 'runner' in r.from ? glide[r.from.runner]?.pos : r.from;
        if (!from) return [];
        const d = arc(from, r.to, 20).map((p, i) => `${i ? 'L' : 'M'}${xy(p).x.toFixed(1)},${xy(p).y.toFixed(1)}`).join(' ');
        return [{ id: r.id, d, tone: r.tone }];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.routes, glide, w, s, e, n],
  );
  return (
    <View className="absolute inset-0 bg-[#f3efe7]">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 9 }).map((_, i) => (
          <Line key={`v${i}`} x1={(i * W) / 8} y1={0} x2={(i * W) / 8} y2={H} stroke="#e4ddd0" strokeWidth={1} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <Line key={`h${i}`} x1={0} y1={(i * H) / 6} x2={W} y2={(i * H) / 6} stroke="#e4ddd0" strokeWidth={1} />
        ))}
        {routes.map((r) => (
          <Path key={r.id} d={r.d} stroke={BRAND} strokeWidth={r.tone === 'primary' ? 3 : 2} strokeOpacity={r.tone === 'primary' ? 1 : 0.4} strokeDasharray="6 5" fill="none" strokeLinecap="round" />
        ))}
        {(props.shops ?? []).map((sh) => {
          const p = xy(sh.pos);
          return <Rect key={sh.id} x={p.x - 6} y={p.y - 6} width={12} height={12} rx={3} fill={sh.selected ? BRAND : '#fff'} stroke={sh.selected ? '#fff' : '#c2410c'} strokeWidth={1.5} onPress={() => props.onShopPress?.(sh.id)} />;
        })}
        {props.society ? (
          <G>
            <Circle cx={xy(props.society.pos).x} cy={xy(props.society.pos).y} r={9} fill={BRAND} stroke="#fff" strokeWidth={3} />
          </G>
        ) : null}
        {runners.map((r) => {
          const g = glide[r.id] ?? { pos: r.pos };
          const p = xy(g.pos);
          const ring = TIER_RING[r.tier ?? 'unknown'];
          const h = r.heading ?? g.heading;
          return (
            <G key={r.id} opacity={r.freshness === 'live' ? 1 : 0.45} onPress={() => props.onRunnerPress?.(r.id)}>
              {r.freshness === 'live' ? <Circle cx={p.x} cy={p.y} r={16} fill={ring} opacity={0.18} /> : null}
              {h !== undefined ? <Polygon points={`${p.x},${p.y - 17} ${p.x - 5},${p.y - 10} ${p.x + 5},${p.y - 10}`} fill={ring} rotation={h} origin={`${p.x},${p.y}`} /> : null}
              <Circle cx={p.x} cy={p.y} r={9} fill="#fff" stroke={ring} strokeWidth={3} />
            </G>
          );
        })}
      </Svg>
      <View className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-1">
        <Text className="text-[10px] font-semibold text-slate-600">Schematic view · full map in the app build</Text>
      </View>
      {runners.filter((r) => r.chip).slice(0, 2).map((r, i) => (
        <View key={r.id} className="absolute right-2 rounded-full bg-white px-2.5 py-1 shadow" style={{ bottom: 8 + i * 30 }}>
          <Text className="text-xs font-bold">{r.chip}{r.sub ? ` · ${r.sub}` : ''}</Text>
        </View>
      ))}
    </View>
  );
}

function NativeMap(props: MapViewProps) {
  const b = boundsOf(props.fit);
  const runners = props.runners ?? [];
  const glide = useGlide(runners.map((r) => ({ id: r.id, pos: r.pos })));
  const lines = {
    type: 'FeatureCollection',
    features: (props.routes ?? []).flatMap((r) => {
      const from = 'runner' in r.from ? glide[r.from.runner]?.pos : r.from;
      return from ? [{ type: 'Feature', properties: { tone: r.tone }, geometry: { type: 'LineString', coordinates: arc(from, r.to).map((p) => [p.lng, p.lat]) } }] : [];
    }),
  };
  const pin = (fill: string, ring: string, faded = false) => (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: fill, borderWidth: 3, borderColor: ring, opacity: faded ? 0.45 : 1 }} />
  );
  return (
    <View className="absolute inset-0">
      <ML.Map style={{ flex: 1 }} mapStyle="https://tiles.openfreemap.org/styles/positron" attribution compass={false}>
        {b ? <ML.Camera initialViewState={{ bounds: [b[0][0], b[0][1], b[1][0], b[1][1]], padding: { top: 60, bottom: 40, left: 40, right: 40 } }} /> : null}
        <ML.GeoJSONSource id="routes" data={lines}>
          <ML.Layer id="route" type="line" paint={{ 'line-color': BRAND, 'line-width': 3, 'line-dasharray': [2, 1.6] }} />
        </ML.GeoJSONSource>
        {props.society ? <ML.ViewAnnotation id="society" lngLat={[props.society.pos.lng, props.society.pos.lat]}>{pin(BRAND, '#fff')}</ML.ViewAnnotation> : null}
        {(props.shops ?? []).map((s) => (
          <ML.ViewAnnotation key={s.id} id={s.id} lngLat={[s.pos.lng, s.pos.lat]}>{pin(s.selected ? BRAND : '#fff', '#c2410c')}</ML.ViewAnnotation>
        ))}
        {runners.map((r) => {
          const g = glide[r.id] ?? { pos: r.pos };
          return (
            <ML.ViewAnnotation key={r.id} id={r.id} lngLat={[g.pos.lng, g.pos.lat]}>
              {pin('#fff', TIER_RING[r.tier ?? 'unknown'], r.freshness !== 'live')}
            </ML.ViewAnnotation>
          );
        })}
      </ML.Map>
    </View>
  );
}

export function MapView(props: MapViewProps) {
  return <View style={[{ overflow: 'hidden', position: 'relative' }, props.style]}>{ML?.Map ? <NativeMap {...props} /> : <Schematic {...props} />}</View>;
}
