import { useState, useEffect, useRef } from "react";
import { defineModule, type PanelProps } from "@hub/sdk";
import { manifest } from "./manifest";

// ── Types (Google Tasks API shape) ─────────────────────────────────────────

interface GTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
}

interface GTaskList {
  id: string;
  title: string;
  color: string; // assigned by backend from a fixed palette, one color per list
  tasks: GTask[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDue(due: string): string {
  const d = new Date(due);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface TaskRowProps {
  task: GTask;
  listColor: string;
  onComplete: (taskId: string) => void;
}

function TaskRow({ task, listColor, onComplete }: TaskRowProps) {
  const done = task.status === "completed";
  return (
    <div className="flex items-start gap-2 py-1">
      <button
        onClick={() => { if (!done) onComplete(task.id); }}
        aria-label={done ? "Completed" : "Mark complete"}
        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border border-base-content/25 flex items-center justify-center transition-colors"
        style={done ? { backgroundColor: listColor, borderColor: listColor } : {}}
      >
        {done && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-base-100" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm leading-snug ${done ? "line-through text-base-content/35" : "text-base-content"}`}
        >
          {task.title}
        </span>
        {task.due && !done && (
          <div className="font-serif italic text-xs text-base-content/50 mt-0.5">
            {formatDue(task.due)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────

function TodoPanel(_props: PanelProps) {
  const [lists, setLists] = useState<GTaskList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/m/todo-google/tasks");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GTaskList[];
      setLists(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchTasks(); }, []);

  async function handleComplete(taskId: string) {
    await fetch("/api/m/todo-google/tasks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    await fetchTasks();
  }

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    await fetch("/api/m/todo-google/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await fetchTasks();
  }

  const remaining = lists.reduce(
    (n, l) => n + l.tasks.filter((t) => t.status === "needsAction").length,
    0,
  );

  const multiList = lists.length > 1;

  return (
    <div className="flex h-full flex-col gap-3 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="panel-label">To-Do</span>
        <span className="font-mono text-xs text-base-content/50">{remaining} remaining</span>
      </div>

      {/* Add row */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="input input-sm flex-1 bg-base-content/5 border-base-content/10 text-sm placeholder:text-base-content/35"
          placeholder="Add a task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { void handleAdd(); } }}
        />
        <button
          className="btn btn-sm btn-primary"
          onClick={() => { void handleAdd(); }}
          aria-label="Add task"
        >
          +
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="loading loading-spinner text-base-content/40" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-xs text-error/70">{error}</div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-4">
          {lists.map((list) => {
            const active = list.tasks.filter((t) => t.status === "needsAction");
            const done = list.tasks.filter((t) => t.status === "completed");
            return (
              <div key={list.id}>
                {multiList && (
                  <div className="flex items-center gap-1.5 mb-1">
                    {/* Color dot derived from list, not from a person */}
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: list.color }}
                    />
                    <span className="text-xs font-sans text-base-content/60 tracking-wide">
                      {list.title}
                    </span>
                  </div>
                )}
                <div className="flex flex-col">
                  {active.map((t) => (
                    <TaskRow key={t.id} task={t} listColor={list.color} onComplete={(id) => { void handleComplete(id); }} />
                  ))}
                  {done.length > 0 && (
                    <>
                      <div className="mt-2 mb-1 text-xs font-serif italic text-base-content/35 border-t border-base-content/8 pt-1">
                        Completed
                      </div>
                      {done.map((t) => (
                        <TaskRow key={t.id} task={t} listColor={list.color} onComplete={(id) => { void handleComplete(id); }} />
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default defineModule({ manifest, Panel: TodoPanel });
