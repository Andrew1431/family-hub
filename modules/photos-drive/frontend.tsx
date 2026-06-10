import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defineModule, type PanelProps, type SettingsProps, type OverlayProps } from "@hub/sdk";
import { manifest } from "./manifest";

// ── Shared shapes (mirror backend google.ts) ─────────────────────────────────

interface PhotoRef {
  id: string;
  name: string;
}
interface DriveFolder {
  id: string;
  name: string;
}
interface DriveAccount {
  id: string;
  email: string;
  name: string;
}
interface FolderEntry {
  id: string;
  name: string;
}
interface OAuthStatus {
  configured: boolean;
  redirectUri: string;
  account: DriveAccount | null;
  folder: DriveFolder | null;
}
interface PhotosResult {
  ok: boolean;
  reason?: "not-connected" | "no-folder" | "error";
  error?: string;
  folder?: DriveFolder;
  photos: PhotoRef[];
}
interface PhotoConfig {
  intervalSec: number;
  screensaver: boolean;
  idleSec: number;
}

const CONFIG_DEFAULTS: PhotoConfig = { intervalSec: 8, screensaver: true, idleSec: 120 };

const photoUrl = (id: string): string => `/api/m/photos-drive/photo/${encodeURIComponent(id)}`;

async function fetchPhotos(): Promise<PhotosResult> {
  const r = await fetch("/api/m/photos-drive/photos");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<PhotosResult>;
}

async function fetchPhotoConfig(): Promise<PhotoConfig> {
  const r = await fetch("/api/m/photos-drive/config");
  if (!r.ok) throw new Error(r.statusText);
  const c = (await r.json()) as Partial<PhotoConfig>;
  return { ...CONFIG_DEFAULTS, ...c };
}

// ── Slideshow (used by the widget AND, later, the screensaver overlay) ───────

/** One crossfading image layer; fades in once the bytes have loaded. */
function Slide({ id }: { id: string }) {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Defer the opacity flip two frames so the opacity-0 state actually paints
  // first — otherwise a preloaded (already-decoded) image skips the transition
  // and hard-cuts in. Double rAF guarantees a painted 0 frame to animate from.
  function reveal() {
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }

  // A cached image can finish loading before React attaches onLoad; catch it.
  useEffect(() => {
    if (ref.current?.complete) reveal();
  }, []);

  return (
    <img
      ref={ref}
      src={photoUrl(id)}
      alt=""
      onLoad={reveal}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

function Slideshow({ photos, intervalSec }: { photos: PhotoRef[]; intervalSec: number }) {
  // A monotonic step counter — NOT an index. Keying each layer by `tick` means
  // every advance is a fresh mount that re-runs the fade, even in a 2-photo loop
  // where keying by photo id would just reorder two already-shown layers.
  const [tick, setTick] = useState(0);
  const len = photos.length;

  useEffect(() => {
    if (len < 2) return;
    const t = setInterval(() => setTick((n) => n + 1), Math.max(2, intervalSec) * 1000);
    return () => clearInterval(t);
  }, [len, intervalSec]);

  // Preload the next image so the crossfade is instant.
  useEffect(() => {
    const next = photos[(tick + 1) % len];
    if (next) {
      const img = new Image();
      img.src = photoUrl(next.id);
    }
  }, [tick, photos, len]);

  if (len === 0) return null;
  const cur = photos[tick % len]!;
  const prevTick = tick - 1;
  const prev = prevTick >= 0 ? photos[prevTick % len] : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {prev && <Slide key={prevTick} id={prev.id} />}
      <Slide key={tick} id={cur.id} />
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full w-full place-items-center bg-base-content/[0.04] p-6 text-center">
      <p className="max-w-[22ch] font-serif italic text-[clamp(13px,1.5vw,16px)] text-base-content/55">
        {children}
      </p>
    </div>
  );
}

function PhotosPanel(_props: PanelProps) {
  const photosQuery = useQuery({
    queryKey: ["photos", "list"],
    queryFn: fetchPhotos,
    refetchInterval: 5 * 60_000,
  });
  const { data: config } = useQuery({ queryKey: ["photos", "config"], queryFn: fetchPhotoConfig });
  const intervalSec = config?.intervalSec ?? CONFIG_DEFAULTS.intervalSec;

  const result = photosQuery.data;

  let body: React.ReactNode;
  if (photosQuery.isLoading) {
    body = (
      <div className="grid h-full w-full place-items-center bg-black">
        <span className="loading loading-ring loading-lg text-primary/60" />
      </div>
    );
  } else if (!result || !result.ok) {
    const reason = result?.reason;
    body = (
      <Hint>
        {reason === "not-connected"
          ? "Connect a Google Drive account in Settings to show your photos here."
          : reason === "no-folder"
            ? "Pick a Drive folder in Settings to start the slideshow."
            : (result?.error ?? "Couldn’t load photos.")}
      </Hint>
    );
  } else if (result.photos.length === 0) {
    body = <Hint>No images found in “{result.folder?.name}”.</Hint>;
  } else {
    body = <Slideshow photos={result.photos} intervalSec={intervalSec} />;
  }

  // Bare surface: the Panel owns its rounded frame + subtle ring.
  return (
    <div className="h-full w-full overflow-hidden rounded-[clamp(12px,1.4vw,20px)] ring-1 ring-base-content/10">
      {body}
    </div>
  );
}

// ── Screensaver overlay ───────────────────────────────────────────────────────

/**
 * The shell mounts this permanently and feeds it the global idle time. When the
 * screensaver is enabled, there are photos, and we've been idle past the
 * configured threshold, the slideshow takes over the whole screen. The shell
 * resets `idleMs` on any interaction, which hides us again (and swallows that
 * first wake event so it doesn't open the assistant).
 */
function PhotosOverlay({ idleMs, setActive }: OverlayProps) {
  const { data: config } = useQuery({ queryKey: ["photos", "config"], queryFn: fetchPhotoConfig });
  const { data: result } = useQuery({
    queryKey: ["photos", "list"],
    queryFn: fetchPhotos,
    refetchInterval: 5 * 60_000,
  });

  const enabled = config?.screensaver ?? CONFIG_DEFAULTS.screensaver;
  const idleSec = Math.max(10, config?.idleSec ?? CONFIG_DEFAULTS.idleSec);
  const intervalSec = config?.intervalSec ?? CONFIG_DEFAULTS.intervalSec;
  const photos = result?.ok ? result.photos : [];

  const active = enabled && photos.length > 0 && idleMs >= idleSec * 1000;

  useEffect(() => {
    setActive(active);
    return () => setActive(false);
  }, [active, setActive]);

  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <Slideshow photos={photos} intervalSec={intervalSec} />
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function fetchStatus(): Promise<OAuthStatus> {
  const r = await fetch("/api/m/photos-drive/oauth/status");
  return r.json() as Promise<OAuthStatus>;
}

function FolderPicker({
  current,
  onPicked,
}: {
  current: DriveFolder | null;
  onPicked: () => void;
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
      const r = await fetch(`/api/m/photos-drive/folders?parent=${encodeURIComponent(parent)}`);
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
    await fetch("/api/m/photos-drive/folder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: { id: f.id, name: f.name } }),
    });
    setBusy(false);
    setOpen(false);
    onPicked();
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="panel-label">Source folder</div>
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
        <div className="grid place-items-center py-4">
          <span className="loading loading-spinner loading-sm text-base-content/40" />
        </div>
      ) : error ? (
        <p className="font-serif italic text-xs text-error/80">{error}</p>
      ) : entries.length === 0 ? (
        <p className="font-serif italic text-xs text-base-content/55">No sub-folders here.</p>
      ) : (
        <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
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

function PhotosSettings({ onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [cfg, setCfg] = useState<PhotoConfig | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingClient, setSavingClient] = useState(false);
  const [savingOpts, setSavingOpts] = useState(false);
  const [copied, setCopied] = useState(false);

  function refreshPanel() {
    void qc.invalidateQueries({ queryKey: ["photos", "list"] });
    void qc.invalidateQueries({ queryKey: ["photos", "config"] });
  }

  function load() {
    void fetchStatus().then(setStatus).catch(() => {});
    void fetchPhotoConfig().then(setCfg).catch(() => setCfg(CONFIG_DEFAULTS));
    refreshPanel();
  }

  useEffect(load, []);

  async function saveClient() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSavingClient(true);
    await fetch("/api/m/photos-drive/oauth/client", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
    });
    setSavingClient(false);
    setClientId("");
    setClientSecret("");
    load();
  }

  function connect() {
    const popup = window.open("/api/m/photos-drive/oauth/start", "google-oauth", "width=520,height=640");
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        load();
      }
    }, 800);
  }

  async function disconnect() {
    await fetch("/api/m/photos-drive/account", { method: "DELETE" });
    load();
  }

  async function saveOptions() {
    if (!cfg) return;
    setSavingOpts(true);
    await fetch("/api/m/photos-drive/config", {
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

  if (!status || !cfg) {
    return (
      <div className="grid place-items-center py-8">
        <span className="loading loading-spinner text-base-content/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Google connection ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="panel-label">Google Drive</div>

        {!status.configured ? (
          <div className="flex flex-col gap-2">
            <p className="font-serif italic text-xs text-base-content/65">
              Uses the shared hub OAuth client. Set{" "}
              <code className="font-mono">GOOGLE_CLIENT_ID</code> /{" "}
              <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in{" "}
              <code className="font-mono">.env</code> and restart — or paste them below. Either way,
              register this exact redirect URI:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-base-content/5 px-2 py-1 font-mono text-[10px] text-base-content/70">
                {status.redirectUri}
              </code>
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(status.redirectUri);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID"
              className="input input-sm border-base-content/10 bg-base-content/5 font-mono text-xs"
            />
            <input
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Client secret"
              type="password"
              className="input input-sm border-base-content/10 bg-base-content/5 font-mono text-xs"
            />
            <button
              className="btn btn-sm btn-primary self-start"
              onClick={() => void saveClient()}
              disabled={!clientId.trim() || !clientSecret.trim() || savingClient}
            >
              {savingClient ? "Saving…" : "Save client"}
            </button>
          </div>
        ) : status.account ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-base-content/10 bg-base-content/[0.03] p-2.5">
              <span className="min-w-0 flex-1 truncate font-sans text-xs font-semibold text-base-content">
                {status.account.email}
              </span>
              <button onClick={() => void disconnect()} className="text-[11px] text-base-content/40 hover:text-error">
                Disconnect
              </button>
            </div>
            <FolderPicker current={status.folder} onPicked={load} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-serif italic text-xs text-base-content/65">
              First add this redirect URI to your Google Cloud OAuth client (APIs &amp; Services →
              Credentials → your client → <span className="not-italic">Authorized redirect URIs</span>).
              Each Google module has its own callback, so this is separate from the Calendar one.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-base-content/5 px-2 py-1 font-mono text-[10px] text-base-content/70">
                {status.redirectUri}
              </code>
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(status.redirectUri);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button className="btn btn-sm btn-primary self-start" onClick={connect}>
              Connect Google Drive
            </button>
          </div>
        )}
      </section>

      {/* ── Slideshow + screensaver options ───────────────────────────────── */}
      <section className="flex flex-col gap-4 border-t border-base-content/10 pt-4">
        <div className="panel-label">Slideshow</div>

        <label className="flex items-center justify-between gap-4">
          <span className="font-sans text-sm font-medium text-base-content">Each photo shows for</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={2}
              value={cfg.intervalSec}
              onChange={(e) => setCfg({ ...cfg, intervalSec: Number(e.target.value) || 0 })}
              className="input input-sm w-20 border-base-content/10 bg-base-content/5 text-right"
            />
            <span className="text-xs text-base-content/55">sec</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span>
            <span className="block font-sans text-sm font-medium text-base-content">
              Screensaver
            </span>
            <span className="mt-0.5 block text-xs text-base-content/55">
              When idle, the slideshow takes over the whole screen.
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle toggle-primary mt-0.5 shrink-0"
            checked={cfg.screensaver}
            onChange={(e) => setCfg({ ...cfg, screensaver: e.target.checked })}
          />
        </label>

        <label
          className={`flex items-center justify-between gap-4 transition-opacity ${
            cfg.screensaver ? "" : "pointer-events-none opacity-40"
          }`}
        >
          <span className="font-sans text-sm font-medium text-base-content">Start after idle for</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={10}
              value={cfg.idleSec}
              onChange={(e) => setCfg({ ...cfg, idleSec: Number(e.target.value) || 0 })}
              disabled={!cfg.screensaver}
              className="input input-sm w-20 border-base-content/10 bg-base-content/5 text-right"
            />
            <span className="text-xs text-base-content/55">sec</span>
          </span>
        </label>
      </section>

      <div className="flex justify-end gap-2 border-t border-base-content/10 pt-3">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => void saveOptions()} disabled={savingOpts}>
          {savingOpts ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default defineModule({
  manifest,
  Panel: PhotosPanel,
  Settings: PhotosSettings,
  Overlay: PhotosOverlay,
});
