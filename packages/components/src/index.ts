// Shared, theme-agnostic React UI primitives reused by the shell (@hub/ui) and
// by modules. Consumed as built dist (package.json main=./dist) → rebuild after
// edits (`pnpm --filter @hub/components build`).
export { ScrollView } from "./ScrollView.js";
export type { ScrollViewProps, ScrollAxis } from "./ScrollView.js";

export { Card } from "./Card.js";
export type { CardProps } from "./Card.js";

export { Title } from "./Title.js";

export { HotkeyProvider, useHotkey, useCard, useModuleHotkeys } from "./hotkeys.js";
export type { HotkeyProviderProps, CardContextValue } from "./hotkeys.js";

export { Modal } from "./Modal.js";
export type { ModalProps } from "./Modal.js";

export { IconButton } from "./IconButton.js";
export type { IconButtonProps } from "./IconButton.js";

export { LoadingState, EmptyState, ErrorState } from "./states.js";

export {
  Field,
  TextInput,
  TextArea,
  Select,
  ToggleRow,
  Segmented,
  FormFooter,
} from "./forms.js";

export { useModuleConfig, useConfigDraft } from "./useModuleConfig.js";
export type { ConfigDraft } from "./useModuleConfig.js";

export {
  IconGear,
  IconPlus,
  IconX,
  IconCheck,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconArrowLeft,
  IconCalendar,
  IconRows,
  IconTabs,
  IconSun,
  IconMoon,
  IconSparkle,
} from "./icons.js";
