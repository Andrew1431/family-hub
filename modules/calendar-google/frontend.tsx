import { useEffect, useState } from "react";
import { defineModule, type PanelProps } from "@hub/sdk";
import { manifest } from "./manifest";

interface ResolvedEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  calendarId: string;
  calendarName: string;
  color: string;
  location?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Section header for a day group: "Today" / "Tomorrow" / "Wednesday",
// with a secondary "Jun 11" date label (omitted for Today).
function headerFor(iso: string): { label: string; dateLabel: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, today)) return { label: "Today", dateLabel: "" };
  if (sameDay(d, tomorrow)) return { label: "Tomorrow", dateLabel: date };
  return { label: d.toLocaleDateString("en-US", { weekday: "long" }), dateLabel: date };
}

interface DayGroup {
  key: string;
  label: string;
  dateLabel: string;
  events: ResolvedEvent[];
}

function groupByDay(events: ResolvedEvent[]): DayGroup[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const groups: DayGroup[] = [];
  for (const ev of sorted) {
    const key = dayKey(ev.start);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, ...headerFor(ev.start), events: [] };
      groups.push(g);
    }
    g.events.push(ev);
  }
  return groups;
}

function EventRow({ event }: { event: ResolvedEvent }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderLeft: `3px solid ${event.color}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-sans font-medium text-[13px] text-base-content truncate">
          {event.summary}
        </div>
        <div className="font-serif italic text-[11px] text-base-content/60 mt-0.5">
          {formatTime(event.start)} · {formatDuration(event.start, event.end)}
        </div>
      </div>
      <span
        className="shrink-0 text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full"
        style={{
          color: event.color,
          background: `${event.color}22`,
          border: `1px solid ${event.color}55`,
        }}
      >
        {event.calendarName}
      </span>
    </div>
  );
}

function CalendarPanel(_props: PanelProps) {
  const [events, setEvents] = useState<ResolvedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/m/calendar-google/events")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ResolvedEvent[]>;
      })
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
  }, []);

  const groups = groupByDay(events);

  return (
    <div className="flex flex-col gap-3.5 h-full overflow-hidden p-1">
      <div className="panel-label shrink-0">Calendar</div>

      {loading && (
        <div className="font-serif italic text-base-content/40 text-[13px]">
          Loading…
        </div>
      )}

      {error !== null && (
        <div className="font-sans text-[12px] text-error/70">{error}</div>
      )}

      {!loading && error === null && (
        groups.length === 0 ? (
          <div className="font-serif italic text-[12px] text-base-content/30">
            Nothing scheduled
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="font-serif text-[11px] tracking-[0.09em] uppercase text-base-content/40 mb-2">
                  {g.label}
                  {g.dateLabel && (
                    <span className="text-base-content/25"> · {g.dateLabel}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {g.events.map((ev) => (
                    <EventRow key={ev.id} event={ev} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default defineModule({ manifest, Panel: CalendarPanel });
