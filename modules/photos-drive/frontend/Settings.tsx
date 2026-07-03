import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SettingsProps } from "@hub/sdk";
import {
  EmptyState,
  ErrorState,
  FormFooter,
  LoadingState,
  ScrollView,
  TextInput,
  ToggleRow,
} from "@hub/components";
import { GoogleAccountCard, GoogleConnect } from "@hub/google/connect";
import {
  API,
  CONFIG_DEFAULTS,
  SCREENSAVER_INSTANCE,
  type DriveFolder,
  type FolderEntry,
  type OAuthStatus,
  type PhotoConfig,
} from "./types";

async function fetchStatus(instanceId?: string): Promise<OAuthStatus> {
  const qs = instanceId ? `?instance=${encodeURIComponent(instanceId)}` : "";
  const r = await fetch(`${API}/oauth/status${qs}`);
  return r.json() as Promise<OAuthStatus>;
}

function FolderPicker({
  instanceId,
  current,
  onPicked,
  label = "Source folder",
}: {
  instanceId: string;
  current: DriveFolder | null;
  onPicked: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<FolderEntry[]>([]);
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(parent: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/folders?parent=${encodeURIComponent(parent)}`);
      const j = (await r.json()) as { ok: boolean; folders: FolderEntry[]; error?: string };
      if (!j.ok) setError(j.error ?? "Could not list folders.");
      setEntries(j.folders);
    } catch (e) {
      setError(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function start() {
    setOpen(true);
    setPath([]);
    void load("root");
  }

  function descend(f: FolderEntry) {
    setPath((p) => [...p, f]);
    void load(f.id);
  }

  function crumbTo(i: number) {
    // i === -1 → My Drive root.
    const next = i < 0 ? [] : path.slice(0, i + 1);
    setPath(next);
    void load(next.length ? next[next.length - 1]!.id : "root");
  }

  async function choose(f: FolderEntry) {
    setBusy(true);
    await fetch(`${API}/folder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, folder: { id: f.id, name: f.name } }),
    });
    setBusy(false);
    setOpen(false);
    onPicked();
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="panel-label">{label}</div>
          <div className="mt-0.5 truncate font-sans text-sm text-base-content/80">
            {current ? current.name : <span className="italic text-base-content/45">None chosen</span>}
          </div>
        </div>
        <button className="btn btn-sm btn-ghost shrink-0" onClick={start}>
          {current ? "Change" : "Choose"}
        </button>
      </div>
    );
  }

  const here = path.length ? path[path.length - 1]! : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-content/10 bg-base-content/[0.03] p-2.5">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-base-content/55">
        <button className="hover:text-base-content" onClick={() => crumbTo(-1)}>
          My Drive
        </button>
        {path.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <button className="max-w-[12ch] truncate hover:text-base-content" onClick={() => crumbTo(i)}>
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {loading ? (
        <LoadingState className="py-4" />
      ) : error ? (
        <ErrorState className="justify-start px-0 text-left">{error}</ErrorState>
      ) : entries.length === 0 ? (
        <EmptyState className="justify-start px-0 text-left">No sub-folders here.</EmptyState>
      ) : (
        <ScrollView className="max-h-44">
          <ul className="flex flex-col gap-1">
            {entries.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <button
                  onClick={() => descend(f)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-base-content/10"
                >
                  <span aria-hidden>📁</span>
                  <span className="truncate font-sans text-sm text-base-content/85">{f.name}</span>
                </button>
                <button
                  onClick={() => void choose(f)}
                  disabled={busy}
                  className="btn btn-xs btn-ghost shrink-0"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </ScrollView>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-base-content/10 pt-2">
        <button className="btn btn-xs btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {here && (
          <button
            className="btn btn-xs btn-primary"
            onClick={() => void choose(here)}
            disabled={busy}
          >
            Use “{here.name}”
          </button>
        )}
      </div>
    </div>
  );
}

export function PhotosSettings({ instanceId, onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [cfg, setCfg] = useState<PhotoConfig | null>(null);
  const [savingOpts, setSavingOpts] = useState(false);

  // Invalidate every per-widget list + the screensaver union + the config.
  function refreshPanel() {
    void qc.invalidateQueries({ queryKey: ["photos"] });
  }

  function load() {
    void fetchStatus(instanceId).then(setStatus).catch(() => {});
    fetch(`${API}/config`)
      .then((r) => r.json() as Promise<Partial<PhotoConfig>>)
      .then((c) => setCfg({ ...CONFIG_DEFAULTS, ...c }))
      .catch(() => setCfg(CONFIG_DEFAULTS));
    refreshPanel();
  }

  useEffect(load, []);

  async function disconnect() {
    await fetch(`${API}/account`, { method: "DELETE" });
    load();
  }

  async function saveOptions() {
    if (!cfg) return;
    setSavingOpts(true);
    await fetch(`${API}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intervalSec: Math.max(2, cfg.intervalSec),
        screensaver: cfg.screensaver,
        idleSec: Math.max(10, cfg.idleSec),
      }),
    });
    setSavingOpts(false);
    void qc.invalidateQueries({ queryKey: ["photos", "config"] });
  }

  if (!status || !cfg) return <LoadingState />;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Google connection ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="panel-label">Google Drive</div>

        {status.account ? (
          <GoogleAccountCard email={status.account.email} onDisconnect={() => void disconnect()} />
        ) : (
          <GoogleConnect
            apiBase={API}
            configured={status.configured}
            redirectUri={status.redirectUri}
            onChanged={load}
            connectLabel="Connect Google Drive"
            intro={
              <p className="font-serif text-xs italic text-base-content/65">
                Uses the shared hub OAuth client. Set{" "}
                <code className="font-mono">GOOGLE_CLIENT_ID</code> /{" "}
                <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in{" "}
                <code className="font-mono">.env</code> and restart — or paste them below. Either way,
                register this one redirect URI (shared by every Google module):
              </p>
            }
          />
        )}
      </section>

      {/* ── This widget's source folder (per-instance) ────────────────────── */}
      {status.account && (
        <section className="flex flex-col gap-3 border-t border-base-content/10 pt-4">
          <div className="panel-label">This widget</div>
          {instanceId ? (
            <FolderPicker instanceId={instanceId} current={status.folder} onPicked={load} />
          ) : (
            <p className="font-serif text-xs italic text-base-content/55">
              Each Photos widget shows its own folder. Open a widget’s settings from the cog on
              its card to choose that one’s folder.
            </p>
          )}
        </section>
      )}

      {/* ── Slideshow + screensaver options (global) ──────────────────────── */}
      <section className="flex flex-col gap-4 border-t border-base-content/10 pt-4">
        <div className="panel-label">Slideshow</div>

        <label className="flex items-center justify-between gap-4">
          <span className="font-sans text-sm font-medium text-base-content">Each photo shows for</span>
          <span className="flex items-center gap-2">
            <TextInput
              type="number"
              min={2}
              value={cfg.intervalSec}
              onChange={(e) => setCfg({ ...cfg, intervalSec: Number(e.target.value) || 0 })}
              className="w-20 text-right"
            />
            <span className="text-xs text-base-content/55">sec</span>
          </span>
        </label>

        <ToggleRow
          label="Screensaver"
          hint="When idle, the slideshow takes over the whole screen."
          checked={cfg.screensaver}
          onChange={(v) => setCfg({ ...cfg, screensaver: v })}
        />

        <label
          className={`flex items-center justify-between gap-4 transition-opacity ${
            cfg.screensaver ? "" : "pointer-events-none opacity-40"
          }`}
        >
          <span className="font-sans text-sm font-medium text-base-content">Start after idle for</span>
          <span className="flex items-center gap-2">
            <TextInput
              type="number"
              min={10}
              value={cfg.idleSec}
              onChange={(e) => setCfg({ ...cfg, idleSec: Number(e.target.value) || 0 })}
              disabled={!cfg.screensaver}
              className="w-20 text-right"
            />
            <span className="text-xs text-base-content/55">sec</span>
          </span>
        </label>

        {status.account && (
          <div
            className={`transition-opacity ${cfg.screensaver ? "" : "pointer-events-none opacity-40"}`}
          >
            <FolderPicker
              instanceId={SCREENSAVER_INSTANCE}
              current={status.screensaverFolder}
              onPicked={load}
              label="Screensaver folder"
            />
          </div>
        )}
      </section>

      <FormFooter
        bordered
        onCancel={onClose}
        onSave={() => void saveOptions()}
        saving={savingOpts}
      />
    </div>
  );
}
