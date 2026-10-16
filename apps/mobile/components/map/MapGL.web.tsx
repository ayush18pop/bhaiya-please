/**
 * Web map: MapLibre GL via react-map-gl, OpenFreeMap vector tiles (no API key). Lazy-loaded by
 * MapView.web.tsx so maplibre (~250 KB gz) never blocks first paint.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef } from 'react';
import Map, { Layer, Marker, Source } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Feature, LineString, Point } from 'geojson';
import { useColorScheme } from 'nativewind';
import { CATEGORY_ICON, RunnerIcon, SocietyIcon } from './icons';
import { arc, BRAND, boundsOf, TIER_RING } from './types';
import type { MapPoint, MapViewProps, RunnerPin, ShopPin } from './types';
import { useGlide } from './useGlide';

const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

const CSS = `
@keyframes bp-pulse { 0% { transform: scale(.6); opacity: .55 } 100% { transform: scale(2.3); opacity: 0 } }
.bp-pulse { position:absolute; inset:0; border-radius:9999px; animation: bp-pulse 1.8s ease-out infinite; pointer-events:none }
.bp-marker { transition: opacity .6s ease, filter .6s ease; cursor: pointer; }
.bp-chip { font: 700 11px/1.1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; white-space: nowrap; }
.maplibregl-ctrl-attrib { font-size: 10px; }
`;

const shadow = '0 2px 6px rgba(15,23,42,.22), 0 6px 16px rgba(15,23,42,.12)';

function SocietyMarker({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateY(-18px)' }}>
      <div className="bp-chip" style={{ background: '#1a1d24', color: '#fff', padding: '5px 8px', borderRadius: 8, boxShadow: shadow, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ width: 34, height: 34, borderRadius: 17, background: BRAND, border: '3px solid #fff', boxShadow: shadow, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SocietyIcon size={17} color="#fff" strokeWidth={2.5} />
      </div>
    </div>
  );
}

function ShopMarker({ shop, onPress }: { shop: ShopPin; onPress?: () => void }) {
  const Icon = CATEGORY_ICON[shop.category];
  const on = !!shop.selected;
  return (
    <div className="bp-marker" onClick={onPress} title={shop.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: on ? 34 : 28, height: on ? 34 : 28, borderRadius: 10, background: on ? BRAND : '#fff', border: `2px solid ${on ? '#fff' : '#e7e1d6'}`, boxShadow: shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s ease' }}>
        <Icon size={on ? 17 : 15} color={on ? '#fff' : '#9a3412'} strokeWidth={2.2} />
      </div>
      {on ? (
        <div className="bp-chip" style={{ marginTop: 4, background: '#fff', color: '#1a1d24', padding: '3px 6px', borderRadius: 6, boxShadow: shadow }}>{shop.name}</div>
      ) : null}
    </div>
  );
}

function RunnerMarker({ r, heading, onPress }: { r: RunnerPin; heading?: number; onPress?: () => void }) {
  const ring = TIER_RING[r.tier ?? 'unknown'];
  const live = r.freshness === 'live';
  const size = r.focused ? 46 : 40;
  const h = r.heading ?? heading;
  return (
    <div
      className="bp-marker"
      onClick={onPress}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: live ? 1 : 0.45, filter: live ? 'none' : 'grayscale(.8)', zIndex: r.focused ? 3 : 2 }}>
      {r.chip ? (
        <div className="bp-chip" style={{ position: 'absolute', bottom: size + 8, display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#1a1d24', padding: '5px 8px', borderRadius: 999, boxShadow: shadow }}>
          <span style={{ width: 7, height: 7, borderRadius: 7, background: live ? '#16a34a' : '#94a3b8' }} />
          <span>{r.chip}</span>
          {r.sub ? <span style={{ color: '#64748b', fontWeight: 600 }}>· {r.sub}</span> : null}
        </div>
      ) : null}
      <div style={{ position: 'relative', width: size, height: size }}>
        {live ? <span className="bp-pulse" style={{ background: ring }} /> : null}
        {h !== undefined ? (
          <div style={{ position: 'absolute', inset: -9, transform: `rotate(${h}deg)`, transition: 'transform .8s ease', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, marginLeft: -6, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `9px solid ${ring}` }} />
          </div>
        ) : null}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: '#fff', border: `3px solid ${ring}`, boxShadow: shadow, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RunnerIcon size={r.focused ? 22 : 19} color={ring} strokeWidth={2.4} />
        </div>
      </div>
    </div>
  );
}

type Line = Feature<LineString, { tone: string }>;
const lineOf = (pts: MapPoint[], tone: string): Line => ({
  type: 'Feature',
  properties: { tone },
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) },
});

export default function MapGL(props: MapViewProps) {
  const { colorScheme } = useColorScheme();
  const ref = useRef<MapRef>(null);
  const runners = props.runners ?? [];
  const glide = useGlide(runners.map((r) => ({ id: r.id, pos: r.pos })));
  const pad = { top: 60, bottom: 40, left: 40, right: 40, ...props.padding };
  const bounds = boundsOf(props.fit);

  useEffect(() => {
    if (bounds) ref.current?.fitBounds(bounds, { padding: pad, duration: 900, maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey]);

  const routes = useMemo(() => {
    const features: Line[] = [];
    for (const r of props.routes ?? []) {
      const from = 'runner' in r.from ? glide[r.from.runner]?.pos : r.from;
      if (from) features.push(lineOf(arc(from, r.to), r.tone));
    }
    return { type: 'FeatureCollection' as const, features };
  }, [props.routes, glide]);

  const trail = useMemo(() => {
    const features: Feature<Point, { o: number }>[] = [];
    for (const r of runners) {
      const pts = r.trail ?? [];
      pts.forEach((p, i) =>
        features.push({ type: 'Feature', properties: { o: 0.15 + (0.45 * (i + 1)) / pts.length }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }),
      );
    }
    return { type: 'FeatureCollection' as const, features };
  }, [runners]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <style>{CSS}</style>
      <Map
        ref={ref}
        initialViewState={bounds ? { bounds, fitBoundsOptions: { padding: pad, maxZoom: 16 } } : { longitude: 77.7447, latitude: 12.975, zoom: 14 }}
        mapStyle={colorScheme === 'dark' ? STYLE.dark : STYLE.light}
        style={{ width: '100%', height: '100%' }}
        attributionControl={{ compact: true }}
        // Start with the compact (i) attribution collapsed so it never covers our corner chips.
        onLoad={(e) => e.target.getContainer().querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')}
        dragRotate={false}
        pitchWithRotate={false}
        touchZoomRotate
        cooperativeGestures={false}>
        <Source id="routes" type="geojson" data={routes}>
          <Layer id="route-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#ffffff', 'line-width': ['match', ['get', 'tone'], 'primary', 8, 5], 'line-opacity': ['match', ['get', 'tone'], 'primary', 0.95, 0.6] }} />
          <Layer id="route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': BRAND, 'line-width': ['match', ['get', 'tone'], 'primary', 4, 2.5], 'line-opacity': ['match', ['get', 'tone'], 'primary', 1, 0.45], 'line-dasharray': [2, 1.6] }} />
        </Source>
        <Source id="trail" type="geojson" data={trail}>
          <Layer id="trail-dots" type="circle" paint={{ 'circle-radius': 4, 'circle-color': BRAND, 'circle-opacity': ['get', 'o'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['get', 'o'] }} />
        </Source>
        {(props.shops ?? []).map((s) => (
          <Marker key={s.id} longitude={s.pos.lng} latitude={s.pos.lat} anchor="center" style={{ zIndex: s.selected ? 2 : 1 }}>
            <ShopMarker shop={s} onPress={props.onShopPress ? () => props.onShopPress?.(s.id) : undefined} />
          </Marker>
        ))}
        {props.society ? (
          <Marker longitude={props.society.pos.lng} latitude={props.society.pos.lat} anchor="center" style={{ zIndex: 2 }}>
            <SocietyMarker label={props.society.label} />
          </Marker>
        ) : null}
        {runners.map((r) => {
          const g = glide[r.id] ?? { pos: r.pos };
          return (
            <Marker key={r.id} longitude={g.pos.lng} latitude={g.pos.lat} anchor="center" style={{ zIndex: r.focused ? 4 : 3 }}>
              <RunnerMarker r={r} heading={g.heading} onPress={props.onRunnerPress ? () => props.onRunnerPress?.(r.id) : undefined} />
            </Marker>
          );
        })}
      </Map>
      {props.note ? (
        <div className="bp-chip" style={{ position: 'absolute', left: 8, bottom: 8, maxWidth: '75%', background: 'rgba(255,255,255,.88)', color: '#475569', padding: '3px 7px', borderRadius: 6, fontWeight: 600 }}>
          {props.note}
        </div>
      ) : null}
    </div>
  );
}
