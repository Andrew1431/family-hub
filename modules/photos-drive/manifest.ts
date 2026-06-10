import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "photos-drive",
  title: "Photos",
  version: "0.1.0",
  description: "Photo slideshow from a Google Drive folder; doubles as a screensaver.",
  defaultSize: { w: 4, h: 3 },
  hasBackend: true,
  hasFrontend: true,
  // Full-bleed image, no frosted padding — the Panel draws its own rounded frame.
  surface: "bare",
  // Shares the hub-wide OAuth client with every other Google module. ctx.secrets
  // resolves these aliases before the runtime store, so .env wins over a pasted value.
  secretEnv: {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
};

export default manifest;
