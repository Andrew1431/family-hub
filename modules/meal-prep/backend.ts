import { defineBackend, type KVStore } from "@hub/sdk";
import {
  COMPLEXITIES,
  groceryTitle,
  mergeGroceries,
  normalizeGrocery,
  type Complexity,
  type DayAssignments,
  type Meal,
  type PlanResponse,
} from "./types";

/*
 * Meal-prep module — weekly meal planner over the module config store.
 *
 * Two documents: 'meals' (the saved-meal library) and 'days' (flat
 * YYYY-MM-DD → meal-id list; weeks are grouped at read time from the
 * 'weekStart' setting, so re-picking the start day never migrates data).
 *
 * Grocery handoff is the hub's first cross-module call: this backend invokes
 * the to-do module's `todo_add_tasks` capability through the shared registry —
 * modules know capability names, never each other. The target list name lives
 * in config ('groceryList'); the to-do module matches it case-insensitively
 * and falls back to its default list.
 */

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

// ── Local-date helpers (string-keyed to dodge timezone drift) ─────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

/** The 7 dates of the week containing `anchor`, starting on weekday `start`. */
function weekOf(anchor: string, start: number): string[] {
  const d = toDate(anchor);
  const back = (d.getDay() - start + 7) % 7;
  const first = addDays(anchor, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

// ── Backend ──────────────────────────────────────────────────────────────────

export default defineBackend((ctx) => {
  async function getMeals(config: KVStore = ctx.config): Promise<Meal[]> {
    const m = await config.get<Meal[]>("meals");
    return Array.isArray(m) ? m : [];
  }

  async function getDays(): Promise<DayAssignments> {
    const d = await ctx.config.get<DayAssignments>("days");
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  }

  async function getWeekStart(): Promise<number> {
    const name = await ctx.config.get<string>("weekStart");
    const idx = WEEKDAYS.indexOf(String(name ?? "").toLowerCase());
    return idx === -1 ? 0 : idx;
  }

  async function getGroceryList(): Promise<string> {
    const name = await ctx.config.get<string>("groceryList");
    return typeof name === "string" && name.trim() ? name.trim() : "Groceries";
  }

  function newId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `meal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function sanitizeMeal(input: {
    name?: unknown;
    complexity?: unknown;
    instructions?: unknown;
    groceries?: unknown;
  }): Omit<Meal, "id"> | { error: string } {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { error: "name is required" };
    const complexity = COMPLEXITIES.includes(input.complexity as Complexity)
      ? (input.complexity as Complexity)
      : "regular";
    const instructions = typeof input.instructions === "string" ? input.instructions : "";
    const groceries = Array.isArray(input.groceries)
      ? input.groceries
          .filter((g): g is string => typeof g === "string")
          .map((g) => g.trim().replace(/\s+/g, " "))
          .filter(Boolean)
      : [];
    return { name, complexity, instructions, groceries };
  }

  /** Find a meal by exact id, then case-insensitive name, then substring. */
  function findMeal(meals: Meal[], ref: string): Meal | undefined {
    const needle = ref.trim().toLowerCase();
    return (
      meals.find((m) => m.id === ref) ??
      meals.find((m) => m.name.toLowerCase() === needle) ??
      meals.find((m) => m.name.toLowerCase().includes(needle))
    );
  }

  /** Ordered, de-dangled meal list for a set of dates (drops deleted ids). */
  function mealsOn(dates: string[], days: DayAssignments, meals: Meal[]): Meal[] {
    const byId = new Map(meals.map((m) => [m.id, m]));
    return dates
      .flatMap((d) => days[d] ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is Meal => m !== undefined);
  }

  async function planFor(anchor: string): Promise<PlanResponse> {
    const [meals, days, start, groceryList] = await Promise.all([
      getMeals(),
      getDays(),
      getWeekStart(),
      getGroceryList(),
    ]);
    const dates = weekOf(anchor, start);
    const visible: DayAssignments = {};
    const valid = new Set(meals.map((m) => m.id));
    for (const d of dates) visible[d] = (days[d] ?? []).filter((id) => valid.has(id));
    return { dates, days: visible, meals, weekStart: WEEKDAYS[start]!, groceryList };
  }

  async function setDay(date: string, mealIds: string[]): Promise<void> {
    const days = await getDays();
    if (mealIds.length === 0) delete days[date];
    else days[date] = mealIds;
    await ctx.config.set("days", days);
  }

  /** The cross-module hop: hand grocery titles to the to-do module. */
  async function commitToTodos(titles: string[]): Promise<{
    ok: boolean;
    list?: string;
    results?: unknown[];
    message?: string;
  }> {
    if (titles.length === 0) return { ok: false, message: "Nothing to add." };
    const listName = await getGroceryList();
    try {
      const out = (await ctx.capabilities.invoke("todo_add_tasks", {
        tasks: titles.map((title) => ({ title, listName })),
      })) as { ok: boolean; results?: { list?: string }[] };
      return {
        ok: out.ok,
        ...(out.results?.[0]?.list ? { list: out.results[0].list } : {}),
        ...(out.results ? { results: out.results } : {}),
      };
    } catch (err) {
      // Most likely the to-do module isn't installed/loaded ("Unknown capability").
      ctx.log.warn(`grocery commit failed: ${String(err)}`);
      return {
        ok: false,
        message:
          "Couldn't reach the to-do module — is it installed and connected to Google?",
      };
    }
  }

  // ── Panel routes ─────────────────────────────────────────────────────────────

  // The whole week view in one round trip. `anchor` is any date inside the
  // wanted week (defaults to today); the server snaps to the configured start.
  ctx.route("GET", "/plan", async ({ query }) => {
    const anchor = typeof query.anchor === "string" && DATE_RE.test(query.anchor)
      ? query.anchor
      : toYmd(new Date());
    return planFor(anchor);
  });

  ctx.route("POST", "/meals", async ({ body }) => {
    const clean = sanitizeMeal((body ?? {}) as Record<string, unknown>);
    if ("error" in clean) return { ok: false, message: clean.error };
    const meal: Meal = { id: newId(), ...clean };
    await ctx.config.set("meals", [...(await getMeals()), meal]);
    return { ok: true, meal };
  });

  ctx.route("PUT", "/meals/:id", async ({ params, body }) => {
    const meals = await getMeals();
    const prior = meals.find((m) => m.id === params.id);
    if (!prior) return { ok: false, message: "Meal not found." };
    const clean = sanitizeMeal((body ?? {}) as Record<string, unknown>);
    if ("error" in clean) return { ok: false, message: clean.error };
    const meal: Meal = { id: prior.id, ...clean };
    await ctx.config.set("meals", meals.map((m) => (m.id === meal.id ? meal : m)));
    return { ok: true, meal };
  });

  ctx.route("DELETE", "/meals/:id", async ({ params }) => {
    const meals = await getMeals();
    if (!meals.some((m) => m.id === params.id)) return { ok: false, message: "Meal not found." };
    await ctx.config.set("meals", meals.filter((m) => m.id !== params.id));
    // Scrub the deleted meal out of every planned day.
    const days = await getDays();
    for (const [date, ids] of Object.entries(days)) {
      const kept = ids.filter((id) => id !== params.id);
      if (kept.length === 0) delete days[date];
      else days[date] = kept;
    }
    await ctx.config.set("days", days);
    return { ok: true };
  });

  // Replace one day's ordered meal list (add/remove/reorder all flow through here).
  ctx.route("PUT", "/days/:date", async ({ params, body }) => {
    const date = params.date ?? "";
    if (!DATE_RE.test(date)) return { ok: false, message: "date must be YYYY-MM-DD" };
    const ids = (body as { mealIds?: unknown } | undefined)?.mealIds;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
      return { ok: false, message: "mealIds must be a string array" };
    }
    const valid = new Set((await getMeals()).map((m) => m.id));
    const unknown = ids.find((id) => !valid.has(id));
    if (unknown) return { ok: false, message: `Unknown meal id "${unknown}"` };
    await setDay(date, ids);
    return { ok: true };
  });

  // Commit a reviewed grocery list to the to-dos. The panel's generate modal
  // does the merging/editing; this receives the final titles.
  ctx.route("POST", "/groceries", async ({ body }) => {
    const items = (body as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(items) || !items.every((x) => typeof x === "string")) {
      return { ok: false, message: "items must be a string array" };
    }
    return commitToTodos(items.map((s) => s.trim()).filter(Boolean));
  });

  // ── Capabilities (exposed to the assistant) ──────────────────────────────────

  ctx.capabilities.registerContext(async () => {
    const meals = await getMeals();
    if (meals.length === 0) return undefined;
    const names = meals.slice(0, 20).map((m) => m.name);
    const extra = meals.length > names.length ? ` (+${meals.length - names.length} more)` : "";
    return (
      `Saved meals the family can plan: ${names.join(", ")}${extra}. ` +
      "Use meal_get_plan to see what's planned for a week."
    );
  });

  ctx.capabilities.register({
    name: "meal_list_meals",
    description:
      "List the family's saved meals: name, complexity (fast / regular / allday " +
      "cooking project), the groceries each needs, and its cooking instructions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnly: true },
    handler: () => getMeals(),
  });

  ctx.capabilities.register({
    name: "meal_create_meal",
    description:
      "Save a new meal to the library so it can be planned onto days. Provide a " +
      "name, optional complexity ('fast' | 'regular' | 'allday'), optional cooking " +
      "instructions (markdown), and the groceries it needs as plain text lines.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Meal name, e.g. 'Sheet-pan fajitas'." },
        complexity: {
          type: "string",
          enum: ["fast", "regular", "allday"],
          description: "How involved it is; defaults to 'regular'.",
        },
        instructions: { type: "string", description: "Cooking instructions, markdown." },
        groceries: {
          type: "array",
          items: { type: "string" },
          description: "Grocery lines, e.g. '2 bell peppers'.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: {
      name: string;
      complexity?: string;
      instructions?: string;
      groceries?: string[];
    }) => {
      const clean = sanitizeMeal(input);
      if ("error" in clean) return { ok: false, message: clean.error };
      const meal: Meal = { id: newId(), ...clean };
      await ctx.config.set("meals", [...(await getMeals()), meal]);
      return { ok: true, id: meal.id, name: meal.name };
    },
  });

  ctx.capabilities.register({
    name: "meal_update_meal",
    description:
      "Update a saved meal (rename, change complexity, edit instructions or its " +
      "grocery lines). Identify it by id or name; only the provided fields change.",
    inputSchema: {
      type: "object",
      properties: {
        meal: { type: "string", description: "Meal id or name (case-insensitive)." },
        name: { type: "string", description: "New name." },
        complexity: { type: "string", enum: ["fast", "regular", "allday"] },
        instructions: { type: "string", description: "New instructions, markdown." },
        groceries: { type: "array", items: { type: "string" }, description: "Replacement grocery lines." },
      },
      required: ["meal"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: {
      meal: string;
      name?: string;
      complexity?: string;
      instructions?: string;
      groceries?: string[];
    }) => {
      const meals = await getMeals();
      const prior = findMeal(meals, input.meal);
      if (!prior) return { ok: false, message: `No saved meal matches "${input.meal}".` };
      const clean = sanitizeMeal({
        name: input.name ?? prior.name,
        complexity: input.complexity ?? prior.complexity,
        instructions: input.instructions ?? prior.instructions,
        groceries: input.groceries ?? prior.groceries,
      });
      if ("error" in clean) return { ok: false, message: clean.error };
      const meal: Meal = { id: prior.id, ...clean };
      await ctx.config.set("meals", meals.map((m) => (m.id === meal.id ? meal : m)));
      return { ok: true, id: meal.id, name: meal.name };
    },
  });

  ctx.capabilities.register({
    name: "meal_delete_meal",
    description:
      "Delete a saved meal from the library (by id or name) and remove it from " +
      "any planned days.",
    inputSchema: {
      type: "object",
      properties: {
        meal: { type: "string", description: "Meal id or name (case-insensitive)." },
      },
      required: ["meal"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: { meal: string }) => {
      const meals = await getMeals();
      const target = findMeal(meals, input.meal);
      if (!target) return { ok: false, message: `No saved meal matches "${input.meal}".` };
      await ctx.config.set("meals", meals.filter((m) => m.id !== target.id));
      const days = await getDays();
      for (const [date, ids] of Object.entries(days)) {
        const kept = ids.filter((id) => id !== target.id);
        if (kept.length === 0) delete days[date];
        else days[date] = kept;
      }
      await ctx.config.set("days", days);
      return { ok: true, name: target.name };
    },
  });

  ctx.capabilities.register({
    name: "meal_get_plan",
    description:
      "See what meals are planned for the week containing a date (defaults to " +
      "today). Returns the week's dates with the meals assigned to each day.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Any date in the wanted week, YYYY-MM-DD. Defaults to today." },
      },
      additionalProperties: false,
    },
    annotations: { readOnly: true },
    handler: async (input: { date?: string }) => {
      const anchor = input.date && DATE_RE.test(input.date) ? input.date : toYmd(new Date());
      const plan = await planFor(anchor);
      const byId = new Map(plan.meals.map((m) => [m.id, m]));
      return plan.dates.map((date) => ({
        date,
        meals: (plan.days[date] ?? []).map((id) => {
          const m = byId.get(id);
          return m ? { id: m.id, name: m.name, complexity: m.complexity } : { id };
        }),
      }));
    },
  });

  ctx.capabilities.register({
    name: "meal_assign_meal",
    description:
      "Plan a saved meal onto a day (adds to that day's list — days can hold " +
      "several meals). Identify the meal by id or name.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "The day, YYYY-MM-DD." },
        meal: { type: "string", description: "Meal id or name (case-insensitive)." },
      },
      required: ["date", "meal"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: { date: string; meal: string }) => {
      if (!DATE_RE.test(input.date)) return { ok: false, message: "date must be YYYY-MM-DD" };
      const target = findMeal(await getMeals(), input.meal);
      if (!target) return { ok: false, message: `No saved meal matches "${input.meal}".` };
      const days = await getDays();
      await setDay(input.date, [...(days[input.date] ?? []), target.id]);
      return { ok: true, date: input.date, meal: target.name };
    },
  });

  ctx.capabilities.register({
    name: "meal_unassign_meal",
    description: "Remove a planned meal from a day (the saved meal itself is kept).",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "The day, YYYY-MM-DD." },
        meal: { type: "string", description: "Meal id or name (case-insensitive)." },
      },
      required: ["date", "meal"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: { date: string; meal: string }) => {
      if (!DATE_RE.test(input.date)) return { ok: false, message: "date must be YYYY-MM-DD" };
      const target = findMeal(await getMeals(), input.meal);
      if (!target) return { ok: false, message: `No saved meal matches "${input.meal}".` };
      const days = await getDays();
      const ids = days[input.date] ?? [];
      if (!ids.includes(target.id)) {
        return { ok: false, message: `"${target.name}" isn't planned on ${input.date}.` };
      }
      // Remove one occurrence, not all — a meal can be planned twice in a day.
      const idx = ids.indexOf(target.id);
      await setDay(input.date, [...ids.slice(0, idx), ...ids.slice(idx + 1)]);
      return { ok: true, date: input.date, meal: target.name };
    },
  });

  ctx.capabilities.register({
    name: "meal_commit_groceries",
    description:
      "Build the grocery list for a week's planned meals (duplicates across meals " +
      "are merged with ×N counts) and add it to the family's grocery to-do list. " +
      "Optionally skip or append specific items.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Any date in the wanted week, YYYY-MM-DD. Defaults to today." },
        excludeItems: {
          type: "array",
          items: { type: "string" },
          description: "Grocery lines to leave off (matched case-insensitively).",
        },
        extraItems: {
          type: "array",
          items: { type: "string" },
          description: "Additional items to add alongside the meals' groceries.",
        },
      },
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: { date?: string; excludeItems?: string[]; extraItems?: string[] }) => {
      const anchor = input.date && DATE_RE.test(input.date) ? input.date : toYmd(new Date());
      const plan = await planFor(anchor);
      const planned = mealsOn(plan.dates, plan.days, plan.meals);
      const lines = [
        ...planned.flatMap((m) => m.groceries),
        ...(input.extraItems ?? []),
      ];
      const excluded = new Set((input.excludeItems ?? []).map(normalizeGrocery));
      const titles = mergeGroceries(lines)
        .filter((e) => !excluded.has(normalizeGrocery(e.text)))
        .map(groceryTitle);
      if (titles.length === 0) {
        return { ok: false, message: "No groceries found on that week's planned meals." };
      }
      return commitToTodos(titles);
    },
  });

  ctx.log.info("meal-prep backend ready");
});
