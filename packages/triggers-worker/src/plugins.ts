/**
 * Attest plugins shipped with this worker.
 *
 * `bhaiyaplease.noshow` (docs/TRIGGERS.md §4): on an `accept` trigger, asks core to build no-show
 * evidence for the accept's request at the current block. Core returns a `noshow` CreateSpec only if
 * the facts hold (valid accept by the run's runner, no trusted delivery, ETA passed); verification
 * is trustless (anyone re-reads at `block`), so this worker is not trusted, it only pays the gas.
 */
import type { AttestPlugin, EntityKey, PluginRegistry } from '@arkiv-triggers/core';
import { rawString } from '@arkiv-triggers/core';
import { buildNoShowEvidence } from '@bhaiya-please/core/port';

export const NOSHOW_ATTESTER = 'bhaiyaplease.noshow';
const KEY = /^0x[0-9a-f]{64}$/;

export function noShowPlugin(project = 'bhaiyaplease'): AttestPlugin {
  return async (port, ctx) => {
    const t = ctx.trigger;
    if (t.watchProject !== project || t.watchType !== 'accept') return null;
    const fromEntity = rawString(ctx.entity.attributes.request)?.toLowerCase();
    const fromParams = ctx.params.request?.toLowerCase();
    const request = fromEntity ?? fromParams;
    if (!request || !KEY.test(request)) return null;
    if (fromEntity && fromParams && fromEntity !== fromParams) return null;
    // Gas-griefing guard: only the resident who sent the request may ask for no-show evidence.
    const req = await port.get(request as EntityKey);
    if (!req || req.creator.toLowerCase() !== t.creator) return null;
    const ev = await buildNoShowEvidence(port, project, request as EntityKey);
    return ev ? ev.spec : null;
  };
}

export function defaultPlugins(): PluginRegistry {
  return { [NOSHOW_ATTESTER]: noShowPlugin() };
}
