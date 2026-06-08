import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// packages/core/src/paths.ts -> repo root is three levels up from src.
const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");

export const paths = {
  repoRoot,
  modulesDir: process.env.HUB_MODULES_DIR ?? resolve(repoRoot, "modules"),
  configDir: process.env.HUB_CONFIG_DIR ?? resolve(repoRoot, "config"),
  dataDir: process.env.HUB_DATA_DIR ?? resolve(repoRoot, "data"),
  uiDist: process.env.HUB_UI_DIST ?? resolve(repoRoot, "packages/ui/dist"),
};
