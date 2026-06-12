import { useState, type ReactNode } from "react";

/*
 * The Google connection chrome shared by every Google module's settings:
 *  • unconfigured  → intro copy + redirect-URI chip + client id/secret form
 *  • configured    → redirect-URI chip + a "Connect" button (opens the popup)
 *
 * The connected-account list (calendars, task lists, the Drive folder picker) is
 * module-specific and rendered by the module itself, around this component.
 */

export interface GoogleConnectProps {
  /** This module's API base, e.g. `/api/m/calendar-google`. */
  apiBase: string;
  /** Whether the shared OAuth client id/secret are set. */
  configured: boolean;
  /** The exact redirect URI to register in Google Cloud. */
  redirectUri: string;
  /** Re-fetch the module's OAuth status (called after save / popup close). */
  onChanged: () => void;
  /** Module-specific explanation shown above the client form when unconfigured. */
  intro?: ReactNode;
  /** Label for the connect button (e.g. "Connect Google Drive"). */
  connectLabel?: string;
  /** Show the connect button once configured. Single-account modules can hide it
   *  while already connected. Defaults to true. */
  showConnect?: boolean;
}

function RedirectChip({ uri }: { uri: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded bg-base-content/5 px-2 py-1 font-mono text-[10px] text-base-content/70">
        {uri}
      </code>
      <button
        className="btn btn-xs btn-ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(uri);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function GoogleConnect({
  apiBase,
  configured,
  redirectUri,
  onChanged,
  intro,
  connectLabel = "Connect Google",
  showConnect = true,
}: GoogleConnectProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  async function saveClient() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSavingClient(true);
    await fetch(`${apiBase}/oauth/client`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
    });
    setSavingClient(false);
    setClientId("");
    setClientSecret("");
    onChanged();
  }

  function connect() {
    const popup = window.open(`${apiBase}/oauth/start`, "google-oauth", "width=520,height=640");
    // The popup closes itself on success; refresh once it's gone.
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        onChanged();
      }
    }, 800);
  }

  if (!configured) {
    return (
      <div className="flex flex-col gap-2">
        {intro}
        <RedirectChip uri={redirectUri} />
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
    );
  }

  if (!showConnect) return null;

  return (
    <div className="flex flex-col gap-2">
      <RedirectChip uri={redirectUri} />
      <button className="btn btn-sm btn-primary self-start" onClick={connect}>
        {connectLabel}
      </button>
    </div>
  );
}
