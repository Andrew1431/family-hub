import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API, TASKS_KEY, type Task, type TasksResponse, type ViewMode } from "./types";

/**
 * The panel's data layer: one query for the merged lists + optimistic
 * mutations for every action. Each mutation patches the cache immediately,
 * rolls back on error, and re-syncs with the server when it settles.
 */
export function useTasks() {
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: TASKS_KEY,
    queryFn: async (): Promise<TasksResponse> => {
      const res = await fetch(`${API}/tasks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<TasksResponse>;
    },
  });

  // Mutate the cached tasks in place (used by every optimistic mutation).
  function patchCache(fn: (prev: TasksResponse) => TasksResponse) {
    qc.setQueryData<TasksResponse>(TASKS_KEY, (prev) => (prev ? fn(prev) : prev));
  }
  // Snapshot for rollback + pause refetches while a mutation is in flight.
  async function beginOptimistic(): Promise<{ prev: TasksResponse | undefined }> {
    await qc.cancelQueries({ queryKey: TASKS_KEY });
    return { prev: qc.getQueryData<TasksResponse>(TASKS_KEY) };
  }
  function rollback(ctx: { prev: TasksResponse | undefined } | undefined) {
    if (ctx?.prev) qc.setQueryData(TASKS_KEY, ctx.prev);
  }
  function settle() {
    void qc.invalidateQueries({ queryKey: TASKS_KEY });
  }

  const addMutation = useMutation({
    mutationFn: (vars: { title: string; listId: string; due?: string }) =>
      fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      }),
    onMutate: async (vars) => {
      const ctx = await beginOptimistic();
      // Insert a placeholder row immediately; the invalidate on settle swaps in
      // the real task (with its server id).
      const temp: Task = {
        id: `temp-${Date.now()}`,
        title: vars.title,
        status: "needsAction",
        ...(vars.due ? { due: vars.due } : {}),
      };
      patchCache((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === vars.listId ? { ...l, tasks: [...l.tasks, temp] } : l,
        ),
      }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { listId: string; task: Task; completed: boolean }) =>
      fetch(`${API}/tasks/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: vars.listId, taskId: vars.task.id, completed: vars.completed }),
      }),
    onMutate: async (vars) => {
      const ctx = await beginOptimistic();
      const next: Task["status"] = vars.completed ? "completed" : "needsAction";
      patchCache((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === vars.listId
            ? { ...l, tasks: l.tasks.map((t) => (t.id === vars.task.id ? { ...t, status: next } : t)) }
            : l,
        ),
      }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const deleteMutation = useMutation({
    mutationFn: (vars: { listId: string; taskId: string }) =>
      fetch(`${API}/tasks/${encodeURIComponent(vars.listId)}/${encodeURIComponent(vars.taskId)}`, {
        method: "DELETE",
      }),
    onMutate: async (vars) => {
      const ctx = await beginOptimistic();
      patchCache((prev) => ({
        ...prev,
        lists: prev.lists.map((l) =>
          l.id === vars.listId ? { ...l, tasks: l.tasks.filter((t) => t.id !== vars.taskId) } : l,
        ),
      }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const viewMutation = useMutation({
    mutationFn: (mode: ViewMode) =>
      fetch(`${API}/accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewMode: mode }),
      }),
    onMutate: async (mode) => {
      const ctx = await beginOptimistic();
      patchCache((prev) => ({ ...prev, viewMode: mode }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const createListMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch(`${API}/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; id?: string; message?: string }
        | null;
      if (!res.ok || !data?.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      return data;
    },
    onSettled: settle,
  });

  const deleteListMutation = useMutation({
    mutationFn: (listId: string) =>
      fetch(`${API}/lists/${encodeURIComponent(listId)}`, { method: "DELETE" }),
    onMutate: async (listId) => {
      const ctx = await beginOptimistic();
      patchCache((prev) => ({ ...prev, lists: prev.lists.filter((l) => l.id !== listId) }));
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  return {
    tasksQuery,
    addMutation,
    toggleMutation,
    deleteMutation,
    viewMutation,
    createListMutation,
    deleteListMutation,
  };
}
