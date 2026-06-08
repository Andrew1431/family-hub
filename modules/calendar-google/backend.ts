import { defineBackend } from "@hub/sdk";

/*
 * Real data source (wired later): Google Calendar API v3
 *
 * Calendars endpoint:
 *   GET https://www.googleapis.com/calendar/v3/users/me/calendarList
 *   Returns: items[].{ id, summary, backgroundColor, foregroundColor }
 *
 * Events endpoint:
 *   GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
 *   Query params: timeMin, timeMax, singleEvents=true, orderBy=startTime
 *   Returns: items[].{
 *     id, summary, colorId,
 *     start: { dateTime?: string, date?: string },  // dateTime = timed; date = all-day
 *     end:   { dateTime?: string, date?: string },
 *     location?, attendees?[].{ email, displayName }
 *   }
 *
 * "who" in the sample UI maps to the SOURCE CALENDAR (e.g. "Family", "Mom", "Dad").
 * Color comes from calendarList[].backgroundColor (or event.colorId override).
 */

interface Calendar {
  id: string;
  name: string;
  color: string;
}

interface EventRecord {
  id: string;
  summary: string;
  start: string; // ISO dateTime
  end: string;   // ISO dateTime
  calendarId: string;
  location?: string;
}

interface ResolvedEvent extends EventRecord {
  calendarName: string;
  color: string;
}

// ── Mock data shaped like parsed Google Calendar API results ─────────────────

const CALENDARS: Calendar[] = [
  { id: "family",  name: "Family", color: "#10b981" },
  { id: "mom",     name: "Mom",    color: "#ec4899" },
  { id: "dad",     name: "Dad",    color: "#6366f1" },
  { id: "emma",    name: "Emma",   color: "#f59e0b" },
  { id: "jake",    name: "Jake",   color: "#3b82f6" },
];

function daysFromNow(n: number, h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

let events: EventRecord[] = [
  {
    id: "ev-1",
    summary: "Emma's Soccer Practice",
    start: daysFromNow(0, 15, 30),
    end:   daysFromNow(0, 17,  0),
    calendarId: "emma",
  },
  {
    id: "ev-2",
    summary: "Family Dinner — Grandma's",
    start: daysFromNow(0, 18, 0),
    end:   daysFromNow(0, 20, 0),
    calendarId: "family",
  },
  {
    id: "ev-3",
    summary: "Jake Piano Lesson",
    start: daysFromNow(1, 16, 0),
    end:   daysFromNow(1, 16, 45),
    calendarId: "jake",
  },
  {
    id: "ev-4",
    summary: "Parent-Teacher Conference",
    start: daysFromNow(3, 14, 0),
    end:   daysFromNow(3, 14, 30),
    calendarId: "mom",
  },
  {
    id: "ev-5",
    summary: "Movie Night",
    start: daysFromNow(4, 19, 0),
    end:   daysFromNow(4, 21, 0),
    calendarId: "family",
  },
  {
    id: "ev-6",
    summary: "Dad's Morning Run",
    start: daysFromNow(0, 7, 0),
    end:   daysFromNow(0, 7, 45),
    calendarId: "dad",
  },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

function calendarById(id: string): Calendar | undefined {
  return CALENDARS.find((c) => c.id === id);
}

function listEvents(from?: string, to?: string): ResolvedEvent[] {
  const fromMs = from ? new Date(from).getTime() : Date.now();
  const toMs   = to   ? new Date(to).getTime()   : Infinity;

  return events
    .filter((e) => {
      const t = new Date(e.start).getTime();
      return t >= fromMs && t <= toMs;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map((e) => {
      const cal = calendarById(e.calendarId);
      return {
        ...e,
        calendarName: cal?.name ?? e.calendarId,
        color: cal?.color ?? "#8b5cf6",
      };
    });
}

// ── Backend ───────────────────────────────────────────────────────────────────

export default defineBackend((ctx) => {
  ctx.capabilities.register({
    name: "calendar_list_events",
    description:
      "List upcoming calendar events, optionally filtered by date range. " +
      "Each event includes its source calendar name and color.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO 8601 start bound (inclusive). Defaults to now." },
        to:   { type: "string", description: "ISO 8601 end bound (inclusive). Omit for no upper limit." },
      },
      additionalProperties: false,
    },
    annotations: { readOnly: true },
    handler: (input: { from?: string; to?: string }) =>
      listEvents(input.from, input.to),
  });

  ctx.capabilities.register({
    name: "calendar_add_event",
    description:
      "Add an event to the family calendar. " +
      "calendarId should match one of: family, mom, dad, emma, jake.",
    inputSchema: {
      type: "object",
      properties: {
        summary:    { type: "string", description: "Event title." },
        start:      { type: "string", description: "ISO 8601 start dateTime." },
        end:        { type: "string", description: "ISO 8601 end dateTime. Defaults to 1 hour after start." },
        calendarId: { type: "string", description: "Source calendar id (family|mom|dad|emma|jake)." },
      },
      required: ["summary", "start"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: (input: { summary: string; start: string; end?: string; calendarId?: string }) => {
      const end = input.end ?? new Date(new Date(input.start).getTime() + 3_600_000).toISOString();
      const record: EventRecord = {
        id: `ev-${Date.now()}`,
        summary: input.summary,
        start: input.start,
        end,
        calendarId: input.calendarId ?? "family",
      };
      events = [...events, record];
      const cal = calendarById(record.calendarId);
      return {
        ...record,
        calendarName: cal?.name ?? record.calendarId,
        color: cal?.color ?? "#8b5cf6",
      } satisfies ResolvedEvent;
    },
  });

  ctx.route("GET", "/events", (args) => {
    const q = args.query as { from?: string; to?: string };
    return listEvents(q.from, q.to);
  });

  ctx.log.info("calendar-google backend ready");
});
