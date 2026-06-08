import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "weather",
  title: "Weather",
  version: "0.1.0",
  description: "Current conditions and daily high/low from Open-Meteo.",
  defaultSize: { w: 4, h: 2 },
  hasBackend: true,
  hasFrontend: true,
  // surface defaults to "panel" — gets the frosted card wrapper
};

export default manifest;
