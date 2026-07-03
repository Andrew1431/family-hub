// Shared frontend shapes (mirror backend google.ts) + date helpers.

export interface Task {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  notes?: string;
  due?: string; // YYYY-MM-DD
  completed?: string;
}

export interface List {
  id: string;
  accountId: string;
  title: string;
  color: string;
  tasks: Task[];
}

export type ViewMode = "stacked" | "tabs";

export interface TasksResponse {
  viewMode: ViewMode;
  lists: List[];
}

export const API = "/api/m/todo-google";
export const TASKS_KEY = ["todo", "tasks"] as const;

// ── Date helpers (due is date-only; parse parts to avoid timezone drift) ──────

export function parseDue(due: string): Date {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function formatDue(due: string): string {
  return parseDue(due).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isOverdue(due: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseDue(due).getTime() < today.getTime();
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
