import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "notes",
  title: "Notes",
  version: "0.1.0",
  description: "Plain, large-type sticky notes in a horizontal scroll — no syncing, no accounts.",
  defaultSize: { w: 4, h: 5 },
  hasBackend: false,
  hasFrontend: true,
  // surface defaults to "panel" — the frosted column the colored cards live in.
  hotkey: "n",
};

export default manifest;
