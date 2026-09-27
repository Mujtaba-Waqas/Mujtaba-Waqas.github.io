import type { CalendarProvider } from "../types";

/**
 * Google Calendar adapter (REST). Requires an OAuth access token for the
 * connected account (GOOGLE_CALENDAR_ACCESS_TOKEN for local testing). The
 * production OAuth consent + refresh-token storage flow is Phase 2 (see docs/roadmap.md).
 */
export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALENDAR_ACCESS_TOKEN);
}

export function createGoogleCalendar(): CalendarProvider {
  const token = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN!;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return {
    name: "Google Calendar",
    mode: "live",
    async listBusy({ calendarIds, from, to }) {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers,
        body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: calendarIds.map((id) => ({ id })) }),
      });
      if (!res.ok) throw new Error(`Google freeBusy failed (${res.status})`);
      const data = (await res.json()) as { calendars: Record<string, { busy: { start: string; end: string }[] }> };
      return Object.entries(data.calendars).flatMap(([calendarId, c]) =>
        c.busy.map((b) => ({ calendarId, startAt: new Date(b.start), endAt: new Date(b.end) })),
      );
    },
    async createEvent(event) {
      const cal = encodeURIComponent(event.calendarId ?? "primary");
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          summary: event.title,
          description: event.description,
          location: event.location,
          start: { dateTime: event.startAt.toISOString() },
          end: { dateTime: event.endAt.toISOString() },
        }),
      });
      if (!res.ok) throw new Error(`Google event insert failed (${res.status})`);
      const data = (await res.json()) as { id: string };
      return { externalId: data.id };
    },
    async cancelEvent({ externalId, calendarId }) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId ?? "primary")}/events/${encodeURIComponent(externalId)}`, {
        method: "DELETE",
        headers,
      });
    },
  };
}
