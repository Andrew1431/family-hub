import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "google-oauth",
  title: "Google OAuth",
  version: "0.1.0",
  description:
    "Hosts the single shared Google OAuth callback for every Google module, so " +
    "Google Cloud only needs one redirect URI registered. No panel.",
  hasBackend: true,
  hasFrontend: false,
};

export default manifest;
