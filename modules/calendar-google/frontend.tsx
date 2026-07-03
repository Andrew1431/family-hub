import { defineModule } from "@hub/sdk";
import { manifest } from "./manifest";
import { CalendarPanel } from "./frontend/Panel";
import { CalendarSettings } from "./frontend/Settings";

// Entry point only — the UI lives in ./frontend/ (Panel, views, event editor,
// settings). gen-modules.mjs looks for this file, so it stays at the root.
export default defineModule({ manifest, Panel: CalendarPanel, Settings: CalendarSettings });
