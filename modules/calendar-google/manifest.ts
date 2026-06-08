import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "calendar-google",
  title: "Calendar",
  version: "0.1.0",
  description: "Family calendar panel backed by the Google Calendar API.",
  defaultSize: { w: 6, h: 4 },
  hasBackend: true,
  hasFrontend: true,
};

export default manifest;
