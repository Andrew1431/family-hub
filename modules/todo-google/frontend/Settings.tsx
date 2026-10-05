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
import { SHORTCUTS } from "./shortcuts";
import { API, TASKS_KEY, type ViewMode } from "./types";

interface SettingsList {
  id: string;
  title: string;
  color: string;
  enabled: boolean;
}

interface SettingsAccount {
  id: string;
  email: string;
  name: string;
  lists: SettingsList[];
}

interface DefaultList {
  accountId: string;
  listId: string;
}

interface OAuthStatus {
  configured: boolean;
  redirectUri: string;
  accounts: SettingsAccount[];
  defaultList: DefaultList | null;
  viewMode: ViewMode;
}

export function TodoSettings({ onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(`${API}/oauth/status`)
      .then((r) => r.json() as Promise<OAuthStatus>)
      .then(setStatus)
      .catch(() => {});
    // Lists/accounts/view may have changed → refresh the panel's tasks.
    void qc.invalidateQueries({ queryKey: TASKS_KEY });
  }

  useEffect(load, []);

  async function disconnect(id: string) {
    await fetch(`${API}/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  function patchList(accountId: string, listId: string, fields: Partial<SettingsList>) {
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            accounts: prev.accounts.map((a) =>
              a.id === accountId
                ? { ...a, lists: a.lists.map((l) => (l.id === listId ? { ...l, ...fields } : l)) }
                : a,
            ),
          }
        : prev,
    );
  }

  async function createList(accountId: string) {
    const title = newListTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    await fetch(`${API}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, accountId }),
    });
    setNewListTitle("");
    setBusy(false);
    load();
  }

  async function renameList(listId: string, title: string, original: string) {
    const t = title.trim();
    if (!t || t === original) return;
    await fetch(`${API}/lists/${encodeURIComponent(listId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    load();
  }

  async function deleteList(listId: string) {
    if (!confirm("Delete this list and all its tasks? This can't be undone.")) return;
    await fetch(`${API}/lists/${encodeURIComponent(listId)}`, { method: "DELETE" });
    load();
  }

  async function saveSettings() {
    if (!status) return;
    setSaving(true);
    await fetch(`${API}/accounts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: status.accounts,
        defaultList: status.defaultList,
        viewMode: status.viewMode,
      }),
    });
    setSaving(false);
    onClose();
  }

  if (!status) return <LoadingState />;

  const allLists = status.accounts.flatMap((a) => a.lists.map((l) => ({ accountId: a.id, ...l })));
  const canSave = status.configured && status.accounts.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Google client (only until configured) */}
      {!status.configured ? (
        <div className="flex flex-col gap-2">
          <div className="panel-label">Google account</div>
          <GoogleConnect
            apiBase={API}
            configured={status.configured}
            redirectUri={status.redirectUri}
            onChanged={load}
            showConnect={false}
            intro={
              <p className="font-serif text-xs italic text-base-content/65">
                Reuses the hub's shared OAuth client (same one the calendar uses). Set{" "}
                <code className="font-mono">GOOGLE_CLIENT_ID</code> /{" "}
                <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in{" "}
                <code className="font-mono">.env</code> and restart — or paste them below. Register
                this one redirect URI (shared by every Google module):
              </p>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="panel-label">Lists</div>
          {status.accounts.length === 0 ? (
            <p className="font-serif text-xs italic text-base-content/65">
              Client configured. Connect the shared family account to manage lists.
            </p>
          ) : (
            status.accounts.map((acct) => (
              <GoogleAccountCard
                key={acct.id}
                email={acct.email}
                onDisconnect={() => void disconnect(acct.id)}
              >
                {acct.lists.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 pl-1">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={l.enabled}
                      onChange={(e) => patchList(acct.id, l.id, { enabled: e.target.checked })}
                      aria-label={`Show ${l.title}`}
                    />
                    <input
                      type="color"
                      value={l.color}
                      onChange={(e) => patchList(acct.id, l.id, { color: e.target.value })}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={`${l.title} colour`}
                    />
                    <input
                      defaultValue={l.title}
                      onBlur={(e) => void renameList(l.id, e.target.value, l.title)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="input input-xs min-w-0 flex-1 border-base-content/10 bg-base-content/5 font-sans"
                      aria-label="List name"
                    />
                    <IconButton label={`Delete ${l.title}`} size="sm" onClick={() => void deleteList(l.id)}>
                      <IconX size={12} />
                    </IconButton>
                  </div>
                ))}
                {/* Create list */}
                <div className="flex items-center gap-2 pl-1">
                  <input
                    value={newListTitle}
                    onChange={(e) => setNewListTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void createList(acct.id); }}
                    placeholder="New list…"
                    className="input input-xs flex-1 border-base-content/10 bg-base-content/5"
                  />
                  <button
                    className="btn btn-xs btn-primary"
                    onClick={() => void createList(acct.id)}
                    disabled={!newListTitle.trim() || busy}
                  >
                    Add list
                  </button>
                </div>
              </GoogleAccountCard>
            ))
          )}

          <button className="btn btn-sm btn-ghost self-start" onClick={() => openGoogleOAuth(API, load)}>
            + Connect account
          </button>

          {allLists.length > 0 && (
            <>
              <Field label="New tasks default to">
                <Select
                  value={status.defaultList?.listId ?? ""}
                  onChange={(e) => {
                    const sel = allLists.find((l) => l.id === e.target.value);
                    setStatus({ ...status, defaultList: sel ? { accountId: sel.accountId, listId: sel.id } : null });
                  }}
                >
                  <option value="">— first enabled list —</option>
                  {allLists.map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Panel layout">
                <Select
                  value={status.viewMode}
                  onChange={(e) => setStatus({ ...status, viewMode: e.target.value === "tabs" ? "tabs" : "stacked" })}
                >
                  <option value="stacked">Stacked — all lists at once</option>
                  <option value="tabs">Tabs — one list at a time</option>
                </Select>
              </Field>
            </>
          )}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <span className="panel-label">Keyboard shortcuts</span>
        <p className="font-serif text-[13px] italic text-base-content/60">
          Press the card's hotkey to select it, then:
        </p>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="contents">
              <dt className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="kbd kbd-sm">{k}</kbd>
                ))}
              </dt>
              <dd className="text-base-content/80">{s.action}</dd>
            </div>
          ))}
        </dl>
      </section>

      <FormFooter
        bordered
        onCancel={onClose}
        {...(canSave ? { onSave: () => void saveSettings(), saving } : {})}
      />
    </div>
  );
}
