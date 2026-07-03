import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PanelProps } from "@hub/sdk";
import {
  EmptyState,
  ErrorState,
  IconButton,
  IconPlus,
  Title,
  useModuleHotkeys,
} from "@hub/components";
import type { OAuthStatus, ResolvedEvent } from "./types";
import { API, writableCalendars } from "./types";
import { monthGridRange } from "./dates";
import { EventModal } from "./EventModal";
import { UpcomingList } from "./UpcomingList";
import { MonthGrid, MonthHeader } from "./MonthView";

export function CalendarPanel(props: PanelProps) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ResolvedEvent | null>(null);
  const view = props.settings.view === "month" ? "month" : "summary";
  // Anchor for month navigation: any date within the displayed month.
  const [anchor, setAnchor] = useState(() => new Date());
  const shiftMonth = (delta: number) =>
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));

  // Month view fetches its full visible grid; the summary view keeps the
  // server's default ~3-week window. Both share the ["calendar","events"]
  // prefix so settings/create invalidations refresh either.
  const range = view === "month" ? monthGridRange(anchor) : null;
  const eventsQuery = useQuery({
    queryKey:
      view === "month"
        ? ["calendar", "events", "month", anchor.getFullYear(), anchor.getMonth()]
        : ["calendar", "events"],
    queryFn: async (): Promise<ResolvedEvent[]> => {
      const qs = range ? `?from=${range.from.toISOString()}&to=${range.to.toISOString()}` : "";
      const r = await fetch(`${API}/events${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<ResolvedEvent[]>;
    },
    // Keep events warm without hammering Google; hold the prior month on the
    // screen while paging so navigation doesn't flash empty.
    refetchInterval: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  // Learn whether we can write (any enabled+writable Google calendar). Shared
  // key with the settings form so connecting an account refreshes both.
  const statusQuery = useQuery({
    queryKey: ["calendar", "oauth-status"],
    queryFn: async (): Promise<OAuthStatus> => {
      const r = await fetch(`${API}/oauth/status`);
      return r.json() as Promise<OAuthStatus>;
    },
  });

  const events = eventsQuery.data ?? [];
  const loading = eventsQuery.isLoading;
  const error = eventsQuery.isError
    ? eventsQuery.error instanceof Error
      ? eventsQuery.error.message
      : "Failed to load"
    : null;
  const cals = statusQuery.data ? writableCalendars(statusQuery.data.accounts) : [];
  const writeTarget = statusQuery.data?.writeTarget ?? null;
  const canWrite = cals.length > 0;
  // Events on these calendars can be edited/deleted in place; ICS feed events can't.
  const editableIds = new Set(cals.map((c) => c.id));
  const refreshEvents = () => void qc.invalidateQueries({ queryKey: ["calendar", "events"] });

  useModuleHotkeys({ a: () => setAdding(true) });

  return (
    <div className="flex h-full flex-col gap-3.5 overflow-hidden p-1">
      <div className="flex shrink-0 items-center justify-between gap-2">
        {view === "month" ? (
          <MonthHeader
            anchor={anchor}
            onPrev={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
            onToday={() => setAnchor(new Date())}
          />
        ) : (
          <Title>Calendar</Title>
        )}
        {canWrite && (
          <IconButton label="New event" size="sm" onClick={() => setAdding(true)}>
            <IconPlus size={16} />
          </IconButton>
        )}
      </div>

      {loading && (
        <EmptyState className="justify-start px-0 text-left">Loading…</EmptyState>
      )}

      {error !== null && <ErrorState className="justify-start px-0">{error}</ErrorState>}

      {!loading &&
        error === null &&
        (view === "month" ? (
          <MonthGrid events={events} anchor={anchor} editableIds={editableIds} onEdit={setEditing} />
        ) : (
          <UpcomingList events={events} editableIds={editableIds} onEdit={setEditing} />
        ))}

      {adding && (
        <EventModal
          cals={cals}
          writeTarget={writeTarget}
          onClose={() => setAdding(false)}
          onSaved={refreshEvents}
        />
      )}

      {editing && (
        <EventModal
          cals={cals}
          writeTarget={writeTarget}
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={refreshEvents}
        />
      )}
    </div>
  );
}
