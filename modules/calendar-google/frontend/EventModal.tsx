import { useState } from "react";
import {
  Field,
  FormFooter,
  Modal,
  Select,
  TextArea,
  TextInput,
} from "@hub/components";
import type { ResolvedEvent, WritableCalendar, WriteTarget } from "./types";
import { API } from "./types";
import { dateOf, defaultDateTime, nextDayStr, timeOf, toIso } from "./dates";

/**
 * Create or edit a basic event. With `event` set it edits in place (and offers
 * Delete); otherwise it creates on the chosen calendar. Fields are deliberately
 * basic: title, all-day toggle, date + start/end times, location, description.
 */
export function EventModal({
  cals,
  writeTarget,
  event,
  onClose,
  onSaved,
}: {
  cals: WritableCalendar[];
  writeTarget: WriteTarget | null;
  event?: ResolvedEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = event !== undefined;
  const init = defaultDateTime();
  const [title, setTitle] = useState(event?.summary ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [date, setDate] = useState(event ? dateOf(event.start) : init.date);
  const [start, setStart] = useState(event && !event.allDay ? timeOf(event.start) : init.start);
  const [end, setEnd] = useState(event && !event.allDay ? timeOf(event.end) : init.end);
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [calendarId, setCalendarId] = useState(
    event?.calendarId ?? writeTarget?.calendarId ?? cals[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    setSaving(true);
    setError(null);
    const timing = allDay
      ? { start: date, end: nextDayStr(date), allDay: true }
      : { start: toIso(date, start), end: toIso(date, end), allDay: false };
    const payload = {
      summary: title.trim(),
      location: location.trim(),
      description: description.trim(),
      ...timing,
    };
    try {
      const res = await fetch(editing ? `${API}/update` : `${API}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { id: event!.id, ...payload }
            : { ...payload, ...(calendarId ? { calendarId } : {}) },
        ),
      });
      const result = (await res.json()) as { ok: boolean; message?: string };
      if (!result.ok) {
        setError(result.message ?? "Could not save the event.");
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error.");
      setSaving(false);
    }
  }

  async function del() {
    if (!event) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id }),
      });
      const result = (await res.json()) as { ok: boolean; message?: string };
      if (!result.ok) {
        setError(result.message ?? "Could not delete the event.");
        setDeleting(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error.");
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <Modal title={editing ? "Edit event" : "New event"} onClose={onClose} width="min(420px, 96vw)">
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <TextInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dentist, dinner with Sam…"
          />
        </Field>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          <span className="panel-label">All day</span>
        </label>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End">
              <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Location">
          <TextInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Description">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes…"
            rows={2}
          />
        </Field>
        {!editing && cals.length > 1 && (
          <Field label="Calendar">
            <Select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              {cals.map((c) => (
                <option key={`${c.accountId}:${c.id}`} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {error && <p className="font-serif text-xs italic text-error/80">{error}</p>}
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          disabled={busy}
          saveLabel={editing ? "Save changes" : "Add event"}
          start={
            editing && (
              <button
                type="button"
                className="btn btn-sm btn-ghost text-error/80 hover:bg-error/10 hover:text-error"
                onClick={() => void del()}
                disabled={busy}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )
          }
        />
      </div>
    </Modal>
  );
}
