import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SettingsProps } from "@hub/sdk";
import {
  Field,
  FormFooter,
  IconButton,
  IconX,
  LoadingState,
  Select,
  TextInput,
} from "@hub/components";
import { GoogleAccountCard, GoogleConnect, openGoogleOAuth } from "@hub/google/connect";
import type { GoogleCalendar, OAuthStatus, WriteTarget } from "./types";
import { API, writableCalendars } from "./types";

// ── ICS subscriptions ─────────────────────────────────────────────────────────

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

export function CalendarSettings({ onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [status, setStatus] = useState<Record<string, SourceStatus>>({});
  const [saving, setSaving] = useState(false);

  // Add-form state
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ValidateResult | null>(null);

  useEffect(() => {
    fetch(`${API}/config`)
      .then((r) => r.json() as Promise<{ subscriptions?: Subscription[] }>)
      .then((c) => setSubs(c.subscriptions ?? []))
      .catch(() => setSubs([]));
    fetch(`${API}/sources`)
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
      const res = await fetch(`${API}/validate`, {
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
    await fetch(`${API}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptions: subs }),
    });
    setSaving(false);
    // Subscriptions changed → the panel's events feed is now stale.
    void qc.invalidateQueries({ queryKey: ["calendar", "events"] });
    onClose();
  }

  if (!subs) return <LoadingState />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="panel-label mb-2">Calendar subscriptions</div>
        {subs.length === 0 ? (
          <p className="font-serif text-xs italic text-base-content/65">
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
                    <TextInput
                      value={s.name}
                      onChange={(e) => patch(s.id, { name: e.target.value })}
                      className="!input-xs w-full font-sans"
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
                  <IconButton label={`Remove ${s.name}`} onClick={() => remove(s.id)}>
                    <IconX size={13} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new */}
      <div className="flex flex-col gap-2 border-t border-base-content/10 pt-4">
        <div className="panel-label">Add a calendar</div>
        <TextInput
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTestResult(null);
          }}
          placeholder="https://…/basic.ics  or  webcal://…"
          className="w-full font-mono text-xs"
        />
        <div className="flex items-center gap-2">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="flex-1"
          />
          <button
            onClick={() => void test()}
            disabled={!url.trim() || testing}
            className="btn btn-sm btn-ghost"
          >
            {testing ? "Testing…" : "Test"}
          </button>
          <button onClick={add} disabled={!url.trim()} className="btn btn-sm btn-primary">
            Add
          </button>
        </div>
        {testResult && (
          <p
            className={`font-serif text-xs italic ${
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

      <FormFooter
        bordered
        onCancel={onClose}
        onSave={() => void save()}
        saving={saving}
        saveLabel="Save subscriptions"
      />
    </div>
  );
}

// ── Google accounts (OAuth) ───────────────────────────────────────────────────

function GoogleSettings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [savingCals, setSavingCals] = useState(false);

  // Any account/calendar change ripples to the panel's status + events.
  function refreshPanel() {
    void qc.invalidateQueries({ queryKey: ["calendar", "oauth-status"] });
    void qc.invalidateQueries({ queryKey: ["calendar", "events"] });
  }

  function load() {
    fetch(`${API}/oauth/status`)
      .then((r) => r.json() as Promise<OAuthStatus>)
      .then(setStatus)
      .catch(() => {});
    refreshPanel();
  }

  useEffect(load, []);

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
    await fetch(`${API}/accounts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: status.accounts, writeTarget: status.writeTarget }),
    });
    setSavingCals(false);
    load();
  }

  async function disconnect(id: string) {
    await fetch(`${API}/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  if (!status) return null;

  const writable = writableCalendars(status.accounts);

  return (
    <div className="flex flex-col gap-3 border-t border-base-content/10 pt-4">
      <div className="panel-label">Google accounts</div>

      {!status.configured ? (
        <GoogleConnect
          apiBase={API}
          configured={status.configured}
          redirectUri={status.redirectUri}
          onChanged={load}
          showConnect={false}
          intro={
            <p className="font-serif text-xs italic text-base-content/65">
              Create one “Web application” OAuth client in Google Cloud (shared by all Google
              modules). Set <code className="font-mono">GOOGLE_CLIENT_ID</code> /{" "}
              <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in{" "}
              <code className="font-mono">.env</code> and restart — or paste them below. Either way,
              register this one redirect URI (shared by every Google module):
            </p>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {status.accounts.length === 0 ? (
            <p className="font-serif text-xs italic text-base-content/65">
              Client configured. Connect an account to choose calendars.
            </p>
          ) : (
            status.accounts.map((acct) => (
              <GoogleAccountCard
                key={acct.id}
                email={acct.email}
                onDisconnect={() => void disconnect(acct.id)}
              >
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
              </GoogleAccountCard>
            ))
          )}

          <div className="flex items-center gap-2">
            <button className="btn btn-sm btn-ghost" onClick={() => openGoogleOAuth(API, load)}>
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
            <Field label="New events go to">
              <Select
                value={status.writeTarget?.calendarId ?? ""}
                onChange={(e) => {
                  const cal = writable.find((w) => w.id === e.target.value);
                  setWriteTarget(cal ? { accountId: cal.accountId, calendarId: cal.id } : null);
                }}
              >
                <option value="">— none —</option>
                {writable.map((w) => (
                  <option key={`${w.accountId}:${w.id}`} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
