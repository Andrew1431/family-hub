import { defineModule } from "@hub/sdk";
import { manifest } from "./manifest";
import { PhotosPanel } from "./frontend/Panel";
import { PhotosOverlay } from "./frontend/Overlay";
import { PhotosSettings } from "./frontend/Settings";

// Entry point only — the UI lives in ./frontend/ (slideshow, panel, overlay,
// settings). gen-modules.mjs looks for this file, so it stays at the root.
export default defineModule({
  manifest,
  Panel: PhotosPanel,
  Settings: PhotosSettings,
  Overlay: PhotosOverlay,
});
