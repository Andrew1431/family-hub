import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "todo-google",
  title: "To-Do",
  version: "0.1.0",
  description: "Task lists powered by Google Tasks API.",
  defaultSize: { w: 6, h: 4 },
  hasBackend: true,
  hasFrontend: true,
};

export default manifest;
