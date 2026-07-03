import { defineModule } from "@hub/sdk";
import { manifest } from "./manifest";
import { TodoPanel } from "./frontend/Panel";
import { TodoSettings } from "./frontend/Settings";

// Entry point only — the UI lives in ./frontend/ (Panel, task rows, data layer,
// settings). gen-modules.mjs looks for this file, so it stays at the root.
export default defineModule({ manifest, Panel: TodoPanel, Settings: TodoSettings });
