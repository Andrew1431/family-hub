import { defineBackend } from "@hub/sdk";

/*
 * Google Tasks API reference
 * ──────────────────────────
 * Base URL: https://tasks.googleapis.com/tasks/v1
 * Auth: OAuth 2.0, scope https://www.googleapis.com/auth/tasks
 *
 * TaskList: { id, title, updated }
 * Task:     { id, title, notes?, status: "needsAction"|"completed",
 *             due?: RFC3339, completed?: RFC3339, deleted?, hidden? }
 *
 * Endpoints used:
 *   GET  /users/@me/lists              → list all task lists
 *   GET  /lists/{listId}/tasks         → list tasks in a list
 *   POST /lists/{listId}/tasks         → insert task
 *   PATCH /lists/{listId}/tasks/{taskId} → update task (e.g. mark complete)
 *
 * Color-by-list strategy:
 *   Google Tasks has no per-task color or assignee. The realistic analog of
 *   the sample UI's per-person color pills is to assign each task LIST a color
 *   from a small fixed palette and render a colored dot next to the list title.
 */

// ── Types matching the Google Tasks API shape ──────────────────────────────

interface GTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;       // RFC3339 date
  completed?: string; // RFC3339 timestamp (set by API on completion)
}

interface GTaskList {
  id: string;
  title: string;
  tasks: GTask[];
}

// ── In-memory mock store (replaced later by real Google Tasks API calls) ───

const LIST_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#8b5cf6"];

function listColor(index: number): string {
  return LIST_COLORS[index % LIST_COLORS.length] ?? "#6366f1";
}

let nextId = 100;
function uid(): string {
  return String(++nextId);
}

const store: GTaskList[] = [
  {
    id: "list-1",
    title: "Family",
    tasks: [
      { id: "t-1", title: "Pick up groceries", status: "needsAction", due: "2026-06-08T00:00:00Z" },
      { id: "t-2", title: "Return library books", status: "needsAction" },
      { id: "t-3", title: "Pay electricity bill", status: "completed", completed: "2026-06-06T12:00:00Z" },
    ],
  },
  {
    id: "list-2",
    title: "School",
    tasks: [
      { id: "t-4", title: "Sign permission slip", status: "needsAction", due: "2026-06-09T00:00:00Z" },
      { id: "t-5", title: "Buy poster board for project", status: "needsAction" },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function findTask(taskId: string): { list: GTaskList; task: GTask } | undefined {
  for (const list of store) {
    const task = list.tasks.find((t) => t.id === taskId);
    if (task) return { list, task };
  }
  return undefined;
}

function listsPayload(listId?: string) {
  const lists = listId ? store.filter((l) => l.id === listId) : store;
  return lists.map((l, i) => ({
    id: l.id,
    title: l.title,
    color: listColor(i),
    tasks: l.tasks,
  }));
}

// ── Backend ────────────────────────────────────────────────────────────────

export default defineBackend((ctx) => {
  // Capability: list tasks (optionally scoped to a list)
  ctx.capabilities.register({
    name: "todo_list_tasks",
    description: "Return all task lists and their tasks, or tasks for a specific list.",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string", description: "Optional task list ID to filter by." },
      },
      additionalProperties: false,
    },
    annotations: { readOnly: true },
    handler: (input: { listId?: string }) => listsPayload(input.listId),
  });

  // Capability: add a task
  ctx.capabilities.register({
    name: "todo_add_task",
    description: "Create a new task (status: needsAction) in the specified list (defaults to first list).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title." },
        notes: { type: "string", description: "Optional notes." },
        due: { type: "string", description: "Optional due date (RFC3339)." },
        listId: { type: "string", description: "Task list ID. Defaults to the first list." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: (input: { title: string; notes?: string; due?: string; listId?: string }) => {
      const list = input.listId
        ? store.find((l) => l.id === input.listId)
        : store[0];
      if (!list) throw new Error("Task list not found.");
      const task: GTask = {
        id: uid(),
        title: input.title,
        status: "needsAction",
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.due !== undefined ? { due: input.due } : {}),
      };
      list.tasks.unshift(task);
      return task;
    },
  });

  // Capability: complete a task
  ctx.capabilities.register({
    name: "todo_complete_task",
    description: "Mark a task as completed by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The task ID to mark completed." },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: (input: { taskId: string }) => {
      const found = findTask(input.taskId);
      if (!found) throw new Error("Task not found.");
      found.task.status = "completed";
      found.task.completed = new Date().toISOString();
      return found.task;
    },
  });

  // Routes for the panel
  ctx.route("GET", "/tasks", () => listsPayload());

  ctx.route("POST", "/tasks", (args) => {
    const body = args.body as { title: string; notes?: string; due?: string; listId?: string };
    const list = body.listId
      ? store.find((l) => l.id === body.listId)
      : store[0];
    if (!list) throw new Error("Task list not found.");
    const task: GTask = {
      id: uid(),
      title: body.title,
      status: "needsAction",
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.due !== undefined ? { due: body.due } : {}),
    };
    list.tasks.unshift(task);
    return task;
  });

  ctx.route("POST", "/tasks/complete", (args) => {
    const body = args.body as { taskId: string };
    const found = findTask(body.taskId);
    if (!found) throw new Error("Task not found.");
    found.task.status = "completed";
    found.task.completed = new Date().toISOString();
    return found.task;
  });

  ctx.log.info("todo-google backend ready");
});
