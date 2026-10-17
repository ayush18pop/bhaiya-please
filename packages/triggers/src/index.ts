/**
 * @arkiv-triggers/core: Arkiv Triggers, "Zapier for expiring data".
 *
 *   codec   trigger / firing entities (project `arkivtriggers`), zod schemas, predicate builders
 *   client  buildTriggerSpec, listMyTriggers, deleteTriggers, listFiringsFor, channel registration
 *   engine  createTriggerEngine: the worker loop (Node worker or in-page sandbox)
 *   actions sender / channel / plugin interfaces + in-page helpers
 *
 * Pure TS over core's ArkivPort: no Node-only imports, runs in browsers and React Native.
 */
export * from './codec';
export * from './client';
export * from './engine';
export * from './actions';
export type * from './port';
