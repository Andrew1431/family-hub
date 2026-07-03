import { useState } from "react";
import { IconButton, IconCalendar, Modal } from "@hub/components";
import type { ResolvedEvent } from "./types";
import { dayKey, localKey, monthGridRange, shortTime, startOfDay } from "./dates";
import { EventRow } from "./EventRow";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_MAX_EVENTS = 3; // chips per cell before "+N more"

export function MonthHeader({
  anchor,
  onPrev,
  onNext,
  onToday,
}: {
  anchor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const label = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Previous month" size="sm" onClick={onPrev}>
        <span className="text-lg leading-none">‹</span>
      </IconButton>
      <span className="font-serif text-[clamp(14px,1.6vw,18px)] font-semibold text-base-content">
        {label}
      </span>
      <IconButton label="Back to current month" size="sm" onClick={onToday}>
        <IconCalendar size={15} />
      </IconButton>
      <IconButton label="Next month" size="sm" onClick={onNext}>
        <span className="text-lg leading-none">›</span>
      </IconButton>
    </div>
  );
}

export function MonthGrid({
  events,
  anchor,
  editableIds,
  onEdit,
}: {
  events: ResolvedEvent[];
  anchor: Date;
  editableIds: Set<string>;
  onEdit: (event: ResolvedEvent) => void;
}) {
  const { from } = monthGridRange(anchor);
  const month = anchor.getMonth();
  const today = startOfDay(new Date()).getTime();
  const [openDay, setOpenDay] = useState<Date | null>(null);

  const byDay = new Map<string, ResolvedEvent[]>();
  for (const ev of events) {
    const k = dayKey(ev.start);
    const list = byDay.get(k);
    if (list) list.push(ev);
    else byDay.set(k, [ev]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) =>
      a.allDay === b.allDay
        ? new Date(a.start).getTime() - new Date(b.start).getTime()
        : a.allDay
          ? -1
          : 1,
    );
  }

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    cells.push(d);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-center font-serif text-[clamp(10px,1vw,12px)] uppercase tracking-[0.08em] text-base-content/40"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
        {cells.map((d) => {
          const inMonth = d.getMonth() === month;
          const isToday = d.getTime() === today;
          const dayEvents = byDay.get(localKey(d)) ?? [];
          const hasEvents = dayEvents.length > 0;
          return (
            <button
              key={d.getTime()}
              type="button"
              disabled={!hasEvents}
              onClick={() => setOpenDay(d)}
              className={`flex min-h-0 flex-col overflow-hidden rounded-md border px-1 py-0.5 text-left transition-colors ${
                isToday
                  ? "border-primary/50 bg-primary/[0.07]"
                  : "border-base-content/5 bg-base-content/[0.02]"
              } ${inMonth ? "" : "opacity-35"} ${
                hasEvents ? "cursor-pointer hover:border-base-content/25" : "cursor-default"
              }`}
            >
              <div
                className={`mb-0.5 shrink-0 text-right font-sans text-[clamp(10px,1.1vw,13px)] ${
                  isToday ? "font-bold text-primary" : "text-base-content/60"
                }`}
              >
                {d.getDate()}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, MONTH_MAX_EVENTS).map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-1 rounded-sm px-1 py-px"
                    style={{ background: `${ev.color}22` }}
                    title={ev.summary}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ev.color }} />
                    <span className="truncate font-sans text-[clamp(9px,1vw,11px)] leading-tight text-base-content/85">
                      {!ev.allDay && <span className="text-base-content/50">{shortTime(ev.start)} </span>}
                      {ev.summary}
                    </span>
                  </div>
                ))}
                {dayEvents.length > MONTH_MAX_EVENTS && (
                  <div className="px-1 font-sans text-[clamp(9px,0.9vw,10px)] text-base-content/45">
                    +{dayEvents.length - MONTH_MAX_EVENTS} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {openDay && (
        <DayModal
          day={openDay}
          events={byDay.get(localKey(openDay)) ?? []}
          editableIds={editableIds}
          onEdit={onEdit}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}

/** All of a single day's events, opened by clicking a populated month cell. */
function DayModal({
  day,
  events,
  editableIds,
  onEdit,
  onClose,
}: {
  day: Date;
  events: ResolvedEvent[];
  editableIds: Set<string>;
  onEdit: (event: ResolvedEvent) => void;
  onClose: () => void;
}) {
  const title = day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <Modal title={title} onClose={onClose} width="min(420px, 96vw)">
      {events.length === 0 ? (
        <p className="font-serif text-sm italic text-base-content/55">
          Nothing on the calendar this day.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((ev) => (
            <EventRow
              key={ev.id}
              event={ev}
              {...(editableIds.has(ev.calendarId) ? { onEdit } : {})}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
