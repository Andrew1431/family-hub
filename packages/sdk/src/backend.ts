import type { ModuleContext } from "./context.js";

/**
 * A module backend is a setup function run once at boot with the module's
 * injected context. Register routes, capabilities, and bus subscriptions here.
 */
export type ModuleBackend = (ctx: ModuleContext) => void | Promise<void>;

/** Identity helper that gives module authors full type inference. */
export function defineBackend(setup: ModuleBackend): ModuleBackend {
  return setup;
}
