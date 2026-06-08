import ical from "node-ical";
import type { VEvent } from "node-ical";
import { defineBackend, html, redirect, type KVStore } from "@hub/sdk";
import {
  accessTokenFor,
  authUrl,
  clearTokenCache,
  exchangeCode,
  fetchCalendarList,
  fetchEvents,
  getCreds,
  insertEvent,
  revokeToken,
  type GoogleAccount,
  type GoogleCalendar,
  type ResolvedEvent,
} from "./google";

/*
 * Calendar module — two read sources, one write target.
 *
 *  • ICS subscriptions (Phase 2): any iCalendar feed URL, read-only. node-ical
 *    handles folding / VTIMEZONE / RRULE; tagged with name + colour.
 *  • Google accounts (Phase 3): OAuth-connected calendars, read AND write.
 *    Google expands recurrences server-side, so the REST path is simple.
 *
 * `/events` merges both into one sorted stream. Event creation (a deliberately
 * basic title + start + end) writes to the configured Google "write target".
 */

interface IcsSubscription {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

interface WriteTarget {
  accountId: string;
  calendarId: string;
}

const DEFAULT_COLOR = "#8b5cf6";
const DEFAULT_REDIRECT_BASE = "http://localhost:4000";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
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

// ── Google accounts (config is non-secret; tokens live in secrets) ───────────

async function getAccounts(config: KVStore): Promise<GoogleAccount[]> {
  const a = await config.get<GoogleAccount[]>("accounts");
  return Array.isArray(a) ? a : [];
}

async function getWriteTarget(config: KVStore): Promise<WriteTarget | null> {
  const w = await config.get<WriteTarget>("writeTarget");
  return w && w.accountId && w.calendarId ? w : null;
}

function redirectUriFrom(base: string | undefined): string {
  return `${(base ?? DEFAULT_REDIRECT_BASE).replace(/\/$/, "")}/api/m/calendar-google/oauth/callback`;
}

async function collectGoogleEvents(
  accounts: GoogleAccount[],
  secrets: KVStore,
  fromIso: string,
  toIso: string,
  log: { warn(m: string, meta?: unknown): void },
): Promise<ResolvedEvent[]> {
  const out: ResolvedEvent[] = [];
  for (const account of accounts) {
    const enabledCals = account.calendars.filter((c) => c.enabled);
    if (enabledCals.length === 0) continue;
    let accessToken: string;
    try {
      accessToken = await accessTokenFor(secrets, account.id);
    } catch (err) {
      log.warn(`google account "${account.email}" auth failed: ${String(err)}`);
      continue; // skip this account; reconnect surfaces in settings status
    }
    const perCal = await Promise.all(
      enabledCals.map(async (cal: GoogleCalendar) => {
        try {
          return await fetchEvents(accessToken, cal, fromIso, toIso);
        } catch (err) {
          log.warn(`google calendar "${cal.name}" failed: ${String(err)}`);
          return [] as ResolvedEvent[];
        }
      }),
    );
    for (const list of perCal) out.push(...list);
  }
  return out;
}

// ── OAuth CSRF state (in-memory; single process) ─────────────────────────────

const oauthStates = new Map<string, number>();

function newState(): string {
  const s = crypto.randomUUID();
  oauthStates.set(s, Date.now());
  return s;
}

function consumeState(state: string): boolean {
  const at = oauthStates.get(state);
  if (at === undefined) return false;
  oauthStates.delete(state);
  return Date.now() - at < OAUTH_STATE_TTL_MS;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** The page shown in the OAuth popup; closes itself on success. */
function oauthPage(message: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Family Hub</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1210;color:#f0e6dd;display:grid;place-items:center;height:100vh;margin:0}
.card{max-width:420px;text-align:center;padding:2rem}.ico{font-size:3rem}.msg{margin-top:1rem;line-height:1.5;color:#cbb7ad}</style></head>
<body><div class="card"><div class="ico">${ok ? "✅" : "⚠️"}</div><div class="msg">${escapeHtml(message)}</div></div>
<script>setTimeout(function(){window.close()}, ${ok ? 1500 : 6000})</script></body></html>`;
}

// ── Backend ──────────────────────────────────────────────────────────────────

export default defineBackend((ctx) => {
  async function listEvents(query: { from?: string; to?: string }): Promise<ResolvedEvent[]> {
    const { fromMs, toMs } = windowFrom(query);
    const subs = await getSubscriptions(ctx.config);
    const accounts = await getAccounts(ctx.config);
    const [icsResults, googleEvents] = await Promise.all([
      collectEvents(subs, fromMs, toMs, ctx.log),
      collectGoogleEvents(
        accounts,
        ctx.secrets,
        new Date(fromMs).toISOString(),
        new Date(toMs).toISOString(),
        ctx.log,
      ),
    ]);
    return [...icsResults.flatMap((r) => r.events), ...googleEvents].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }

  // Create a basic event (title + start + end) on the chosen calendar, or the
  // configured write target. Returns {ok:false,message} rather than throwing so
  // the assistant can relay a friendly reason.
  async function createEvent(input: {
    summary: string;
    start: string;
    end?: string;
    calendarId?: string;
  }): Promise<{ ok: boolean; id?: string; htmlLink?: string; message?: string }> {
    const accounts = await getAccounts(ctx.config);
    let target: WriteTarget | null = null;
    if (input.calendarId) {
      const acct = accounts.find((a) => a.calendars.some((c) => c.id === input.calendarId));
      if (acct) target = { accountId: acct.id, calendarId: input.calendarId };
    }
    target ??= await getWriteTarget(ctx.config);
    if (!target) {
      return {
        ok: false,
        message:
          "No writable calendar is connected. Connect a Google account and pick " +
          "a write target in calendar settings first.",
      };
    }
    const end =
      input.end ?? new Date(new Date(input.start).getTime() + 3_600_000).toISOString();
    const accessToken = await accessTokenFor(ctx.secrets, target.accountId);
    const created = await insertEvent(accessToken, target.calendarId, {
      summary: input.summary,
      start: input.start,
      end,
    });
    return { ok: true, id: created.id, ...(created.htmlLink ? { htmlLink: created.htmlLink } : {}) };
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
      "Add a basic event (title, start, end) to the family calendar's write " +
      "target. For one-off events only — no recurrence.",
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
    handler: async (input: { summary: string; start: string; end?: string }) => {
      try {
        return await createEvent(input);
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
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

  // ── Google OAuth + account management ──────────────────────────────────────

  // Snapshot for the settings UI: whether the client is configured, the exact
  // redirect URI to register in Google Cloud, connected accounts (non-secret),
  // and the current write target.
  ctx.route("GET", "/oauth/status", async () => {
    const creds = await getCreds(ctx.secrets);
    const redirectBase = await ctx.config.get<string>("redirectBase");
    return {
      configured: Boolean(creds),
      redirectUri: redirectUriFrom(redirectBase),
      accounts: await getAccounts(ctx.config),
      writeTarget: await getWriteTarget(ctx.config),
    };
  });

  // Store the per-deployment OAuth client (write-only; never read back to UI).
  ctx.route("PUT", "/oauth/client", async ({ body }) => {
    const b = body as { clientId?: string; clientSecret?: string } | undefined;
    const clientId = b?.clientId?.trim();
    const clientSecret = b?.clientSecret?.trim();
    if (!clientId || !clientSecret) {
      return { ok: false, error: "clientId and clientSecret are required" };
    }
    await ctx.secrets.set("clientId", clientId);
    await ctx.secrets.set("clientSecret", clientSecret);
    return { ok: true };
  });

  // Kick off consent: open this URL in a popup; it 302s to Google.
  ctx.route("GET", "/oauth/start", async () => {
    const creds = await getCreds(ctx.secrets);
    if (!creds) {
      return html(
        oauthPage("Add your Google Client ID and Secret in calendar settings first.", false),
      );
    }
    const redirectBase = await ctx.config.get<string>("redirectBase");
    return redirect(authUrl(creds, redirectUriFrom(redirectBase), newState()));
  });

  // Google redirects back here with ?code&state. We exchange, identify the
  // account via its primary calendar, store the refresh token, and snapshot
  // the calendar list.
  ctx.route("GET", "/oauth/callback", async ({ query }) => {
    const q = query as { code?: string; state?: string; error?: string };
    if (q.error) return html(oauthPage(`Google sign-in was cancelled (${q.error}).`, false));
    if (!q.code || !q.state || !consumeState(q.state)) {
      return html(oauthPage("Invalid or expired sign-in attempt. Please try again.", false));
    }
    try {
      const creds = await getCreds(ctx.secrets);
      if (!creds) return html(oauthPage("Google client isn't configured.", false));
      const redirectBase = await ctx.config.get<string>("redirectBase");
      const tokens = await exchangeCode(creds, redirectUriFrom(redirectBase), q.code);

      const calendars = await fetchCalendarList(tokens.accessToken);
      const primary = calendars.find((c) => c.primary);
      const accountId = primary?.id ?? "unknown";

      if (tokens.refreshToken) {
        await ctx.secrets.set(`refresh:${accountId}`, tokens.refreshToken);
      } else if (!(await ctx.secrets.get<string>(`refresh:${accountId}`))) {
        return html(
          oauthPage(
            "Google didn't return a refresh token. Remove Family Hub at " +
              "myaccount.google.com/permissions, then reconnect.",
            false,
          ),
        );
      }

      // Preserve prior enable/colour choices; default the primary calendar on.
      const accounts = await getAccounts(ctx.config);
      const prior = accounts.find((a) => a.id === accountId);
      const mergedCalendars: GoogleCalendar[] = calendars.map((c) => {
        const pc = prior?.calendars.find((x) => x.id === c.id);
        if (pc) return { ...c, enabled: pc.enabled, color: pc.color };
        return c.primary ? { ...c, enabled: true } : c;
      });
      const account: GoogleAccount = {
        id: accountId,
        email: accountId,
        name: primary?.name ?? accountId,
        calendars: mergedCalendars,
      };
      const next = prior
        ? accounts.map((a) => (a.id === accountId ? account : a))
        : [...accounts, account];
      await ctx.config.set("accounts", next);

      if (!(await getWriteTarget(ctx.config)) && primary?.writable) {
        await ctx.config.set("writeTarget", { accountId, calendarId: primary.id });
      }
      clearTokenCache(accountId);
      return html(oauthPage(`Connected ${accountId}. You can close this window.`, true));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.log.warn(`oauth callback failed: ${message}`);
      return html(oauthPage(`Sign-in failed: ${message}`, false));
    }
  });

  // Persist calendar enable/colour choices + write target from the settings UI.
  ctx.route("PUT", "/accounts", async ({ body }) => {
    const b = body as { accounts?: GoogleAccount[]; writeTarget?: WriteTarget | null } | undefined;
    if (Array.isArray(b?.accounts)) await ctx.config.set("accounts", b.accounts);
    if (b && "writeTarget" in b) await ctx.config.set("writeTarget", b.writeTarget ?? null);
    return { ok: true };
  });

  // Disconnect: revoke the grant and drop all trace of the account.
  ctx.route("DELETE", "/accounts/:id", async ({ params }) => {
    const id = params.id;
    if (!id) return { ok: false, error: "missing account id" };
    const refresh = await ctx.secrets.get<string>(`refresh:${id}`);
    if (refresh) await revokeToken(refresh);
    await ctx.secrets.delete(`refresh:${id}`);
    clearTokenCache(id);
    const accounts = await getAccounts(ctx.config);
    await ctx.config.set(
      "accounts",
      accounts.filter((a) => a.id !== id),
    );
    const writeTarget = await getWriteTarget(ctx.config);
    if (writeTarget?.accountId === id) await ctx.config.set("writeTarget", null);
    return { ok: true };
  });

  // Create a basic event from the panel's "+" form.
  ctx.route("POST", "/create", async ({ body }) => {
    const b = body as
      | { summary?: string; start?: string; end?: string; calendarId?: string }
      | undefined;
    if (!b?.summary || !b.start) return { ok: false, message: "summary and start are required" };
    try {
      return await createEvent({
        summary: b.summary,
        start: b.start,
        ...(b.end ? { end: b.end } : {}),
        ...(b.calendarId ? { calendarId: b.calendarId } : {}),
      });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ctx.log.info("calendar-google backend ready (ICS + Google accounts)");
});
