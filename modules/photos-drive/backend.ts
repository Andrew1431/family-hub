import { defineBackend, html, redirect, binary, type KVStore } from "@hub/sdk";
import {
  accessTokenFor,
  authUrl,
  clearTokenCache,
  downloadImage,
  exchangeCode,
  fetchAbout,
  getCreds,
  listFolders,
  listImages,
  revokeToken,
  type DriveAccount,
  type DriveFolder,
  type PhotoRef,
} from "./google";

/*
 * Photos module — slideshows sourced from Google Drive folders.
 *
 * ONE Drive account is shared by the whole module, but the source FOLDER is
 * per-widget: each placed instance picks its own folder (stored under
 * `folder:<instanceId>`), so two Photos widgets can show different albums. The
 * screensaver is global and unions every instance's folder.
 *
 * The UI never sees a Google token: it lists photos as opaque ids and loads
 * each via `/photo/:id`, which streams the bytes through the core (Drive's
 * media endpoint needs an Authorization header, so a bare <img src> can't hit
 * it). That proxy is also the natural disk-cache seam on the Pi later.
 */

const DEFAULT_REDIRECT_BASE = "http://localhost:4000";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const LIST_CACHE_TTL_MS = 5 * 60_000;
const FOLDER_PREFIX = "folder:";
// The screensaver's source folder is global; it's stored like a widget folder
// but under a reserved instance id, so it reuses the same picker + /folder route.
const SCREENSAVER_INSTANCE = "__screensaver__";

async function getAccount(config: KVStore): Promise<DriveAccount | null> {
  const a = await config.get<DriveAccount | null>("account");
  return a && a.id ? a : null;
}

async function getFolder(config: KVStore, instanceId: string): Promise<DriveFolder | null> {
  const f = await config.get<DriveFolder | null>(`${FOLDER_PREFIX}${instanceId}`);
  return f && f.id ? f : null;
}

function redirectUriFrom(base: string | undefined): string {
  return `${(base ?? DEFAULT_REDIRECT_BASE).replace(/\/$/, "")}/api/m/photos-drive/oauth/callback`;
}

// ── Photo-list cache (keyed by folder; the panel polls this) ─────────────────

const listCache = new Map<string, { at: number; photos: PhotoRef[] }>();

async function photosFor(secrets: KVStore, account: DriveAccount, folderId: string): Promise<PhotoRef[]> {
  const cached = listCache.get(folderId);
  if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) return cached.photos;
  const accessToken = await accessTokenFor(secrets, account.id);
  const photos = await listImages(accessToken, folderId);
  listCache.set(folderId, { at: Date.now(), photos });
  return photos;
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
  // Snapshot for the settings UI: client configured?, the redirect URI to
  // register in Google Cloud, the connected account, and (when an instance is
  // given) that widget's chosen folder. Account is global; folder is per-widget.
  ctx.route("GET", "/oauth/status", async ({ query }) => {
    const creds = await getCreds(ctx.secrets);
    const redirectBase = await ctx.config.get<string>("redirectBase");
    const instance = (query as { instance?: string }).instance?.trim();
    return {
      configured: Boolean(creds),
      redirectUri: redirectUriFrom(redirectBase),
      account: await getAccount(ctx.config),
      folder: instance ? await getFolder(ctx.config, instance) : null,
      screensaverFolder: await getFolder(ctx.config, SCREENSAVER_INSTANCE),
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
      return html(oauthPage("Add your Google Client ID and Secret in Photos settings first.", false));
    }
    const redirectBase = await ctx.config.get<string>("redirectBase");
    return redirect(authUrl(creds, redirectUriFrom(redirectBase), newState()));
  });

  // Google redirects back here with ?code&state. Exchange, identify the
  // account, store the refresh token, and record the account in config.
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

      const { email, name } = await fetchAbout(tokens.accessToken);

      if (tokens.refreshToken) {
        await ctx.secrets.set(`refresh:${email}`, tokens.refreshToken);
      } else if (!(await ctx.secrets.get<string>(`refresh:${email}`))) {
        return html(
          oauthPage(
            "Google didn't return a refresh token. Remove Family Hub at " +
              "myaccount.google.com/permissions, then reconnect.",
            false,
          ),
        );
      }

      const account: DriveAccount = { id: email, email, name };
      await ctx.config.set("account", account);
      clearTokenCache(email);
      return html(oauthPage(`Connected ${email}. You can close this window.`, true));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.log.warn(`oauth callback failed: ${message}`);
      return html(oauthPage(`Sign-in failed: ${message}`, false));
    }
  });

  // Disconnect: revoke the grant, drop the account + every widget's folder
  // (the ids are scoped to this account and become invalid once it's gone).
  ctx.route("DELETE", "/account", async () => {
    const account = await getAccount(ctx.config);
    if (account) {
      const refresh = await ctx.secrets.get<string>(`refresh:${account.id}`);
      if (refresh) await revokeToken(refresh);
      await ctx.secrets.delete(`refresh:${account.id}`);
      clearTokenCache(account.id);
    }
    await ctx.config.set("account", null);
    for (const key of Object.keys(await ctx.config.all())) {
      if (key.startsWith(FOLDER_PREFIX)) await ctx.config.delete(key);
    }
    listCache.clear();
    return { ok: true };
  });

  // Browse folders for the picker. ?parent defaults to My Drive root.
  ctx.route("GET", "/folders", async ({ query }) => {
    const account = await getAccount(ctx.config);
    if (!account) return { ok: false, error: "not connected", folders: [] };
    const parent = (query as { parent?: string }).parent?.trim() || "root";
    try {
      const accessToken = await accessTokenFor(ctx.secrets, account.id);
      return { ok: true, folders: await listFolders(accessToken, parent) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), folders: [] };
    }
  });

  // Persist a widget's chosen source folder (keyed by its instance id).
  ctx.route("PUT", "/folder", async ({ body }) => {
    const b = body as { instanceId?: string; folder?: DriveFolder | null } | undefined;
    const instanceId = b?.instanceId?.trim();
    if (!instanceId) return { ok: false, error: "instanceId is required" };
    const folder = b?.folder;
    if (folder && (!folder.id || !folder.name)) {
      return { ok: false, error: "folder needs id and name" };
    }
    await ctx.config.set(`${FOLDER_PREFIX}${instanceId}`, folder ?? null);
    listCache.clear();
    return { ok: true };
  });

  // One widget's photo list: ids only (loaded via /photo/:id). ?instance scopes
  // it to that widget's chosen folder.
  ctx.route("GET", "/photos", async ({ query }) => {
    const instance = (query as { instance?: string }).instance?.trim();
    const account = await getAccount(ctx.config);
    const folder = instance ? await getFolder(ctx.config, instance) : null;
    if (!account) return { ok: false, reason: "not-connected", photos: [] };
    if (!folder) return { ok: false, reason: "no-folder", photos: [] };
    try {
      return { ok: true, folder, photos: await photosFor(ctx.secrets, account, folder.id) };
    } catch (err) {
      return { ok: false, reason: "error", error: err instanceof Error ? err.message : String(err), photos: [] };
    }
  });

  // The screensaver's photo list: its own globally-chosen folder.
  ctx.route("GET", "/photos/screensaver", async () => {
    const account = await getAccount(ctx.config);
    const folder = await getFolder(ctx.config, SCREENSAVER_INSTANCE);
    if (!account) return { ok: false, reason: "not-connected", photos: [] };
    if (!folder) return { ok: false, reason: "no-folder", photos: [] };
    try {
      return { ok: true, folder, photos: await photosFor(ctx.secrets, account, folder.id) };
    } catch (err) {
      return { ok: false, reason: "error", error: err instanceof Error ? err.message : String(err), photos: [] };
    }
  });

  // Stream one image's bytes through the core (Drive needs an auth header, so
  // the browser can't load it directly). Cached by the browser for a day.
  ctx.route("GET", "/photo/:id", async ({ params }) => {
    const id = params.id;
    const account = await getAccount(ctx.config);
    if (!id || !account) return html("not found", 404);
    try {
      const accessToken = await accessTokenFor(ctx.secrets, account.id);
      const { bytes, contentType } = await downloadImage(accessToken, id);
      return binary(bytes, contentType, 200, { "cache-control": "private, max-age=86400" });
    } catch (err) {
      ctx.log.warn(`photo ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
      return html("image unavailable", 502);
    }
  });

  ctx.log.info("photos-drive backend ready");
});
