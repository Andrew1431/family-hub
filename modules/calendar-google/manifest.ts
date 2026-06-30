import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "calendar-google",
  title: "Calendar",
  version: "0.1.0",
  description: "Family calendar: ICS subscriptions + Google Calendar accounts.",
  defaultSize: { w: 6, h: 4 },
  hasBackend: true,
  hasFrontend: true,
  // One OAuth client identifies the whole hub to Google; every Google module
  // (calendar, tasks, …) reads the SAME shared env vars. ctx.secrets resolves
  // these aliases before the runtime store, so .env wins over a cog-pasted value.
  secretEnv: {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
  hotkey: "c",
};

export default manifest;
