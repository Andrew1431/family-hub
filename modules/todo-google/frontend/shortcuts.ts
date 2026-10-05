// The panel's keyboard model, shown in Settings so nobody has to memorise it.
// Keep in sync with the useModuleHotkeys bindings in Panel.tsx.
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["A"], action: "Add a task" },
  { keys: ["↑", "↓"], action: "Move between tasks (also J / K)" },
  { keys: ["Enter"], action: "Tick or untick the focused task (also Space)" },
  { keys: ["Del"], action: "Delete the focused task — press twice (also X / Backspace)" },
  { keys: ["←", "→"], action: "Switch list (tabs layout)" },
  { keys: ["V"], action: "Switch between stacked and tabs layout" },
  { keys: ["R"], action: "Refresh from Google" },
  { keys: ["L"], action: "New list" },
  { keys: ["Esc"], action: "Leave the card" },
];
