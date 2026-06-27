// Shared, theme-agnostic React UI primitives reused by the shell (@hub/ui) and
// by modules. Consumed as built dist (package.json main=./dist) → rebuild after
// edits (`pnpm --filter @hub/components build`).
export { ScrollView } from "./ScrollView.js";
export type { ScrollViewProps, ScrollAxis } from "./ScrollView.js";
