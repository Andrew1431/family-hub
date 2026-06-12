/*
 * Google Calendar over raw REST (no googleapis dep, matching the ICS path).
 *
 * Auth/token plumbing (creds, the OAuth flow, the access-token cache) lives in
 * the shared `@hub/google` package; this file is the Calendar REST surface only.
 * Scopes are deliberately lean: read/write events + read the calendar list.
 */

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

const API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_COLOR = "#6366f1";

// ── Shared event shape (also used by the ICS path) ───────────────────────────

export interface ResolvedEvent {
  id: string;
  summary: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  calendarId: string;
  calendarName: string;
  color: string;
  location?: string;
}

/** A calendar the user can choose to show, as stored in config (non-secret). */
export interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  primary?: boolean;
  /** Whether the account can create events here (owner/writer access). */
  writable?: boolean;
}

/** A connected Google account, as stored in config (non-secret). */
export interface GoogleAccount {
  id: string; // the account's primary email
  email: string;
  name: string;
  calendars: GoogleCalendar[];
}

// ── Calendar REST ────────────────────────────────────────────────────────────

interface RawCalListItem {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string; // owner | writer | reader | freeBusyReader
}

/** Enumerate the account's calendars (for the settings picker). */
export async function fetchCalendarList(accessToken: string): Promise<GoogleCalendar[]> {
  const res = await fetch(`${API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`calendarList failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { items?: RawCalListItem[] };
  return (j.items ?? []).map((it) => ({
    id: it.id,
    name: it.summaryOverride ?? it.summary,
    color: it.backgroundColor ?? DEFAULT_COLOR,
    enabled: false,
    primary: Boolean(it.primary),
    writable: it.accessRole === "owner" || it.accessRole === "writer",
  }));
}

interface RawGEvent {
  id: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** YYYY-MM-DD (all-day) → ISO at the host's local midnight, so it lands on the
 *  right calendar day when grouped in local time (matches the ICS path). */
function localMidnightIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toISOString();
}

function mapGEvent(it: RawGEvent, cal: GoogleCalendar): ResolvedEvent | null {
  if (it.status === "cancelled") return null;
  const allDay = Boolean(it.start?.date);
  const startRaw = it.start?.dateTime ?? it.start?.date;
  const endRaw = it.end?.dateTime ?? it.end?.date;
  if (!startRaw) return null;
  const start = allDay ? localMidnightIso(startRaw) : new Date(startRaw).toISOString();
  const end = endRaw
    ? allDay
      ? localMidnightIso(endRaw)
      : new Date(endRaw).toISOString()
    : new Date(new Date(start).getTime() + 3_600_000).toISOString();
  return {
    id: `${cal.id}:${it.id}`,
    summary: it.summary || "(no title)",
    start,
    end,
    allDay,
    calendarId: cal.id,
    calendarName: cal.name,
    color: cal.color,
    ...(it.location ? { location: it.location } : {}),
  };
}

/** Fetch + map events from one calendar in the window. `singleEvents=true`
 *  makes Google expand recurrences server-side, so we never touch RRULEs here. */
export async function fetchEvents(
  accessToken: string,
  cal: GoogleCalendar,
  fromIso: string,
  toIso: string,
): Promise<ResolvedEvent[]> {
  const p = new URLSearchParams({
    timeMin: fromIso,
    timeMax: toIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(`${API}/calendars/${encodeURIComponent(cal.id)}/events?${p.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`events failed for ${cal.name}: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { items?: RawGEvent[] };
  return (j.items ?? [])
    .map((it) => mapGEvent(it, cal))
    .filter((e): e is ResolvedEvent => e !== null);
}

/** Create a timed event. Basic by design: title + start + end only. */
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  ev: { summary: string; start: string; end: string },
): Promise<{ id: string; htmlLink?: string }> {
  const res = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: ev.summary,
      start: { dateTime: new Date(ev.start).toISOString() },
      end: { dateTime: new Date(ev.end).toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; htmlLink?: string };
}
