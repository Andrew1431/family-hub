import ical from "node-ical";
import type { VEvent } from "node-ical";
import { defineBackend } from "@hub/sdk";

/*
 * Phase 2 — ICS subscriptions (read-only).
 *
 * A subscription is any iCalendar feed URL: Google's "secret address in iCal
 * format", an Outlook/work published calendar, a sports schedule, etc. Each is
 * fetched, parsed (node-ical handles folding, VTIMEZONE, RRULE), merged into a
 * single sorted stream, and tagged with the subscription's name + colour so the
 * panel can show "whose" calendar each event belongs to.
 *
 * Writing events (calendar_add_event) needs a Google OAuth account — that lands
 * in Phase 3. Until then the add capability reports that it isn't connected yet.
 */

interface IcsSubscription {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

interface ResolvedEvent {
  id: string;
  summary: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  calendarId: string; // subscription id
  calendarName: string;
  color: string;
  location?: string;
}

const DEFAULT_COLOR = "#8b5cf6";
const DEFAULT_WINDOW_DAYS = 21;
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;

// ── Timezone math (Intl-only, no moment) ─────────────────────────────────────
// node-ical returns RRULE occurrences as wall-clock times labelled UTC (a 9am
// event comes back as 09:00Z regardless of zone). To get the true instant we
// re-interpret those wall-clock components in the event's IANA zone, which also
// gets DST transitions right.

function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const f: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") f[p.type] = p.value;
  }
  const asUtc = Date.UTC(+f.year!, +f.month! - 1, +f.day!, +f.hour!, +f.minute!, +f.second!);
  return asUtc - utcMs;
}

/** Interpret wall-clock components as a time in `tz`, returning UTC ms. */
function wallToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes settles the offset across a DST boundary (the guess and the
  // corrected time can sit on opposite sides of a transition).
  const pass1 = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(pass1, tz);
}

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

// ── ICS fetch + parse ────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; text: string }>();

async function fetchIcs(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text;

  const httpUrl = url.replace(/^webcal:\/\//i, "https://");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(httpUrl, {
      signal: ctrl.signal,
      headers: { Accept: "text/calendar, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    cache.set(url, { at: Date.now(), text });
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function makeEvent(
  sub: IcsSubscription,
  uidSuffix: string,
  summary: string,
  startMs: number,
  endMs: number,
  allDay: boolean,
  location?: string,
): ResolvedEvent {
  return {
    id: `${sub.id}:${uidSuffix}`,
    summary: summary || "(no title)",
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    allDay,
    calendarId: sub.id,
    calendarName: sub.name,
    color: sub.color || DEFAULT_COLOR,
    ...(location ? { location } : {}),
  };
}

/** Expand one feed's VEVENTs (including recurrences) into the [from,to] window. */
function expandFeed(
  sub: IcsSubscription,
  text: string,
  fromMs: number,
  toMs: number,
): ResolvedEvent[] {
  const data = ical.sync.parseICS(text);
  const out: ResolvedEvent[] = [];

  for (const key of Object.keys(data)) {
    const comp = data[key];
    if (!comp || comp.type !== "VEVENT") continue;
    const ev = comp as VEvent;

    const start = ev.start as Date | undefined;
    if (!start) continue;
    const end = (ev.end as Date | undefined) ?? new Date(start.getTime() + 3_600_000);
    const allDay = ev.datetype === "date";
    const durationMs = Math.max(0, end.getTime() - start.getTime());
    const summary = String(ev.summary ?? "");
    const location = ev.location ? String(ev.location) : undefined;

    if (!ev.rrule) {
      if (end.getTime() >= fromMs && start.getTime() <= toMs) {
        out.push(makeEvent(sub, ev.uid ?? key, summary, start.getTime(), end.getTime(), allDay, location));
      }
      continue;
    }

    // Recurring: rrule occurrences are wall-clock-as-UTC; correct each one.
    const tzid = ev.rrule.origOptions.tzid as string | undefined;
    const occurrences = ev.rrule.between(
      new Date(fromMs - durationMs),
      new Date(toMs),
      true,
    );
    for (const occ of occurrences) {
      const k = dateKey(occ);
      if (ev.exdate && ev.exdate[k]) continue; // cancelled instance

      // A modified instance (RECURRENCE-ID) overrides the rule's version.
      const override = ev.recurrences?.[k];
      if (override) {
        const os = override.start as Date;
        const oe = (override.end as Date | undefined) ?? new Date(os.getTime() + durationMs);
        if (oe.getTime() >= fromMs && os.getTime() <= toMs) {
          out.push(
            makeEvent(
              sub,
              `${ev.uid ?? key}:${k}`,
              String(override.summary ?? summary),
              os.getTime(),
              oe.getTime(),
              override.datetype === "date",
              override.location ? String(override.location) : location,
            ),
          );
        }
        continue;
      }

      const startMs = tzid
        ? wallToUtc(
            occ.getUTCFullYear(),
            occ.getUTCMonth() + 1,
            occ.getUTCDate(),
            occ.getUTCHours(),
            occ.getUTCMinutes(),
            occ.getUTCSeconds(),
            tzid,
          )
        : occ.getTime();
      const endMs = startMs + durationMs;
      if (endMs >= fromMs && startMs <= toMs) {
        out.push(makeEvent(sub, `${ev.uid ?? key}:${k}`, summary, startMs, endMs, allDay, location));
      }
    }
  }

  return out;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

async function getSubscriptions(
  config: { get<T>(k: string): Promise<T | undefined> },
): Promise<IcsSubscription[]> {
  const subs = (await config.get<IcsSubscription[]>("subscriptions")) ?? [];
  return Array.isArray(subs) ? subs : [];
}

interface FeedResult {
  sub: IcsSubscription;
  events: ResolvedEvent[];
  error?: string;
}

async function collectEvents(
  subs: IcsSubscription[],
  fromMs: number,
  toMs: number,
  log: { warn(m: string, meta?: unknown): void },
): Promise<FeedResult[]> {
  const enabled = subs.filter((s) => s.enabled && s.url);
  return Promise.all(
    enabled.map(async (sub) => {
      try {
        const text = await fetchIcs(sub.url);
        return { sub, events: expandFeed(sub, text, fromMs, toMs) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`calendar feed "${sub.name}" failed: ${message}`);
        return { sub, events: [], error: message };
      }
    }),
  );
}

function windowFrom(query: { from?: string; to?: string }): { fromMs: number; toMs: number } {
  const fromMs = query.from ? new Date(query.from).getTime() : Date.now();
  const toMs = query.to
    ? new Date(query.to).getTime()
    : fromMs + DEFAULT_WINDOW_DAYS * 86_400_000;
  return { fromMs, toMs };
}

// ── Backend ──────────────────────────────────────────────────────────────────

export default defineBackend((ctx) => {
  async function listEvents(query: { from?: string; to?: string }): Promise<ResolvedEvent[]> {
    const subs = await getSubscriptions(ctx.config);
    const { fromMs, toMs } = windowFrom(query);
    const results = await collectEvents(subs, fromMs, toMs, ctx.log);
    return results
      .flatMap((r) => r.events)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  ctx.capabilities.register({
    name: "calendar_list_events",
    description:
      "List upcoming family calendar events from all subscribed calendars, " +
      "optionally filtered by date range. Each event includes which calendar " +
      "it came from.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO 8601 start bound (inclusive). Defaults to now." },
        to: { type: "string", description: "ISO 8601 end bound (inclusive). Defaults to ~3 weeks out." },
      },
      additionalProperties: false,
    },
    annotations: { readOnly: true },
    handler: (input: { from?: string; to?: string }) => listEvents(input),
  });

  ctx.capabilities.register({
    name: "calendar_add_event",
    description:
      "Add an event to the family calendar. Requires a connected Google " +
      "account with write access.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title." },
        start: { type: "string", description: "ISO 8601 start dateTime." },
        end: { type: "string", description: "ISO 8601 end dateTime. Defaults to 1 hour after start." },
      },
      required: ["summary", "start"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    // ICS feeds are read-only; writing needs the Phase 3 OAuth account.
    handler: () => ({
      ok: false,
      message:
        "I can't add events yet — connect a Google account in the calendar " +
        "settings to enable writing. ICS subscriptions are read-only.",
    }),
  });

  // Merged event stream for the panel.
  ctx.route("GET", "/events", (args) => listEvents(args.query as { from?: string; to?: string }));

  // Live status for the settings UI: per-subscription event count + any error.
  ctx.route("GET", "/sources", async () => {
    const subs = await getSubscriptions(ctx.config);
    const { fromMs, toMs } = windowFrom({});
    const results = await collectEvents(subs, fromMs, toMs, ctx.log);
    const byId = new Map(results.map((r) => [r.sub.id, r]));
    return subs.map((s) => {
      const r = byId.get(s.id);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        enabled: s.enabled,
        url: s.url,
        eventCount: r?.events.length ?? 0,
        error: r?.error,
      };
    });
  });

  // Probe a URL before saving it: validates reachability and suggests a name
  // from the feed's X-WR-CALNAME. Never persists anything.
  ctx.route("POST", "/validate", async ({ body }) => {
    const url = (body as { url?: string } | undefined)?.url?.trim();
    if (!url) return { ok: false, error: "No URL provided." };
    try {
      const text = await fetchIcs(url);
      const data = ical.sync.parseICS(text);
      const count = Object.values(data).filter((c) => c?.type === "VEVENT").length;
      const nameMatch = /^X-WR-CALNAME:(.+)$/im.exec(text);
      return {
        ok: true,
        eventCount: count,
        suggestedName: nameMatch?.[1]?.trim() ?? "",
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ctx.log.info("calendar-google backend ready (ICS subscriptions)");
});
