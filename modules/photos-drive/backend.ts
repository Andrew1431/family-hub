import { defineBackend, html, binary, type KVStore } from "@hub/sdk";
import {
  accessTokenFor,
  clearTokenCache,
  registerGoogleOAuthRoutes,
  revokeToken,
} from "@hub/google";
import {
  downloadImage,
  fetchAbout,
  listFolders,
  listImages,
  SCOPES,
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

// ── Backend ──────────────────────────────────────────────────────────────────

export default defineBackend((ctx) => {
  // The shared helper owns /oauth/status, /oauth/client and /oauth/start; the
  // single callback lives in the google-oauth module. Drive-specific bits:
  // identify the account via the Drive `about` endpoint and record it in config.
  // statusExtra adds the connected account + this widget's folder + the global
  // screensaver folder (account is global; folder is per-widget).
  registerGoogleOAuthRoutes<{ name: string }>(ctx, {
    scopes: SCOPES,
    settingsLabel: "Photos settings",
    identify: async (accessToken) => {
      const { email, name } = await fetchAbout(accessToken);
      return { accountId: email, carry: { name } };
    },
    onConnected: async ({ accountId, carry }) => {
      const account: DriveAccount = {
        id: accountId,
        email: accountId,
        name: carry?.name ?? accountId,
      };
      await ctx.config.set("account", account);
    },
    statusExtra: async ({ query }) => {
      const instance = (query as { instance?: string }).instance?.trim();
      return {
        account: await getAccount(ctx.config),
        folder: instance ? await getFolder(ctx.config, instance) : null,
        screensaverFolder: await getFolder(ctx.config, SCREENSAVER_INSTANCE),
      };
    },
  });

  // Disconnect: revoke the grant, drop the account + every widget's folder
  // (the ids are scoped to this account and become invalid once it's gone).
  ctx.route("DELETE", "/account", async () => {
    const account = await getAccount(ctx.config);
    if (account) {
      const refresh = await ctx.secrets.get<string>(`refresh:${account.id}`);
      if (refresh) await revokeToken(refresh);
      await ctx.secrets.delete(`refresh:${account.id}`);
      clearTokenCache(ctx.secrets, account.id);
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
