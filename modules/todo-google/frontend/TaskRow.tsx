import { IconCheck, IconX } from "@hub/components";
import { formatDue, isOverdue, type List, type Task } from "./types";

// Shared focus ring for every interactive bit in the panel (keyboard only).
export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-base-200";

/**
 * One task line. The whole row is the toggle target (thumb-sized on the wall
 * display); delete sits on the right and needs two taps — the first arms it.
 * Rows carry `data-task-row` so the panel can move focus between them with
 * the arrow keys.
 */
export function TaskRow({
  task,
  color,
  armed,
  onToggle,
  onDelete,
}: {
  task: Task;
  color: string;
  armed: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "completed";
  const overdue = task.due && !done && isOverdue(task.due);
  return (
    <div className="group flex items-stretch gap-1">
      <button
        data-task-row={task.id}
        onClick={onToggle}
        aria-pressed={done}
        aria-label={`${task.title}${task.due && !done ? `, due ${formatDue(task.due)}` : ""}`}
        className={`flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg px-1.5 py-2 text-left transition-colors active:bg-base-content/10 hover:bg-base-content/5 ${FOCUS}`}
      >
        <span
          aria-hidden
          className="mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-base-content/25 transition-colors"
          style={done ? { backgroundColor: color, borderColor: color } : { borderColor: color }}
        >
          {done && <IconCheck size={12} className="text-base-100" weight={2.5} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[clamp(14px,1.5vw,17px)] leading-snug ${done ? "text-base-content/35 line-through" : "text-base-content"}`}>
            {task.title}
          </span>
          {task.due && !done && (
            <span className={`mt-0.5 block font-serif text-[clamp(12px,1.3vw,14px)] italic ${overdue ? "text-error/80" : "text-base-content/70"}`}>
              {formatDue(task.due)}
            </span>
          )}
        </span>
      </button>
      <button
        onClick={onDelete}
        tabIndex={-1}
        aria-label={armed ? `Confirm delete ${task.title}` : `Delete ${task.title}`}
        className={`grid w-11 flex-shrink-0 place-items-center rounded-lg transition-colors ${
          armed
            ? "bg-error/15 text-error"
            : "text-base-content/25 hover:text-error group-focus-within:text-base-content/45 [@media(hover:hover)]:text-base-content/0 [@media(hover:hover)]:group-hover:text-base-content/35"
        }`}
      >
        {armed ? <IconCheck size={14} weight={2.5} /> : <IconX size={14} />}
      </button>
    </div>
  );
}

/**
 * A list's tasks: active on top, a dimmed Completed section below. Rendered as
 * ONE keyed array so a toggled task keeps its DOM node (and keyboard focus)
 * when it moves between sections.
 */
export function ListTasks({
  list,
  armedId,
  onToggle,
  onDelete,
}: {
  list: List;
  armedId: string;
  onToggle: (listId: string, task: Task) => void;
  onDelete: (listId: string, taskId: string) => void;
}) {
  const active = list.tasks.filter((t) => t.status === "needsAction");
  const done = list.tasks.filter((t) => t.status === "completed");
  if (active.length === 0 && done.length === 0) {
    return <div className="py-1 font-serif text-[13px] italic text-base-content/55">Nothing here yet</div>;
  }
  const row = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      color={list.color}
      armed={armedId === t.id}
      onToggle={() => onToggle(list.id, t)}
      onDelete={() => onDelete(list.id, t.id)}
    />
  );
  return (
    <div className="flex flex-col">
      {[
        ...active.map(row),
        ...(done.length > 0
          ? [
              <div
                key="__completed"
                className="mb-1 mt-2 border-t border-base-content/8 pt-1 font-serif text-[13px] italic text-base-content/45"
              >
                Completed
              </div>,
            ]
          : []),
        ...done.map(row),
      ]}
    </div>
  );
}
