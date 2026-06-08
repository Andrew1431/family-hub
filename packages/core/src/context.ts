import type { ModuleContext, RouteRegistrar } from "@hub/sdk";
import type { Db } from "./db.js";
import type { GlobalCapabilityRegistry } from "./registry.js";
import type { GlobalEventBus } from "./bus.js";
import { makeLogger } from "./logger.js";
import { makeConfigStore, makeSecretStore } from "./stores.js";

export interface ContextDeps {
  db: Db;
  registry: GlobalCapabilityRegistry;
  bus: GlobalEventBus;
  /** Route registrar bound to this module's scoped Fastify instance. */
  route: RouteRegistrar;
  /** Merged config.template.json + config.local.json for this module. */
  configDefaults: Record<string, unknown>;
  /** Secret key → standard env-var alias (from manifest.secretEnv). */
  secretEnv: Record<string, string>;
}

/** Assemble the injected context handed to a module backend at mount time. */
export function buildContext(name: string, deps: ContextDeps): ModuleContext {
  // capabilities.register needs the finished ctx for handler routing, so we
  // hand the registry a late-bound getter and fill it in below.
  const ref: { current?: ModuleContext } = {};
  const ctx: ModuleContext = {
    name,
    log: makeLogger(name),
    config: makeConfigStore(deps.db, name, deps.configDefaults),
    secrets: makeSecretStore(deps.db, name, deps.secretEnv),
    bus: deps.bus.facadeFor(name),
    capabilities: deps.registry.facadeFor(name, () => ref.current!),
    route: deps.route,
  };
  ref.current = ctx;
  return ctx;
}
