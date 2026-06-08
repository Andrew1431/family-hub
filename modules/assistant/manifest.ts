import type { ModuleManifest } from "@hub/sdk";

// Backend-only module: it consumes the shared capability registry to drive the
// AI chat. The chat UI itself is part of the dashboard shell (an overlay), not
// a grid panel, so hasFrontend is false.
export const manifest: ModuleManifest = {
  name: "assistant",
  title: "Family Assistant",
  version: "0.1.0",
  description: "Claude-powered chat that can use every other module's capabilities.",
  hasBackend: true,
  hasFrontend: false,
  requires: { secrets: ["apiKey"] },
  // Lets users provide the key via the standard ANTHROPIC_API_KEY env var.
  secretEnv: { apiKey: "ANTHROPIC_API_KEY" },
};

export default manifest;
