import type { ComponentType } from "react";
import type { ModuleManifest } from "./manifest.js";

/** Props every panel receives from the dashboard shell. */
export interface PanelProps {
  /** The owning module's name; use it to scope API calls + bus topics. */
  moduleName: string;
}

/** The frontend half of a module: its manifest plus its panel component. */
export interface ModuleFrontend {
  manifest: ModuleManifest;
  Panel: ComponentType<PanelProps>;
}

/** Identity helper that gives module authors full type inference. */
export function defineModule(def: ModuleFrontend): ModuleFrontend {
  return def;
}
