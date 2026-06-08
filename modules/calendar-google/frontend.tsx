import { useEffect, useState } from "react";
import { defineModule, type PanelProps, type SettingsProps } from "@hub/sdk";
import { manifest } from "./manifest";

interface ResolvedEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
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
          {event.allDay
            ? "All day"
            : `${formatTime(event.start)} · ${formatDuration(event.start, event.end)}`}
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

// ── Settings: manage ICS subscriptions ───────────────────────────────────────

interface Subscription {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

interface SourceStatus {
  id: string;
  eventCount: number;
  error?: string;
}

interface ValidateResult {
  ok: boolean;
  eventCount?: number;
  suggestedName?: string;
  error?: string;
}

const PALETTE = [
  "#10b981", "#6366f1", "#ec4899", "#f59e0b",
  "#3b82f6", "#ef4444", "#14b8a6", "#a855f7",
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function CalendarSettings({ onClose }: SettingsProps) {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [status, setStatus] = useState<Record<string, SourceStatus>>({});
  const [saving, setSaving] = useState(false);

  // Add-form state
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ValidateResult | null>(null);

  useEffect(() => {
    fetch("/api/m/calendar-google/config")
      .then((r) => r.json() as Promise<{ subscriptions?: Subscription[] }>)
      .then((c) => setSubs(c.subscriptions ?? []))
      .catch(() => setSubs([]));
    fetch("/api/m/calendar-google/sources")
      .then((r) => r.json() as Promise<SourceStatus[]>)
      .then((rows) => setStatus(Object.fromEntries(rows.map((s) => [s.id, s]))))
      .catch(() => {});
  }, []);

  function patch(id: string, fields: Partial<Subscription>) {
    setSubs((prev) => prev?.map((s) => (s.id === id ? { ...s, ...fields } : s)) ?? null);
  }

  function remove(id: string) {
    setSubs((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }

  async function test() {
    if (!url.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/m/calendar-google/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const result = (await res.json()) as ValidateResult;
      setTestResult(result);
      if (result.ok && result.suggestedName && !name.trim()) setName(result.suggestedName);
    } catch {
      setTestResult({ ok: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  function add() {
    if (!url.trim() || !subs) return;
    const color = PALETTE[subs.length % PALETTE.length]!;
    const sub: Subscription = {
      id: newId(),
      name: name.trim() || "Calendar",
      url: url.trim(),
      color,
      enabled: true,
    };
    setSubs([...subs, sub]);
    setUrl("");
    setName("");
    setTestResult(null);
  }

  async function save() {
    if (!subs) return;
    setSaving(true);
    await fetch("/api/m/calendar-google/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptions: subs }),
    });
    setSaving(false);
    onClose();
  }

  if (!subs) {
    return (
      <div className="grid place-items-center py-8">
        <span className="loading loading-spinner text-base-content/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="panel-label mb-2">Calendar subscriptions</div>
        {subs.length === 0 ? (
          <p className="font-serif italic text-xs text-base-content/45">
            No calendars yet. Paste an iCalendar (.ics) link below — e.g. Google
            Calendar → Settings → “Secret address in iCal format”.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {subs.map((s) => {
              const st = status[s.id];
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2.5 rounded-lg border border-base-content/10 bg-base-content/[0.03] p-2.5"
                >
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => patch(s.id, { color: e.target.value })}
                    className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label={`${s.name} colour`}
                  />
                  <div className="min-w-0 flex-1">
                    <input
                      value={s.name}
                      onChange={(e) => patch(s.id, { name: e.target.value })}
                      className="input input-xs w-full bg-base-content/5 border-base-content/10 font-sans"
                    />
                    <div className="mt-0.5 truncate font-mono text-[10px] text-base-content/35">
                      {st?.error ? (
                        <span className="text-error/70">⚠ {st.error}</span>
                      ) : (
                        <>
                          {st ? `${st.eventCount} events · ` : ""}
                          {s.url}
                        </>
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={s.enabled}
                    onChange={(e) => patch(s.id, { enabled: e.target.checked })}
                    aria-label={`${s.name} enabled`}
                  />
                  <button
                    onClick={() => remove(s.id)}
                    aria-label={`Remove ${s.name}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-base-content/40 hover:bg-error/10 hover:text-error"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new */}
      <div className="flex flex-col gap-2 border-t border-base-content/10 pt-4">
        <div className="panel-label">Add a calendar</div>
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTestResult(null);
          }}
          placeholder="https://…/basic.ics  or  webcal://…"
          className="input input-sm w-full bg-base-content/5 border-base-content/10 font-mono text-xs"
        />
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="input input-sm flex-1 bg-base-content/5 border-base-content/10"
          />
          <button
            onClick={() => void test()}
            disabled={!url.trim() || testing}
            className="btn btn-sm btn-ghost"
          >
            {testing ? "Testing…" : "Test"}
          </button>
          <button
            onClick={add}
            disabled={!url.trim()}
            className="btn btn-sm btn-primary"
          >
            Add
          </button>
        </div>
        {testResult && (
          <p
            className={`font-serif italic text-xs ${
              testResult.ok ? "text-success/80" : "text-error/80"
            }`}
          >
            {testResult.ok
              ? `✓ Reachable — ${testResult.eventCount ?? 0} events${
                  testResult.suggestedName ? ` · “${testResult.suggestedName}”` : ""
                }`
              : `✕ ${testResult.error ?? "Could not read this feed"}`}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-base-content/10 pt-3">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default defineModule({ manifest, Panel: CalendarPanel, Settings: CalendarSettings });
