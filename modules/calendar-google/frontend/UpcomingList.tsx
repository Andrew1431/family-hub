import { ScrollView } from "@hub/components";
import type { ResolvedEvent } from "./types";
import { ensureToday, groupByDay } from "./dates";
import { EventRow } from "./EventRow";

/** The day-grouped agenda: Today (always present) → Tomorrow → weekday…. */
export function UpcomingList({
  events,
  editableIds,
  onEdit,
}: {
  events: ResolvedEvent[];
  editableIds: Set<string>;
  onEdit: (event: ResolvedEvent) => void;
}) {
  const groups = ensureToday(groupByDay(events));
  return (
    <ScrollView className="flex min-h-0 flex-1 flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key}>
          {g.label === "Today" ? (
            <div className="mb-2 flex items-center gap-1.5 font-serif text-[clamp(13px,1.4vw,15px)] font-semibold uppercase tracking-[0.09em] text-primary">
              <span aria-hidden>📅</span>
              Today
            </div>
          ) : (
            <div className="mb-2 font-serif text-[clamp(12px,1.3vw,14px)] uppercase tracking-[0.09em] text-base-content/60">
              {g.label}
              {g.dateLabel && <span className="text-base-content/40"> · {g.dateLabel}</span>}
            </div>
          )}
          {g.events.length === 0 ? (
            <div className="rounded-lg border border-base-content/10 bg-base-content/[0.03] px-3 py-3 font-serif text-[clamp(13px,1.4vw,15px)] italic text-base-content/55">
              Nothing on the calendar today
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {g.events.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  {...(editableIds.has(ev.calendarId) ? { onEdit } : {})}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </ScrollView>
  );
}
