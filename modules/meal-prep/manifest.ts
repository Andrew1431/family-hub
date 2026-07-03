import type { ModuleManifest } from "@hub/sdk";

export const manifest: ModuleManifest = {
  name: "meal-prep",
  title: "Meals",
  version: "0.1.0",
  description:
    "Weekly meal planner: a library of saved meals (markdown recipes + groceries) " +
    "applied to days of the week, with one-tap grocery-list handoff to the to-dos.",
  // Designed as a full-screen view (its own dashboard tab), like the month calendar.
  defaultSize: { w: 12, h: 6 },
  hasBackend: true,
  hasFrontend: true,
  hotkey: "m",
};

export default manifest;
