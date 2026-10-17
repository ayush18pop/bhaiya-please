/**
 * Native map. @maplibre/maplibre-react-native needs a dev/production build (native code), so in
 * Expo Go — or if the native module is missing — we render a schematic map instead: the same pins,
 * routes and freshness, drawn with react-native-svg over a few stand-in roads. No tiles, no crash.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { DARK_STYLE_URL, patchStyle } from './basemap';
import type { StyleLayerLike } from './basemap';
import { C, FONT, GATE, GATE_POST_DX, RUNNER, runnerPlateText, SHOP, TIER_PLATE } from './glyphs';
import { GateG, GateMarker, RUNNER_BOX, RunnerG, RunnerMarker, ShopG, shopBox, ShopMarker } from './NativeGlyphs';
import { arc, boundsOf } from './types';
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

/* ------------------------------------------------------------------ shared chrome */

const glass: ViewStyle = {
  backgroundColor: C.raised, // solid glass fallback: no backdrop blur on native
  borderWidth: 2,
  borderColor: C.paper,
  boxShadow: `4px 4px 0px 0px ${C.ink}`,
};

function NotePill({ note, placement, controls }: { note: string; placement?: 'top' | 'bottom'; controls?: boolean }) {
  const pos: StyleProp<ViewStyle> = (placement ?? 'top') === 'top' ? { top: 12 } : { bottom: 12 };
  return (
    <View pointerEvents="none" style={[s.note, glass, pos, { maxWidth: controls ? '72%' : '88%' }]}>
      <Text style={s.noteText} numberOfLines={2}>
        {note}
      </Text>
    </View>
  );
}

function GlassButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [s.btn, glass, pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
      {children}
    </Pressable>
  );
}

const LocateIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.paper} strokeWidth={2.4} strokeLinecap="round">
    <Circle cx={12} cy={12} r={7} />
    <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Svg>
);
const PlusIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.paper} strokeWidth={2.6}>
    <Path d="M5 12h14M12 5v14" />
  </Svg>
);

/* ------------------------------------------------------------------ Expo Go schematic */

const W = 360;
const H = 240;
/** Stand-in streets so the schematic reads as a map (not geographic). */
const MINOR_ROADS = ['M-10 50 L370 100', 'M60 -10 L100 250', 'M280 -10 L255 250', 'M-10 188 C110 172 220 206 370 182'];
const MAJOR_ROADS = ['M-10 135 C90 148 200 118 370 145', 'M170 -10 C162 80 186 160 178 250'];

/** Rough Baloo 2 800 13px text width — the SVG plates can't measure text. */
const textW = (t: string, px = 13) => t.length * px * 0.55;

function SvgPlate({ x, y, text, anchor = 'middle' }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' }) {
  const w = textW(text) + 14;
  const left = anchor === 'middle' ? x - w / 2 : x;
  return (
    <G>
      <Rect x={left} y={y - 11} width={w} height={22} rx={3} fill={C.paper} stroke={C.ink} strokeWidth={2} />
      <SvgText x={left + w / 2} y={y + 4.5} textAnchor="middle" fontFamily={FONT.body800} fontSize={13} fill={C.ink}>
        {text}
      </SvgText>
    </G>
  );
}

function Schematic(props: MapViewProps) {
  const runners = props.runners ?? [];
  const glide = useGlide(runners.map((r) => ({ id: r.id, pos: r.pos })));
  const b = boundsOf(props.fit) ?? [[77.74, 12.97], [77.75, 12.98]];
  const [[w, so], [e, n]] = b;
  const padX = (e - w) * 0.15;
  const padY = (n - so) * 0.15;
  const xy = (p: MapPoint) => ({
    x: ((p.lng - (w - padX)) / (e - w + 2 * padX)) * W,
    y: H - ((p.lat - (so - padY)) / (n - so + 2 * padY)) * H,
  });
  const path = (pts: MapPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${xy(p).x.toFixed(1)},${xy(p).y.toFixed(1)}`).join(' ');
  const routes = useMemo(
    () =>
      (props.routes ?? []).flatMap((r) => {
        const from = 'runner' in r.from ? glide[r.from.runner]?.pos : r.from;
        return from ? [{ id: r.id, d: path(arc(from, r.to, 20)), tone: r.tone }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.routes, glide, w, so, e, n],
  );
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.land }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Rect x={-200} y={-200} width={W + 400} height={H + 400} fill={C.land} />
        <Path d="M235 -10 C275 35 315 50 370 55 L370 -10 Z" fill={C.water} />
        {MINOR_ROADS.map((d) => (
          <Path key={d} d={d} stroke={C.minorRoad} strokeWidth={8} fill="none" />
        ))}
        {MAJOR_ROADS.map((d) => (
          <Path key={d} d={d} stroke={C.majorRoad} strokeWidth={14} fill="none" />
        ))}
        {routes.map((r) =>
          r.tone === 'primary' ? <Path key={`${r.id}-c`} d={r.d} stroke={C.ink} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null,
        )}
        {routes.map((r) => (
          <Path key={r.id} d={r.d} stroke={C.yellow} strokeWidth={r.tone === 'primary' ? 4 : 2.5} strokeOpacity={r.tone === 'primary' ? 1 : 0.45} strokeDasharray="10 8" fill="none" strokeLinejoin="round" />
        ))}
        {runners.flatMap((r) =>
          (r.trail ?? []).map((p, i, all) => (
            <Circle key={`${r.id}-t${i}`} cx={xy(p).x} cy={xy(p).y} r={3.5} fill={C.yellow} stroke={C.ink} strokeWidth={1.5} opacity={0.2 + (0.6 * (i + 1)) / all.length} />
          )),
        )}
        {(props.shops ?? []).map((sh) => {
          const p = xy(sh.pos);
          const bw = sh.selected ? SHOP.selW : SHOP.w;
          const bh = sh.selected ? SHOP.selH : SHOP.h;
          return (
            <G key={sh.id} onPress={props.onShopPress ? () => props.onShopPress?.(sh.id) : undefined}>
              <G transform={`translate(${p.x - bw / 2} ${p.y - bh / 2})`}>
                <ShopG category={sh.category} selected={sh.selected} />
              </G>
              {sh.selected ? <SvgPlate x={p.x} y={p.y + bh / 2 + 14} text={sh.name} /> : null}
            </G>
          );
        })}
        {props.society
          ? (() => {
              const p = xy(props.society.pos);
              return (
                <G>
                  <G transform={`translate(${p.x - GATE.w / 2 + GATE_POST_DX} ${p.y - GATE.h})`}>
                    <GateG />
                  </G>
                  <SvgPlate x={p.x + GATE_POST_DX} y={p.y - GATE.h - 10} text={props.society.label} />
                </G>
              );
            })()
          : null}
        {runners.map((r) => {
          const g = glide[r.id] ?? { pos: r.pos };
          const p = xy(g.pos);
          const plate = r.focused ? runnerPlateText(r) : '';
          const tier = r.focused && r.tier ? TIER_PLATE[r.tier] : null;
          const plateW = plate ? textW(plate) + 14 : 0;
          return (
            <G key={r.id} onPress={props.onRunnerPress ? () => props.onRunnerPress?.(r.id) : undefined}>
              {r.focused && r.freshness === 'live' ? (
                <Circle cx={p.x} cy={p.y} r={RUNNER.halo} fill={C.yellow} fillOpacity={0.08} stroke={C.yellow} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="5 5" />
              ) : null}
              <G transform={`translate(${p.x} ${p.y})`}>
                <RunnerG r={r} heading={r.heading ?? g.heading} />
              </G>
              {plate ? <SvgPlate x={p.x + 22} y={p.y} text={plate} anchor="start" /> : null}
              {tier ? (
                <G>
                  <Rect x={p.x + 26 + plateW} y={p.y - 8} width={tier.label.length * 7 + 8} height={16} rx={3} fill={tier.bg} stroke={C.ink} strokeWidth={2} />
                  <SvgText x={p.x + 30 + plateW + (tier.label.length * 7) / 2} y={p.y + 3.5} textAnchor="middle" fontFamily={FONT.display} fontSize={9} fill={C.ink}>
                    {tier.label}
                  </SvgText>
                </G>
              ) : null}
            </G>
          );
        })}
      </Svg>
      {props.note ? <NotePill note={props.note} placement={props.notePlacement} /> : null}
      <Text style={[s.caption, (props.notePlacement ?? 'top') === 'bottom' ? { top: 10 } : { bottom: 8 }]}>Schematic view</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ MapLibre native */

let styleCache: Promise<object | null> | null = null;
function loadBrandStyle(): Promise<object | null> {
  if (!styleCache) {
    styleCache = fetch(DARK_STYLE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { layers?: StyleLayerLike[] } | null) => (j && Array.isArray(j.layers) ? patchStyle(j as { layers: StyleLayerLike[] }) : null))
      .catch(() => null)
      .then((style) => {
        if (!style) styleCache = null; // retry on next mount
        return style;
      });
  }
  return styleCache;
}

/** Patched style JSON (brand colours) when it loads in time; otherwise the plain dark style URL. */
function useBrandStyle(): string | object | undefined {
  const [style, setStyle] = useState<string | object | undefined>(undefined);
  useEffect(() => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) setStyle(DARK_STYLE_URL);
      done = true;
    }, 4000);
    loadBrandStyle().then((st) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      setStyle(st ?? DARK_STYLE_URL);
    });
    return () => {
      done = true;
      clearTimeout(t);
    };
  }, []);
  return style;
}

function NativeMap(props: MapViewProps) {
  const mapStyle = useBrandStyle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const camera = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);
  const runners = props.runners ?? [];
  const glide = useGlide(runners.map((r) => ({ id: r.id, pos: r.pos })));
  const pad = { top: 60, bottom: 40, left: 40, right: 40, ...props.padding };
  const b = boundsOf(props.fit);
  const lngLatBounds = b ? [b[0][0], b[0][1], b[1][0], b[1][1]] : null;

  const refit = (duration = 900) => {
    const nb = boundsOf(props.fit);
    if (nb) camera.current?.fitBounds?.([nb[0][0], nb[0][1], nb[1][0], nb[1][1]], { padding: pad, duration });
  };
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    refit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey]);

  const zoomIn = async () => {
    try {
      const z = await map.current?.getZoom?.();
      if (typeof z === 'number') camera.current?.zoomTo?.(z + 1, { duration: 300 });
    } catch {
      /* ignore */
    }
  };

  const lines = {
    type: 'FeatureCollection',
    features: (props.routes ?? []).flatMap((r) => {
      const from = 'runner' in r.from ? glide[r.from.runner]?.pos : r.from;
      return from ? [{ type: 'Feature', properties: { tone: r.tone }, geometry: { type: 'LineString', coordinates: arc(from, r.to).map((p) => [p.lng, p.lat]) } }] : [];
    }),
  };
  const trail = {
    type: 'FeatureCollection',
    features: runners.flatMap((r) =>
      (r.trail ?? []).map((p, i, all) => ({ type: 'Feature', properties: { o: 0.2 + (0.6 * (i + 1)) / all.length }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    ),
  };

  if (!mapStyle) return <View style={[StyleSheet.absoluteFill, { backgroundColor: C.land }]} />;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.land }]}>
      <ML.Map
        ref={map}
        style={{ flex: 1, backgroundColor: C.land }}
        mapStyle={mapStyle}
        attribution
        attributionPosition={{ bottom: 8, right: 8 }}
        logo={false}
        tintColor={C.muted}
        compass={false}
        touchPitch={false}
        touchRotate={false}>
        <ML.Camera
          ref={camera}
          initialViewState={lngLatBounds ? { bounds: lngLatBounds, padding: pad } : { center: [77.7447, 12.975], zoom: 14 }}
        />
        <ML.GeoJSONSource id="bp-routes" data={lines}>
          <ML.Layer id="bp-route-casing" type="line" filter={['==', ['get', 'tone'], 'primary']} layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': C.ink, 'line-width': 7 }} />
          <ML.Layer
            id="bp-route-line"
            type="line"
            layout={{ 'line-join': 'round' }}
            paint={{
              'line-color': C.yellow,
              'line-width': ['match', ['get', 'tone'], 'primary', 4, 2.5],
              'line-opacity': ['match', ['get', 'tone'], 'primary', 1, 0.45],
              'line-dasharray': [2.5, 2],
            }}
          />
        </ML.GeoJSONSource>
        <ML.GeoJSONSource id="bp-trail" data={trail}>
          <ML.Layer
            id="bp-trail-dots"
            type="circle"
            paint={{ 'circle-radius': 3.5, 'circle-color': C.yellow, 'circle-opacity': ['get', 'o'], 'circle-stroke-color': C.ink, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['get', 'o'] }}
          />
        </ML.GeoJSONSource>
        {(props.shops ?? []).map((sh) => (
          <ML.ViewAnnotation
            key={`${sh.id}:${sh.selected ? 1 : 0}`}
            id={`shop-${sh.id}`}
            lngLat={[sh.pos.lng, sh.pos.lat]}
            anchor="top"
            offset={[0, -shopBox(sh.selected).h / 2]}
            onPress={props.onShopPress ? () => props.onShopPress?.(sh.id) : undefined}>
            <ShopMarker shop={sh} />
          </ML.ViewAnnotation>
        ))}
        {props.society ? (
          <ML.ViewAnnotation id="society" lngLat={[props.society.pos.lng, props.society.pos.lat]} anchor="bottom" offset={[GATE_POST_DX, 0]}>
            <GateMarker label={props.society.label} />
          </ML.ViewAnnotation>
        ) : null}
        {runners.map((r) => {
          const g = glide[r.id] ?? { pos: r.pos };
          return (
            <ML.ViewAnnotation
              key={r.id}
              id={`runner-${r.id}`}
              lngLat={[g.pos.lng, g.pos.lat]}
              anchor="left"
              offset={[-RUNNER_BOX / 2, 0]}
              onPress={props.onRunnerPress ? () => props.onRunnerPress?.(r.id) : undefined}>
              <RunnerMarker r={r} heading={r.heading ?? g.heading} />
            </ML.ViewAnnotation>
          );
        })}
      </ML.Map>
      {props.note ? <NotePill note={props.note} placement={props.notePlacement} controls={props.controls} /> : null}
      {props.controls ? (
        <View style={s.controls}>
          <GlassButton label="Locate me" onPress={() => refit(600)}>
            <LocateIcon />
          </GlassButton>
          <GlassButton label="Zoom in" onPress={zoomIn}>
            <PlusIcon />
          </GlassButton>
        </View>
      ) : null}
    </View>
  );
}

export function MapView(props: MapViewProps) {
  return (
    <View style={[{ overflow: 'hidden', position: 'relative', backgroundColor: C.land }, props.style]}>
      {ML?.Map ? <NativeMap {...props} /> : <Schematic {...props} />}
    </View>
  );
}

const s = StyleSheet.create({
  note: { position: 'absolute', left: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  noteText: { color: C.paper, fontFamily: FONT.body700, fontSize: 13, lineHeight: 17 },
  caption: { position: 'absolute', right: 10, color: C.muted, fontFamily: FONT.body600, fontSize: 11 },
  controls: { position: 'absolute', top: 12, right: 12, gap: 8 },
  btn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
