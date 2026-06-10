import type { ComponentType } from "react";
import type { ModuleManifest } from "./manifest.js";

/** Props every panel receives from the dashboard shell. */
export interface PanelProps {
  /** The owning module's name; use it to scope API calls + bus topics. */
  moduleName: string;
  /** This widget instance's unique id (from the layout). */
  instanceId: string;
  /** Instance-scoped visual settings declared in the layout (may be empty). */
  settings: Record<string, unknown>;
}

/**
 * Props the shell passes to a module's optional Settings component. The shell
 * supplies the surrounding modal chrome (backdrop, Esc, focus); the module only
 * renders the body and calls `onClose` when done.
 *
 * Settings edit MODULE-GLOBAL config (the module's own config/secret stores via
 * `/api/m/<name>/...`), not per-widget appearance — so they're reachable from the
 * central Settings hub whether or not the module is placed on a dashboard.
 * Per-instance appearance lives on `PanelProps.settings` instead.
 */
export interface SettingsProps {
  /** The owning module's name; use it to scope API calls + bus topics. */
  moduleName: string;
  onClose: () => void;
}

/**
 * Props for a module's optional full-screen overlay (e.g. a screensaver).
 *
 * The shell mounts every module's `Overlay` permanently and feeds it a single
 * global `idleMs` (time since the last user interaction). The overlay decides
 * for itself whether/when to take over the screen — read its own config for a
 * threshold, return `null` until it wants to show, then render a fixed
 * full-screen element. It MUST mirror that decision through `setActive` so the
 * shell can suppress global shortcuts (and swallow the first wake interaction)
 * while the overlay is up. The shell owns idle detection and dismissal; any
 * user interaction resets `idleMs` to 0, which is the overlay's cue to hide.
 */
export interface OverlayProps {
  /** The owning module's name; use it to scope API calls. */
  moduleName: string;
  /**
   * Milliseconds since the last user interaction (0 right after activity).
   * Sampled on a coarse tick (~1s) — it is the unit, not the cadence, so don't
   * expect sub-second precision. Compare it against your own threshold.
   */
  idleMs: number;
  /** Report whether this overlay is currently covering the screen. */
  setActive: (active: boolean) => void;
}

/** The frontend half of a module: its manifest, panel, and optional settings. */
export interface ModuleFrontend {
  manifest: ModuleManifest;
  Panel: ComponentType<PanelProps>;
  /**
   * If present, the shell lists this module in the central Settings hub and
   * shows a settings cog on its card (if placed) — both open this component.
   */
  Settings?: ComponentType<SettingsProps>;
  /**
   * If present, the shell mounts this as a full-screen overlay candidate and
   * feeds it the global idle signal. The module decides when to take over the
   * screen (e.g. an idle screensaver). See {@link OverlayProps}.
   */
  Overlay?: ComponentType<OverlayProps>;
}

/** Identity helper that gives module authors full type inference. */
export function defineModule(def: ModuleFrontend): ModuleFrontend {
  return def;
}
