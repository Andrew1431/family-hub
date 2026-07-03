import type { ResolvedEvent } from "./types";
import { formatDuration, formatTime } from "./dates";

/**
 * One event line: title + time on a quiet inset row, with the calendar's
 * colour as a left rail and a tinted name chip. Clickable (→ edit) when the
 * event lives on a writable Google calendar.
 */
export function EventRow({
  event,
  onEdit,
}: {
  event: ResolvedEvent;
  onEdit?: (event: ResolvedEvent) => void;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-[clamp(14px,1.5vw,17px)] font-medium text-base-content">
          {event.summary}
        </div>
        <div className="mt-0.5 font-serif text-[clamp(12px,1.3vw,14px)] italic text-base-content/75">
          {event.allDay
            ? "All day"
            : `${formatTime(event.start)} · ${formatDuration(event.start, event.end)}`}
        </div>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold"
        style={{
          color: event.color,
          background: `${event.color}22`,
          border: `1px solid ${event.color}55`,
        }}
      >
        {event.calendarName}
      </span>
    </>
  );
  const style = { borderLeft: `3px solid ${event.color}` };
  if (onEdit) {
    return (
      <button
        type="button"
        onClick={() => onEdit(event)}
        aria-label={`Edit ${event.summary}`}
        className="flex w-full items-center gap-3 rounded-lg bg-base-content/5 px-3 py-2.5 text-left
                   transition-colors hover:bg-base-content/10"
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-base-content/5 px-3 py-2.5" style={style}>
      {inner}
    </div>
  );
}
