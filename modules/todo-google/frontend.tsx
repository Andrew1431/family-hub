import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defineModule, type PanelProps, type SettingsProps } from "@hub/sdk";
import { ScrollView, Title, useModuleHotkeys } from "@hub/components";
import { GoogleConnect } from "@hub/google/connect";
import { manifest } from "./manifest";

// ── Types (mirror backend google.ts) ─────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  notes?: string;
  due?: string; // YYYY-MM-DD
  completed?: string;
}

interface List {
  id: string;
  accountId: string;
  title: string;
  color: string;
  tasks: Task[];
}

type ViewMode = "stacked" | "tabs";

interface TasksResponse {
  viewMode: ViewMode;
  lists: List[];
}

// ── Date helpers (due is date-only; parse parts to avoid timezone drift) ──────

function parseDue(due: string): Date {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function formatDue(due: string): string {
  return parseDue(due).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(due: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseDue(due).getTime() < today.getTime();
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const API = "/api/m/todo-google";

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  color,
  onToggle,
  onDelete,
}: {
  task: Task;
  color: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "completed";
  const overdue = task.due && !done && isOverdue(task.due);
  return (
    <div className="group flex items-start gap-2.5 py-1.5">
      <button
        onClick={onToggle}
        aria-label={done ? "Mark not done" : "Mark complete"}
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-base-content/25 transition-colors"
        style={done ? { backgroundColor: color, borderColor: color } : {}}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-base-100" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <span className={`text-[clamp(14px,1.5vw,17px)] leading-snug ${done ? "text-base-content/35 line-through" : "text-base-content"}`}>
          {task.title}
        </span>
        {task.due && !done && (
          <div className={`mt-0.5 font-serif text-[clamp(12px,1.3vw,14px)] italic ${overdue ? "text-error/80" : "text-base-content/70"}`}>
            {formatDue(task.due)}
          </div>
        )}
      </div>
      <button
        onClick={onDelete}
        aria-label="Delete task"
        className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded text-base-content/0 transition-colors group-hover:text-base-content/35 hover:!text-error"
      >
        ✕
      </button>
    </div>
  );
}

// ── List body (active + completed split) ─────────────────────────────────────

function ListTasks({
  list,
  onToggle,
  onDelete,
}: {
  list: List;
  onToggle: (listId: string, task: Task) => void;
  onDelete: (listId: string, taskId: string) => void;
}) {
  const active = list.tasks.filter((t) => t.status === "needsAction");
  const done = list.tasks.filter((t) => t.status === "completed");
  if (active.length === 0 && done.length === 0) {
    return <div className="py-1 font-serif text-[13px] italic text-base-content/55">Nothing here yet</div>;
  }
  return (
    <div className="flex flex-col">
      {active.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          color={list.color}
          onToggle={() => onToggle(list.id, t)}
          onDelete={() => onDelete(list.id, t.id)}
        />
      ))}
      {done.length > 0 && (
        <>
          <div className="mb-1 mt-2 border-t border-base-content/8 pt-1 font-serif text-[13px] italic text-base-content/45">
            Completed
          </div>
          {done.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              color={list.color}
              onToggle={() => onToggle(list.id, t)}
              onDelete={() => onDelete(list.id, t.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────

const TASKS_KEY = ["todo", "tasks"] as const;

function TodoPanel(_props: PanelProps) {
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: TASKS_KEY,
    queryFn: async (): Promise<TasksResponse> => {
      const res = await fetch(`${API}/tasks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<TasksResponse>;
    },
  });

  const lists = tasksQuery.data?.lists ?? [];
  const viewMode = tasksQuery.data?.viewMode ?? "stacked";
  const loading = tasksQuery.isLoading;
  const refreshing = tasksQuery.isFetching;
  const error = tasksQuery.isError
    ? tasksQuery.error instanceof Error
      ? tasksQuery.error.message
      : "Failed to load tasks"
    : null;

  const [activeId, setActiveId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [showDue, setShowDue] = useState(false);
  const [due, setDue] = useState(todayStr());
  const [stackedAddId, setStackedAddId] = useState<string>("");

  const addInputRef = useRef<HTMLInputElement>(null);
  useModuleHotkeys({ a: () => addInputRef.current?.focus() });

  // List chip helpers (tabs view): add-list modal + two-click delete guard.
  const [addListOpen, setAddListOpen] = useState(false);
  const [addListName, setAddListName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string>("");
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tab to select once a freshly-created list shows up in the next fetch.
  const pendingActivate = useRef<string | null>(null);

  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);

  // Keep the selected tab valid as lists arrive/change; honour a pending switch
  // to a just-created list once it appears.
  useEffect(() => {
    setActiveId((prev) => {
      const pending = pendingActivate.current;
      if (pending && lists.some((l) => l.id === pending)) {
        pendingActivate.current = null;
        return pending;
      }
      return prev && lists.some((l) => l.id === prev) ? prev : (lists[0]?.id ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksQuery.data]);

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

  // In tabs mode the active tab is the add target; in stacked mode, a dropdown.
  const addListId =
    viewMode === "tabs"
      ? activeId
      : (stackedAddId && lists.some((l) => l.id === stackedAddId) ? stackedAddId : (lists[0]?.id ?? ""));

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
    onSuccess: (data) => {
      if (data.id) pendingActivate.current = data.id; // switch to it after refetch
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

  function add() {
    const title = newTitle.trim();
    if (!title || !addListId) return;
    setNewTitle("");
    addMutation.mutate({ title, listId: addListId, ...(showDue && due ? { due } : {}) });
  }
  function toggle(listId: string, task: Task) {
    toggleMutation.mutate({ listId, task, completed: task.status !== "completed" });
  }
  function del(listId: string, taskId: string) {
    deleteMutation.mutate({ listId, taskId });
  }
  function switchView(mode: ViewMode) {
    viewMutation.mutate(mode);
  }
  function submitNewList() {
    const title = addListName.trim();
    if (!title || createListMutation.isPending) return;
    createListMutation.mutate(title, {
      onSuccess: () => { setAddListOpen(false); setAddListName(""); },
    });
  }
  // First click on a chip's delete arms it (icon → checkmark); second confirms.
  // Auto-disarms after a few seconds so a stray tap can't linger.
  function armOrDeleteList(listId: string) {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    if (pendingDeleteId === listId) {
      setPendingDeleteId("");
      deleteListMutation.mutate(listId);
      return;
    }
    setPendingDeleteId(listId);
    deleteTimer.current = setTimeout(() => setPendingDeleteId(""), 3000);
  }

  const remaining = lists.reduce(
    (n, l) => n + l.tasks.filter((t) => t.status === "needsAction").length,
    0,
  );
  const activeList = lists.find((l) => l.id === activeId);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Title>To-Do</Title>
          <button
            onClick={() => void tasksQuery.refetch()}
            disabled={refreshing}
            aria-label="Refresh"
            className="grid h-5 w-5 place-items-center rounded text-base-content/40 transition-colors hover:text-base-content/70"
          >
            <svg className={refreshing ? "animate-spin" : ""} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-base-content/70">{remaining} left</span>
          {lists.length > 1 && (
            <div className="flex items-center gap-0.5 rounded-md bg-base-content/5 p-0.5">
              <ViewBtn active={viewMode === "stacked"} label="Stacked view" onClick={() => void switchView("stacked")}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </ViewBtn>
              <ViewBtn active={viewMode === "tabs"} label="Tabs view" onClick={() => void switchView("tabs")}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" />
                </svg>
              </ViewBtn>
            </div>
          )}
        </div>
      </div>

      {/* Add row */}
      {lists.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex gap-2">
            {viewMode === "stacked" && lists.length > 1 && (
              <select
                value={addListId}
                onChange={(e) => setStackedAddId(e.target.value)}
                className="select select-sm max-w-[40%] border-base-content/10 bg-base-content/5 text-xs"
                aria-label="List to add to"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            )}
            <input
              ref={addInputRef}
              className="input input-sm flex-1 border-base-content/10 bg-base-content/5 text-sm placeholder:text-base-content/35"
              placeholder="Add a task…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            />
            <button
              className={`btn btn-sm btn-square ${showDue ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowDue((s) => !s)}
              aria-label="Toggle due date"
              aria-pressed={showDue}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </button>
            <button className="btn btn-sm btn-primary btn-square" onClick={() => void add()} aria-label="Add task">
              +
            </button>
          </div>
          {showDue && (
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="input input-sm self-start border-base-content/10 bg-base-content/5 text-xs"
              aria-label="Due date"
            />
          )}
        </div>
      )}

      {/* Tabs bar — list chips, with a two-click delete and a + to add a list */}
      {viewMode === "tabs" && lists.length >= 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
          {lists.map((l) => {
            const selected = l.id === activeId;
            const armed = pendingDeleteId === l.id;
            return (
              <div
                key={l.id}
                className={`flex shrink-0 items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-[13px] transition-colors ${
                  selected ? "bg-base-content/10 text-base-content" : "text-base-content/65 hover:bg-base-content/5"
                }`}
              >
                <button onClick={() => setActiveId(l.id)} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.title}
                  <span className="font-mono text-[10px] text-base-content/35">
                    ({l.tasks.filter((t) => t.status === "completed").length}/{l.tasks.length})
                  </span>
                </button>
                <button
                  onClick={() => armOrDeleteList(l.id)}
                  aria-label={armed ? `Confirm delete ${l.title}` : `Delete ${l.title}`}
                  className={`grid h-4 w-4 place-items-center rounded-full transition-colors ${
                    armed ? "text-success" : "text-base-content/30 hover:!text-error"
                  }`}
                >
                  {armed ? (
                    <svg width="11" height="11" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    "✕"
                  )}
                </button>
              </div>
            );
          })}
          <button
            onClick={() => { setAddListName(""); setAddListOpen(true); }}
            aria-label="Add list"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base-content/50 transition-colors hover:bg-base-content/5 hover:text-base-content"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="loading loading-spinner text-base-content/40" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-xs text-error/70">{error}</div>
      ) : lists.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center font-serif text-xs italic text-base-content/60">
          No lists yet. Open settings (hover the card, click the cog) to connect Google and add a list.
        </div>
      ) : viewMode === "tabs" ? (
        <ScrollView className="flex-1">
          {activeList && <ListTasks list={activeList} onToggle={(id, t) => void toggle(id, t)} onDelete={(id, tid) => void del(id, tid)} />}
        </ScrollView>
      ) : (
        <ScrollView className="flex flex-1 flex-col gap-4">
          {lists.map((list) => (
            <div key={list.id}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: list.color }} />
                <span className="font-sans text-[clamp(13px,1.4vw,15px)] tracking-wide text-base-content/80">{list.title}</span>
                <span className="font-mono text-xs text-base-content/45">
                  ({list.tasks.filter((t) => t.status === "completed").length}/{list.tasks.length})
                </span>
              </div>
              <ListTasks list={list} onToggle={(id, t) => void toggle(id, t)} onDelete={(id, tid) => void del(id, tid)} />
            </div>
          ))}
        </ScrollView>
      )}

      {/* Quick add-list modal */}
      {addListOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setAddListOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-base-content/10 bg-base-100 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-label mb-2">New list</div>
            <input
              autoFocus
              value={addListName}
              onChange={(e) => setAddListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewList();
                if (e.key === "Escape") setAddListOpen(false);
              }}
              placeholder="List name…"
              className="input input-sm w-full border-base-content/10 bg-base-content/5"
              aria-label="New list name"
            />
            {createListMutation.isError && (
              <div className="mt-2 text-[11px] text-error/80">
                {createListMutation.error instanceof Error ? createListMutation.error.message : "Couldn't create list"}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn btn-sm btn-ghost" onClick={() => setAddListOpen(false)}>Cancel</button>
              <button
                className="btn btn-sm btn-primary"
                onClick={submitNewList}
                disabled={!addListName.trim() || createListMutation.isPending}
              >
                {createListMutation.isPending ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ViewBtn({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-6 w-6 place-items-center rounded transition-colors ${
        active ? "bg-base-content/10 text-base-content" : "text-base-content/40 hover:text-base-content/70"
      }`}
    >
      {children}
    </button>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

interface SettingsList {
  id: string;
  title: string;
  color: string;
  enabled: boolean;
}

interface SettingsAccount {
  id: string;
  email: string;
  name: string;
  lists: SettingsList[];
}

interface DefaultList {
  accountId: string;
  listId: string;
}

interface OAuthStatus {
  configured: boolean;
  redirectUri: string;
  accounts: SettingsAccount[];
  defaultList: DefaultList | null;
  viewMode: ViewMode;
}

function TodoSettings({ onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(`${API}/oauth/status`)
      .then((r) => r.json() as Promise<OAuthStatus>)
      .then(setStatus)
      .catch(() => {});
    // Lists/accounts/view may have changed → refresh the panel's tasks.
    void qc.invalidateQueries({ queryKey: ["todo", "tasks"] });
  }

  useEffect(load, []);

  function connect() {
    const popup = window.open(`${API}/oauth/start`, "google-oauth", "width=520,height=640");
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        load();
      }
    }, 800);
  }

  async function disconnect(id: string) {
    await fetch(`${API}/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  function patchList(accountId: string, listId: string, fields: Partial<SettingsList>) {
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            accounts: prev.accounts.map((a) =>
              a.id === accountId
                ? { ...a, lists: a.lists.map((l) => (l.id === listId ? { ...l, ...fields } : l)) }
                : a,
            ),
          }
        : prev,
    );
  }

  async function createList(accountId: string) {
    const title = newListTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    await fetch(`${API}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, accountId }),
    });
    setNewListTitle("");
    setBusy(false);
    load();
  }

  async function renameList(listId: string, title: string, original: string) {
    const t = title.trim();
    if (!t || t === original) return;
    await fetch(`${API}/lists/${encodeURIComponent(listId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    load();
  }

  async function deleteList(listId: string) {
    if (!confirm("Delete this list and all its tasks? This can't be undone.")) return;
    await fetch(`${API}/lists/${encodeURIComponent(listId)}`, { method: "DELETE" });
    load();
  }

  async function saveSettings() {
    if (!status) return;
    setSaving(true);
    await fetch(`${API}/accounts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: status.accounts,
        defaultList: status.defaultList,
        viewMode: status.viewMode,
      }),
    });
    setSaving(false);
    onClose();
  }

  if (!status) {
    return (
      <div className="grid place-items-center py-8">
        <span className="loading loading-spinner text-base-content/40" />
      </div>
    );
  }

  const allLists = status.accounts.flatMap((a) => a.lists.map((l) => ({ accountId: a.id, ...l })));

  return (
    <div className="flex flex-col gap-5">
      {/* Google client (only until configured) */}
      {!status.configured ? (
        <div className="flex flex-col gap-2">
          <div className="panel-label">Google account</div>
          <GoogleConnect
            apiBase={API}
            configured={status.configured}
            redirectUri={status.redirectUri}
            onChanged={load}
            showConnect={false}
            intro={
              <p className="font-serif text-xs italic text-base-content/65">
                Reuses the hub's shared OAuth client (same one the calendar uses). Set{" "}
                <code className="font-mono">GOOGLE_CLIENT_ID</code> /{" "}
                <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in{" "}
                <code className="font-mono">.env</code> and restart — or paste them below. Register
                this one redirect URI (shared by every Google module):
              </p>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="panel-label">Lists</div>
          {status.accounts.length === 0 ? (
            <p className="font-serif text-xs italic text-base-content/65">
              Client configured. Connect the shared family account to manage lists.
            </p>
          ) : (
            status.accounts.map((acct) => (
              <div key={acct.id} className="flex flex-col gap-2 rounded-lg border border-base-content/10 bg-base-content/[0.03] p-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-sans text-xs font-semibold text-base-content">
                    {acct.email}
                  </span>
                  <button onClick={() => void disconnect(acct.id)} className="text-[11px] text-base-content/40 hover:text-error">
                    Disconnect
                  </button>
                </div>
                {acct.lists.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 pl-1">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={l.enabled}
                      onChange={(e) => patchList(acct.id, l.id, { enabled: e.target.checked })}
                      aria-label={`Show ${l.title}`}
                    />
                    <input
                      type="color"
                      value={l.color}
                      onChange={(e) => patchList(acct.id, l.id, { color: e.target.value })}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={`${l.title} colour`}
                    />
                    <input
                      defaultValue={l.title}
                      onBlur={(e) => void renameList(l.id, e.target.value, l.title)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="input input-xs min-w-0 flex-1 border-base-content/10 bg-base-content/5 font-sans"
                      aria-label="List name"
                    />
                    <button
                      onClick={() => void deleteList(l.id)}
                      aria-label={`Delete ${l.title}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-base-content/40 hover:bg-error/10 hover:text-error"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {/* Create list */}
                <div className="flex items-center gap-2 pl-1">
                  <input
                    value={newListTitle}
                    onChange={(e) => setNewListTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void createList(acct.id); }}
                    placeholder="New list…"
                    className="input input-xs flex-1 border-base-content/10 bg-base-content/5"
                  />
                  <button className="btn btn-xs btn-primary" onClick={() => void createList(acct.id)} disabled={!newListTitle.trim() || busy}>
                    Add list
                  </button>
                </div>
              </div>
            ))
          )}

          <button className="btn btn-sm btn-ghost self-start" onClick={connect}>
            + Connect account
          </button>

          {allLists.length > 0 && (
            <>
              <label className="flex flex-col gap-1">
                <span className="panel-label">New tasks default to</span>
                <select
                  value={status.defaultList?.listId ?? ""}
                  onChange={(e) => {
                    const sel = allLists.find((l) => l.id === e.target.value);
                    setStatus({ ...status, defaultList: sel ? { accountId: sel.accountId, listId: sel.id } : null });
                  }}
                  className="select select-sm border-base-content/10 bg-base-content/5"
                >
                  <option value="">— first enabled list —</option>
                  {allLists.map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="panel-label">Panel layout</span>
                <select
                  value={status.viewMode}
                  onChange={(e) => setStatus({ ...status, viewMode: e.target.value === "tabs" ? "tabs" : "stacked" })}
                  className="select select-sm border-base-content/10 bg-base-content/5"
                >
                  <option value="stacked">Stacked — all lists at once</option>
                  <option value="tabs">Tabs — one list at a time</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-base-content/10 pt-3">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
        {status.configured && status.accounts.length > 0 && (
          <button className="btn btn-sm btn-primary" onClick={() => void saveSettings()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

export default defineModule({ manifest, Panel: TodoPanel, Settings: TodoSettings });
