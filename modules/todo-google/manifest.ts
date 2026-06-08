import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "todo-google",
  title: "To-Do",
  version: "0.1.0",
  description: "Shared task lists powered by Google Tasks (groceries, chores, errands).",
  defaultSize: { w: 6, h: 4 },
  hasBackend: true,
  hasFrontend: true,
  // Shares the hub's ONE OAuth client with every other Google module. ctx.secrets
  // resolves these aliases before the runtime store, so .env wins over a pasted value.
  secretEnv: {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
  },
};

export default manifest;
