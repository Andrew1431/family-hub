import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "clock",
  title: "Clock",
  version: "0.1.0",
  description: "Time and date display.",
  defaultSize: { w: 8, h: 2 },
  surface: "bare",
  hasBackend: true,
  hasFrontend: true,
};

export default manifest;
