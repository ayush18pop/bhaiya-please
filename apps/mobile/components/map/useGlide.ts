import { useEffect, useRef, useState } from 'react';
import type { MapPoint } from './types';

/** Glide time between pings: about one ping interval, so a coarse marker moves continuously. */
const GLIDE_MS = 18_000;
/** Jumps larger than this (deg ≈ 1.5 km) snap instead of gliding across the city. */
const SNAP_DEG = 0.014;
const FRAME_MS = 50;

interface Track {
  from: MapPoint;
  to: MapPoint;
  start: number;
  heading?: number;
}

const lerp = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });

function headingOf(a: MapPoint, b: MapPoint): number | undefined {
  const dy = b.lat - a.lat;
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  if (Math.abs(dx) + Math.abs(dy) < 1e-7) return undefined;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/**
 * Animated positions for a set of moving markers: each new target starts from wherever the marker
 * currently is (never teleports), eased linearly over ~one ping interval. ~20 fps, paused when idle.
 */
export function useGlide(targets: { id: string; pos: MapPoint }[]): Record<string, { pos: MapPoint; heading?: number }> {
  const tracks = useRef(new Map<string, Track>());
  const [, setFrame] = useState(0);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const current = (t: Track, at: number) => lerp(t.from, t.to, Math.min(1, (at - t.start) / GLIDE_MS));

  const sig = targets.map((t) => `${t.id}:${t.pos.lat.toFixed(6)},${t.pos.lng.toFixed(6)}`).join('|');
  useEffect(() => {
    const at = now();
    const ids = new Set(targets.map((t) => t.id));
    for (const id of [...tracks.current.keys()]) if (!ids.has(id)) tracks.current.delete(id);
    for (const { id, pos } of targets) {
      const tr = tracks.current.get(id);
      if (!tr) {
        tracks.current.set(id, { from: pos, to: pos, start: at });
        continue;
      }
      if (tr.to.lat === pos.lat && tr.to.lng === pos.lng) continue;
      const here = current(tr, at);
      const far = Math.abs(here.lat - pos.lat) + Math.abs(here.lng - pos.lng) > SNAP_DEG;
      tracks.current.set(id, { from: far ? pos : here, to: pos, start: at, heading: headingOf(here, pos) ?? tr.heading });
    }
    setFrame((f) => f + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    const id = setInterval(() => {
      const at = now();
      for (const t of tracks.current.values()) {
        if (at - t.start < GLIDE_MS + FRAME_MS) {
          setFrame((f) => f + 1);
          return;
        }
      }
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  const at = now();
  const out: Record<string, { pos: MapPoint; heading?: number }> = {};
  for (const [id, t] of tracks.current) out[id] = { pos: current(t, at), ...(t.heading !== undefined ? { heading: t.heading } : {}) };
  for (const { id, pos } of targets) if (!out[id]) out[id] = { pos };
  return out;
}
