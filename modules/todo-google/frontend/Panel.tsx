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
import { ListTasks } from "./TaskRow";

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
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
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
                <IconRows size={13} />
              </ViewBtn>
              <ViewBtn active={viewMode === "tabs"} label="Tabs view" onClick={() => switchView("tabs")}>
                <IconTabs size={13} />
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
              className={`btn btn-sm btn-square ${showDue ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowDue((s) => !s)}
              aria-label="Toggle due date"
              aria-pressed={showDue}
            >
              <IconCalendar size={15} />
            </button>
            <button className="btn btn-sm btn-primary btn-square" onClick={() => add()} aria-label="Add task">
              <IconPlus size={15} />
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
                  {armed ? <IconCheck size={11} weight={2.5} /> : "✕"}
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
        </div>
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
        <ScrollView className="flex-1">
          {activeList && <ListTasks list={activeList} onToggle={toggle} onDelete={del} />}
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
              <ListTasks list={list} onToggle={toggle} onDelete={del} />
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
      className={`grid h-6 w-6 place-items-center rounded transition-colors ${
        active ? "bg-base-content/10 text-base-content" : "text-base-content/40 hover:text-base-content/70"
      }`}
    >
      {children}
    </button>
  );
}
