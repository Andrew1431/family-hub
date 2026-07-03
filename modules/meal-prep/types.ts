/**
 * Shared meal-prep shapes, imported by both backend.ts and frontend.tsx so the
 * wire format has one source of truth.
 */

/** How much of your day a meal eats: quick weeknight → weekend project. */
export type Complexity = "fast" | "regular" | "allday";

export const COMPLEXITIES: Complexity[] = ["fast", "regular", "allday"];

export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  fast: "Fast",
  regular: "Regular",
  allday: "All-day",
};

export interface Meal {
  id: string;
  name: string;
  complexity: Complexity;
  /** Cooking instructions, markdown. */
  instructions: string;
  /** Groceries this meal needs — plain text lines ("2 lbs chicken thighs"). */
  groceries: string[];
}

/**
 * Day assignments are a flat record: local YYYY-MM-DD → ordered meal-id list
 * (a day can hold any number of meals — kid dinner + grown-up dinner + baking).
 * Weeks are a pure view grouping, so changing the week-start setting never
 * touches stored data.
 */
export type DayAssignments = Record<string, string[]>;

/** What GET /plan returns: one round trip renders the whole week view. */
export interface PlanResponse {
  /** The week's 7 local dates (YYYY-MM-DD), starting on the configured day. */
  dates: string[];
  days: DayAssignments;
  meals: Meal[];
  weekStart: string;
  groceryList: string;
}

/** Per-item outcome of a grocery commit (mirrors todo_add_tasks results). */
export interface CommitResult {
  ok: boolean;
  title: string;
  list?: string;
  message?: string;
}

// ── Grocery merging (shared: the panel's modal and the backend capability must
//    collapse duplicates identically) ─────────────────────────────────────────

export const normalizeGrocery = (s: string): string =>
  s.trim().replace(/\s+/g, " ").toLowerCase();

/** Merge text lines, counting duplicates; first spelling seen wins. */
export function mergeGroceries(lines: string[]): { text: string; count: number }[] {
  const out: { text: string; count: number }[] = [];
  const byKey = new Map<string, { text: string; count: number }>();
  for (const raw of lines) {
    const text = raw.trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = normalizeGrocery(text);
    const prior = byKey.get(key);
    if (prior) prior.count++;
    else {
      const entry = { text, count: 1 };
      byKey.set(key, entry);
      out.push(entry);
    }
  }
  return out;
}

/** Task title for a merged grocery entry: "eggs" / "chicken thighs ×2". */
export const groceryTitle = (e: { text: string; count: number }): string =>
  e.count > 1 ? `${e.text} ×${e.count}` : e.text;
