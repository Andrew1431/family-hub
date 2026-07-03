import type { ResolvedEvent } from "./types";

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** Compact time for dense month cells: "9a", "2:30p". */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, "0")}${ap}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ── Day keys & grouping ───────────────────────────────────────────────────────

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function localKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayKey(iso: string): string {
  return localKey(new Date(iso));
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

export interface DayGroup {
  key: string;
  label: string;
  dateLabel: string;
  events: ResolvedEvent[];
}

export function groupByDay(events: ResolvedEvent[]): DayGroup[] {
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

// Today is always shown as the first section, even with no events, so the panel
// never looks broken/empty — an explicit "Nothing on the calendar today" reads
// as intentional. If today already has events its group is left in place.
export function ensureToday(groups: DayGroup[]): DayGroup[] {
  const t = new Date();
  const key = localKey(t);
  if (groups.some((g) => g.key === key)) return groups;
  return [{ key, label: "Today", dateLabel: "", events: [] }, ...groups];
}

// ── Event-form date plumbing ──────────────────────────────────────────────────

export function defaultDateTime(): { date: string; start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3_600_000);
  const dateStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  return {
    date: dateStr,
    start: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    end: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
}

/** Combine a local date + "HH:mm" into an ISO string. */
export function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

/** Local YYYY-MM-DD / HH:mm parts of an ISO instant (for prefilling the form). */
export function dateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** The day after a YYYY-MM-DD (Google's all-day end.date is exclusive). */
export function nextDayStr(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// ── Month grid ────────────────────────────────────────────────────────────────

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// The 6-week (42-day) grid spanning the anchor's month, starting on the Sunday
// on/before the 1st. `to` is exclusive — it's also the events fetch window.
export function monthGridRange(anchor: Date): { from: Date; to: Date } {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const from = new Date(first);
  from.setDate(first.getDate() - first.getDay());
  const to = new Date(from);
  to.setDate(from.getDate() + 42);
  return { from, to };
}
