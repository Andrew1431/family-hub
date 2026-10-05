import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PanelProps } from "@hub/sdk";
import {
  EmptyState,
  ErrorState,
  IconButton,
  IconCalendar,
  IconCheck,
  IconPlus,
  IconRefresh,
  IconRows,
  IconTabs,
  IconX,
  LoadingState,
  Modal,
  ScrollView,
  Select,
  TextInput,
  Title,
  useModuleHotkeys,
} from "@hub/components";
import { todayStr, type Task, type ViewMode } from "./types";
import { useTasks } from "./useTasks";
import { FOCUS, ListTasks } from "./TaskRow";

export function TodoPanel(_props: PanelProps) {
  const {
    tasksQuery,
    addMutation,
    toggleMutation,
    deleteMutation,
    viewMutation,
    createListMutation,
    deleteListMutation,
  } = useTasks();

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
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Keyboard model (active once the card is focused) ──
  //   a        add a task            ↑/↓ j/k  move between tasks
  //   Enter/␣  toggle focused task   Del/x    delete (press twice)
  //   ←/→      switch list (tabs)    v        stacked ↔ tabs
  //   r        refresh               l        new list
  const rows = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-task-row]") ?? []);
  function moveRow(delta: number) {
    const all = rows();
    if (all.length === 0) return;
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next = i < 0 ? (delta > 0 ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, i + delta));
    all[next]?.focus();
    all[next]?.scrollIntoView({ block: "nearest" });
  }
  function focusedTask(): { listId: string; taskId: string } | null {
    const id = (document.activeElement as HTMLElement | null)?.dataset.taskRow;
    if (!id) return null;
    const list = lists.find((l) => l.tasks.some((t) => t.id === id));
    return list ? { listId: list.id, taskId: id } : null;
  }
  function cycleList(delta: number) {
    if (viewMode !== "tabs" || lists.length < 2) return;
    const i = lists.findIndex((l) => l.id === activeId);
    const next = lists[(i + delta + lists.length) % lists.length];
    if (next) setActiveId(next.id);
  }
  // Keep the selected chip visible in the (horizontally scrolling) tab strip.
  useEffect(() => {
    rootRef.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeId]);
  const deleteFocused = () => {
    const f = focusedTask();
    if (f) armOrDeleteTask(f.listId, f.taskId);
  };
  useModuleHotkeys({
    a: () => addInputRef.current?.focus(),
    arrowdown: () => moveRow(1),
    arrowup: () => moveRow(-1),
    j: () => moveRow(1),
    k: () => moveRow(-1),
    arrowleft: () => cycleList(-1),
    arrowright: () => cycleList(1),
    delete: deleteFocused,
    backspace: deleteFocused,
    x: deleteFocused,
    v: () => lists.length > 1 && switchView(viewMode === "tabs" ? "stacked" : "tabs"),
    r: () => void tasksQuery.refetch(),
    l: () => { setAddListName(""); setAddListOpen(true); },
  });

  // Task delete: first tap/press arms (✕ → ✓), second confirms; auto-disarms.
  const [armedTaskId, setArmedTaskId] = useState("");
  const taskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (taskTimer.current) clearTimeout(taskTimer.current); }, []);
  function armOrDeleteTask(listId: string, taskId: string) {
    if (taskTimer.current) clearTimeout(taskTimer.current);
    if (armedTaskId !== taskId) {
      setArmedTaskId(taskId);
      taskTimer.current = setTimeout(() => setArmedTaskId(""), 3000);
      return;
    }
    setArmedTaskId("");
    // Keep keyboard focus in the list: land on the row that takes this one's place.
    const all = rows();
    const i = all.findIndex((el) => el.dataset.taskRow === taskId);
    const hadFocus = document.activeElement === all[i];
    deleteMutation.mutate({ listId, taskId });
    if (hadFocus) {
      requestAnimationFrame(() => {
        const after = rows();
        after[Math.min(i, after.length - 1)]?.focus();
      });
    }
  }

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

  // In tabs mode the active tab is the add target; in stacked mode, a dropdown.
  const addListId =
    viewMode === "tabs"
      ? activeId
      : (stackedAddId && lists.some((l) => l.id === stackedAddId) ? stackedAddId : (lists[0]?.id ?? ""));

  function add() {
    const title = newTitle.trim();
    if (!title || !addListId) return;
    setNewTitle("");
    addMutation.mutate({ title, listId: addListId, ...(showDue && due ? { due } : {}) });
  }
  function toggle(listId: string, task: Task) {
    toggleMutation.mutate({ listId, task, completed: task.status !== "completed" });
  }
  function switchView(mode: ViewMode) {
    viewMutation.mutate(mode);
  }
  function submitNewList() {
    const title = addListName.trim();
    if (!title || createListMutation.isPending) return;
    createListMutation.mutate(title, {
      onSuccess: (data) => {
        if (data.id) pendingActivate.current = data.id; // switch to it after refetch
        setAddListOpen(false);
        setAddListName("");
      },
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
    <div ref={rootRef} className="flex h-full flex-col gap-3 overflow-hidden p-1">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Title>To-Do</Title>
          <IconButton
            label="Refresh"
            size="sm"
            onClick={() => void tasksQuery.refetch()}
            disabled={refreshing}
          >
            <IconRefresh size={13} className={refreshing ? "animate-spin" : ""} />
          </IconButton>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-base-content/70">{remaining} left</span>
          {lists.length > 1 && (
            <div className="flex items-center gap-0.5 rounded-md bg-base-content/5 p-0.5">
              <ViewBtn active={viewMode === "stacked"} label="Stacked view" onClick={() => switchView("stacked")}>
                <IconRows size={15} />
              </ViewBtn>
              <ViewBtn active={viewMode === "tabs"} label="Tabs view" onClick={() => switchView("tabs")}>
                <IconTabs size={15} />
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
              <Select
                value={addListId}
                onChange={(e) => setStackedAddId(e.target.value)}
                className="max-w-[40%] text-xs"
                aria-label="List to add to"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </Select>
            )}
            <TextInput
              ref={addInputRef}
              className="flex-1 text-sm placeholder:text-base-content/35"
              placeholder="Add a task…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            />
            <button
              className={`btn btn-square ${FOCUS} ${showDue ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowDue((s) => !s)}
              aria-label="Toggle due date"
              aria-pressed={showDue}
            >
              <IconCalendar size={17} />
            </button>
            <button className={`btn btn-primary btn-square ${FOCUS}`} onClick={() => add()} aria-label="Add task">
              <IconPlus size={17} />
            </button>
          </div>
          {showDue && (
            <TextInput
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="self-start text-xs"
              aria-label="Due date"
            />
          )}
        </div>
      )}

      {/* Tabs bar — list chips, with a two-click delete and a + to add a list */}
      {viewMode === "tabs" && lists.length >= 1 && (
        <ScrollView axis="x" role="tablist" aria-label="Lists" className="-m-1 flex shrink-0 items-center gap-1 p-1">
          {lists.map((l) => {
            const selected = l.id === activeId;
            const armed = pendingDeleteId === l.id;
            return (
              <div
                key={l.id}
                className={`flex min-h-10 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-1 text-[13px] transition-colors ${
                  selected ? "bg-base-content/10 text-base-content" : "text-base-content/65 hover:bg-base-content/5"
                }`}
              >
                <button
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(l.id)}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 ${FOCUS}`}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.title}
                  <span className="font-mono text-[10px] text-base-content/35">
                    ({l.tasks.filter((t) => t.status === "completed").length}/{l.tasks.length})
                  </span>
                </button>
                <button
                  onClick={() => armOrDeleteList(l.id)}
                  aria-label={armed ? `Confirm delete ${l.title}` : `Delete ${l.title}`}
                  className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${FOCUS} ${
                    armed ? "text-success" : "text-base-content/30 hover:!text-error"
                  }`}
                >
                  {armed ? <IconCheck size={13} weight={2.5} /> : <IconX size={12} />}
                </button>
              </div>
            );
          })}
          <IconButton
            label="Add list"
            onClick={() => { setAddListName(""); setAddListOpen(true); }}
            className="rounded-full"
          >
            <IconPlus size={14} weight={2.2} />
          </IconButton>
        </ScrollView>
      )}

      {/* Body */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState>{error}</ErrorState>
      ) : lists.length === 0 ? (
        <EmptyState>
          No lists yet. Open settings (hover the card, click the cog) to connect Google and add a list.
        </EmptyState>
      ) : viewMode === "tabs" ? (
        <ScrollView className="-mx-1 flex-1 px-1 py-0.5">
          {activeList && <ListTasks list={activeList} armedId={armedTaskId} onToggle={toggle} onDelete={armOrDeleteTask} />}
        </ScrollView>
      ) : (
        <ScrollView className="-mx-1 flex flex-1 flex-col gap-4 px-1 py-0.5">
          {lists.map((list) => (
            <div key={list.id}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: list.color }} />
                <span className="font-sans text-[clamp(13px,1.4vw,15px)] tracking-wide text-base-content/80">{list.title}</span>
                <span className="font-mono text-xs text-base-content/45">
                  ({list.tasks.filter((t) => t.status === "completed").length}/{list.tasks.length})
                </span>
              </div>
              <ListTasks list={list} armedId={armedTaskId} onToggle={toggle} onDelete={armOrDeleteTask} />
            </div>
          ))}
        </ScrollView>
      )}

      {/* Quick add-list modal */}
      {addListOpen && (
        <Modal title="New list" onClose={() => setAddListOpen(false)} width="min(320px, 96vw)">
          <div className="flex flex-col gap-3">
            <TextInput
              autoFocus
              value={addListName}
              onChange={(e) => setAddListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNewList(); }}
              placeholder="List name…"
              className="w-full"
              aria-label="New list name"
            />
            {createListMutation.isError && (
              <div className="text-[11px] text-error/80">
                {createListMutation.error instanceof Error
                  ? createListMutation.error.message
                  : "Couldn't create list"}
              </div>
            )}
            <div className="flex justify-end gap-2">
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
        </Modal>
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
      className={`grid h-8 w-8 place-items-center rounded transition-colors ${FOCUS} ${
        active ? "bg-base-content/10 text-base-content" : "text-base-content/40 hover:text-base-content/70"
      }`}
    >
      {children}
    </button>
  );
}
