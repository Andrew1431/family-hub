// Shared frontend shapes (mirror backend google.ts).

export interface ResolvedEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarName: string;
  color: string;
  location?: string;
  description?: string;
}

export interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  primary?: boolean;
  writable?: boolean;
}

export interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  calendars: GoogleCalendar[];
}

export interface WriteTarget {
  accountId: string;
  calendarId: string;
}

export interface OAuthStatus {
  configured: boolean;
  redirectUri: string;
  accounts: GoogleAccount[];
  writeTarget: WriteTarget | null;
}

export interface WritableCalendar {
  accountId: string;
  id: string;
  name: string;
}

export function writableCalendars(accounts: GoogleAccount[]): WritableCalendar[] {
  return accounts.flatMap((a) =>
    a.calendars
      .filter((c) => c.enabled && c.writable)
      .map((c) => ({ accountId: a.id, id: c.id, name: c.name })),
  );
}

export const API = "/api/m/calendar-google";
