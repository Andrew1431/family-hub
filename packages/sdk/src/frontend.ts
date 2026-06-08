import type { ComponentType } from "react";
import type { ModuleManifest } from "./manifest.js";

/** Props every panel receives from the dashboard shell. */
export interface PanelProps {
  /** The owning module's name; use it to scope API calls + bus topics. */
  moduleName: string;
}

/**
 * Props the shell passes to a module's optional Settings component. The shell
 * supplies the surrounding modal chrome (backdrop, Esc, focus); the module only
 * renders the body and calls `onClose` when done.
 */
export interface SettingsProps {
  moduleName: string;
  onClose: () => void;
}

/** The frontend half of a module: its manifest, panel, and optional settings. */
export interface ModuleFrontend {
  manifest: ModuleManifest;
  Panel: ComponentType<PanelProps>;
  /** If present, the shell shows a settings cog on the card that opens this. */
  Settings?: ComponentType<SettingsProps>;
}

/** Identity helper that gives module authors full type inference. */
export function defineModule(def: ModuleFrontend): ModuleFrontend {
  return def;
}
