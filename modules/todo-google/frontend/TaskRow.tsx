import { IconCheck } from "@hub/components";
import { formatDue, isOverdue, type List, type Task } from "./types";

/** One task line: round list-coloured check, title, due date, hover-delete. */
export function TaskRow({
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
        {done && <IconCheck size={10} className="text-base-100" weight={2.5} />}
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

/** A list's tasks: active on top, a dimmed Completed section below. */
export function ListTasks({
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
