import type { GridSize } from "./layout.js";

/**
 * Static metadata every module declares. Read by the core loader at boot to
 * mount the backend (under `/api/m/<name>`) and by the UI to place the panel.
 */
export interface ModuleManifest {
  /** Unique, URL-safe id. Also the backend route prefix + layout key. */
  name: string;
  /** Human-readable title shown in the UI. */
  title: string;
  /** Semver. */
  version: string;
  description?: string;
  /** Default grid footprint; overridable by `layout.local.json`. */
  defaultSize?: GridSize;
  /** Whether this module ships a backend (Fastify plugin). */
  hasBackend?: boolean;
  /** Whether this module ships a frontend panel. */
  hasFrontend?: boolean;
  /**
   * Panel chrome. "panel" (default) wraps the component in the frosted card;
   * "bare" gives the raw grid cell so the module controls its own look
   * (e.g. a clock that sits flush like the reference header).
   */
  surface?: "panel" | "bare";
  /**
   * Things this module needs to function. At boot, the loader checks these for
   * each LOADED module and logs a warning (never throws) if any are missing —
   * so a misconfigured module degrades gracefully without taking down the hub.
   * Removed/disabled modules are never checked.
   */
  requires?: {
    /** Secret keys resolved via ctx.secrets (env or runtime store), e.g. ["apiKey"]. */
    secrets?: string[];
    /** Config keys that must resolve via ctx.config (rare — templates seed defaults). */
    config?: string[];
  };
  /**
   * Optional standard env-var aliases for secrets, e.g. { apiKey: "ANTHROPIC_API_KEY" }.
   * ctx.secrets resolves `HUB_<MODULE>_<KEY>` first, then this alias, then the store.
   */
  secretEnv?: Record<string, string>;
}
