import { useEffect, useState, type ReactNode } from "react";
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

// ── Shared Google types (mirror backend google.ts) ───────────────────────────

interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  primary?: boolean;
  writable?: boolean;
}

interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  calendars: GoogleCalendar[];
}

interface WriteTarget {
  accountId: string;
  calendarId: string;
}

interface OAuthStatus {
  configured: boolean;
  redirectUri: string;
  accounts: GoogleAccount[];
  writeTarget: WriteTarget | null;
}

interface WritableCalendar {
  accountId: string;
  id: string;
  name: string;
}

function writableCalendars(accounts: GoogleAccount[]): WritableCalendar[] {
  return accounts.flatMap((a) =>
    a.calendars
      .filter((c) => c.enabled && c.writable)
      .map((c) => ({ accountId: a.id, id: c.id, name: c.name })),
  );
}

// ── Lightweight modal (module-local; the shell's modal isn't importable here) ─

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="panel relative z-[1] flex max-h-[85vh] w-[min(420px,96vw)] flex-col overflow-hidden p-0 shadow-[0_40px_80px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center gap-3 border-b border-base-content/10 bg-primary/[0.06] p-4">
          <div className="flex-1 font-sans text-sm font-semibold text-base-content">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg border border-base-content/10 bg-base-content/5 text-base-content/60 hover:text-base-content"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ── Add-event form (basic: title + date + start/end, optional calendar) ───────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function defaultDateTime(): { date: string; start: string; end: string } {
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
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

function AddEventModal({
  cals,
  writeTarget,
  onClose,
  onCreated,
}: {
  cals: WritableCalendar[];
  writeTarget: WriteTarget | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const init = defaultDateTime();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [calendarId, setCalendarId] = useState(writeTarget?.calendarId ?? cals[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/m/calendar-google/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: title.trim(),
          start: toIso(date, start),
          end: toIso(date, end),
          ...(calendarId ? { calendarId } : {}),
        }),
      });
      const result = (await res.json()) as { ok: boolean; message?: string };
      if (!result.ok) {
        setError(result.message ?? "Could not create the event.");
        setSaving(false);
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError("Network error.");
      setSaving(false);
    }
  }

  return (
    <Modal title="New event" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="panel-label">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dentist, dinner with Sam…"
            className="input input-sm bg-base-content/5 border-base-content/10"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="panel-label">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input input-sm bg-base-content/5 border-base-content/10"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="panel-label">Start</span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="input input-sm bg-base-content/5 border-base-content/10"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="panel-label">End</span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="input input-sm bg-base-content/5 border-base-content/10"
            />
          </label>
        </div>
        {cals.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="panel-label">Calendar</span>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="select select-sm bg-base-content/5 border-base-content/10"
            >
              {cals.map((c) => (
                <option key={`${c.accountId}:${c.id}`} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="font-serif italic text-xs text-error/80">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Add event"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CalendarPanel(_props: PanelProps) {
  const [events, setEvents] = useState<ResolvedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cals, setCals] = useState<WritableCalendar[]>([]);
  const [writeTarget, setWriteTarget] = useState<WriteTarget | null>(null);
  const [adding, setAdding] = useState(false);

  function loadEvents() {
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
  }

  useEffect(() => {
    loadEvents();
    // Learn whether we can write (any enabled+writable Google calendar).
    fetch("/api/m/calendar-google/oauth/status")
      .then((r) => r.json() as Promise<OAuthStatus>)
      .then((s) => {
        setCals(writableCalendars(s.accounts));
        setWriteTarget(s.writeTarget);
      })
      .catch(() => {});
  }, []);

  const groups = groupByDay(events);
  const canWrite = cals.length > 0;

  return (
    <div className="flex flex-col gap-3.5 h-full overflow-hidden p-1">
      <div className="flex shrink-0 items-center justify-between">
        <span className="panel-label">Calendar</span>
        {canWrite && (
          <button
            onClick={() => setAdding(true)}
            aria-label="New event"
            className="grid h-6 w-6 place-items-center rounded-lg text-base-content/45 hover:bg-base-content/10 hover:text-base-content/80"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

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

      {adding && (
        <AddEventModal
          cals={cals}
          writeTarget={writeTarget}
          onClose={() => setAdding(false)}
          onCreated={loadEvents}
        />
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

      <GoogleSettings />

      <div className="flex justify-end gap-2 border-t border-base-content/10 pt-3">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save subscriptions"}
        </button>
      </div>
    </div>
  );
}

// ── Settings: Google accounts (OAuth) ─────────────────────────────────────────

function GoogleSettings() {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingClient, setSavingClient] = useState(false);
  const [savingCals, setSavingCals] = useState(false);
  const [copied, setCopied] = useState(false);

  function load() {
    fetch("/api/m/calendar-google/oauth/status")
      .then((r) => r.json() as Promise<OAuthStatus>)
      .then(setStatus)
      .catch(() => {});
  }

  useEffect(load, []);

  async function saveClient() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSavingClient(true);
    await fetch("/api/m/calendar-google/oauth/client", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
    });
    setSavingClient(false);
    setClientId("");
    setClientSecret("");
    load();
  }

  function connect() {
    const popup = window.open(
      "/api/m/calendar-google/oauth/start",
      "google-oauth",
      "width=520,height=640",
    );
    // The popup closes itself on success; refresh once it's gone.
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        load();
      }
    }, 800);
  }

  function patchCal(accountId: string, calId: string, fields: Partial<GoogleCalendar>) {
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            accounts: prev.accounts.map((a) =>
              a.id === accountId
                ? { ...a, calendars: a.calendars.map((c) => (c.id === calId ? { ...c, ...fields } : c)) }
                : a,
            ),
          }
        : prev,
    );
  }

  function setWriteTarget(target: WriteTarget | null) {
    setStatus((prev) => (prev ? { ...prev, writeTarget: target } : prev));
  }

  async function saveCalendars() {
    if (!status) return;
    setSavingCals(true);
    await fetch("/api/m/calendar-google/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: status.accounts, writeTarget: status.writeTarget }),
    });
    setSavingCals(false);
    load();
  }

  async function disconnect(id: string) {
    await fetch(`/api/m/calendar-google/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  if (!status) return null;

  const writable = status ? writableCalendars(status.accounts) : [];

  return (
    <div className="flex flex-col gap-3 border-t border-base-content/10 pt-4">
      <div className="panel-label">Google accounts</div>

      {!status.configured ? (
        <div className="flex flex-col gap-2">
          <p className="font-serif italic text-xs text-base-content/45">
            Create one “Web application” OAuth client in Google Cloud (shared by all Google
            modules). Set <code className="font-mono">GOOGLE_CLIENT_ID</code> /{" "}
            <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in <code className="font-mono">.env</code>{" "}
            and restart — or paste them below. Either way, register this exact redirect URI:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-base-content/5 px-2 py-1 font-mono text-[10px] text-base-content/70">
              {status.redirectUri}
            </code>
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(status.redirectUri);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client ID"
            className="input input-sm bg-base-content/5 border-base-content/10 font-mono text-xs"
          />
          <input
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Client secret"
            type="password"
            className="input input-sm bg-base-content/5 border-base-content/10 font-mono text-xs"
          />
          <button
            className="btn btn-sm btn-primary self-start"
            onClick={() => void saveClient()}
            disabled={!clientId.trim() || !clientSecret.trim() || savingClient}
          >
            {savingClient ? "Saving…" : "Save client"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {status.accounts.length === 0 ? (
            <p className="font-serif italic text-xs text-base-content/45">
              Client configured. Connect an account to choose calendars.
            </p>
          ) : (
            status.accounts.map((acct) => (
              <div
                key={acct.id}
                className="flex flex-col gap-1.5 rounded-lg border border-base-content/10 bg-base-content/[0.03] p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-sans text-xs font-semibold text-base-content">
                    {acct.email}
                  </span>
                  <button
                    onClick={() => void disconnect(acct.id)}
                    className="text-[11px] text-base-content/40 hover:text-error"
                  >
                    Disconnect
                  </button>
                </div>
                {acct.calendars.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 pl-1">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={c.enabled}
                      onChange={(e) => patchCal(acct.id, c.id, { enabled: e.target.checked })}
                    />
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => patchCal(acct.id, c.id, { color: e.target.value })}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={`${c.name} colour`}
                    />
                    <span className="min-w-0 flex-1 truncate font-sans text-xs text-base-content/80">
                      {c.name}
                      {!c.writable && (
                        <span className="ml-1 text-[10px] text-base-content/35">(read-only)</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ))
          )}

          <div className="flex items-center gap-2">
            <button className="btn btn-sm btn-ghost" onClick={connect}>
              + Connect account
            </button>
            {status.accounts.length > 0 && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => void saveCalendars()}
                disabled={savingCals}
              >
                {savingCals ? "Saving…" : "Save calendars"}
              </button>
            )}
          </div>

          {writable.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="panel-label">New events go to</span>
              <select
                value={status.writeTarget?.calendarId ?? ""}
                onChange={(e) => {
                  const cal = writable.find((w) => w.id === e.target.value);
                  setWriteTarget(cal ? { accountId: cal.accountId, calendarId: cal.id } : null);
                }}
                className="select select-sm bg-base-content/5 border-base-content/10"
              >
                <option value="">— none —</option>
                {writable.map((w) => (
                  <option key={`${w.accountId}:${w.id}`} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default defineModule({ manifest, Panel: CalendarPanel, Settings: CalendarSettings });
