import type { KVStore } from "@hub/sdk";

/*
 * Google Drive over raw REST (no googleapis dep, matching the calendar module).
 *
 * Auth: standard OAuth2 authorization-code flow against the SAME shared hub
 * client as every other Google module. One Drive account is connected at a time;
 * its refresh token lives in this module's own secret namespace and is never
 * sent to the UI. Access tokens are short-lived and cached in memory.
 *
 * Scope is `drive.readonly` (restricted tier) — we browse folders, list images,
 * and stream their bytes through the core, so the UI never holds a Google token.
 */

export const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";

// ── Stored shapes (config is non-secret; tokens live in secrets) ─────────────

/** The connected Drive account, as stored in config. */
export interface DriveAccount {
  id: string; // primary email
  email: string;
  name: string;
}

/** The chosen source folder, as stored in config. */
export interface DriveFolder {
  id: string;
  name: string;
}

/** A folder entry while browsing the picker. */
export interface FolderEntry {
  id: string;
  name: string;
}

/** An image file in the chosen folder (what the panel cycles through). */
export interface PhotoRef {
  id: string;
  name: string;
}

// ── Credentials ──────────────────────────────────────────────────────────────

export interface Creds {
  clientId: string;
  clientSecret: string;
}

export async function getCreds(secrets: KVStore): Promise<Creds | null> {
  const clientId = await secrets.get<string>("clientId");
  const clientSecret = await secrets.get<string>("clientSecret");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// ── OAuth flow ───────────────────────────────────────────────────────────────

export function authUrl(creds: Creds, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // we want a refresh token
    prompt: "consent", // force refresh_token issuance on re-connect
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export async function exchangeCode(
  creds: Creds,
  redirectUri: string,
  code: string,
): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: j.access_token,
    expiresIn: j.expires_in,
    ...(j.refresh_token ? { refreshToken: j.refresh_token } : {}),
  };
}

// ── Access-token cache + refresh ─────────────────────────────────────────────

const accessCache = new Map<string, { token: string; exp: number }>();

/** A refresh-token failure (revoked/expired) — the account must reconnect. */
export class AccountAuthError extends Error {}

export async function accessTokenFor(secrets: KVStore, accountId: string): Promise<string> {
  const cached = accessCache.get(accountId);
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;

  const creds = await getCreds(secrets);
  if (!creds) throw new Error("Google client is not configured");
  const refreshToken = await secrets.get<string>(`refresh:${accountId}`);
  if (!refreshToken) throw new AccountAuthError(`account ${accountId} is not connected`);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 || res.status === 401) {
      throw new AccountAuthError(`refresh failed for ${accountId}: ${text}`);
    }
    throw new Error(`refresh failed for ${accountId}: ${res.status} ${text}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  accessCache.set(accountId, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export function clearTokenCache(accountId: string): void {
  accessCache.delete(accountId);
}

// ── Drive REST ────────────────────────────────────────────────────────────────

/** Identify the connected account (email + name) for display + keying. */
export async function fetchAbout(
  accessToken: string,
): Promise<{ email: string; name: string }> {
  const res = await fetch(`${API}/about?fields=user(emailAddress,displayName)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`about failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { user?: { emailAddress?: string; displayName?: string } };
  const email = j.user?.emailAddress ?? "unknown";
  return { email, name: j.user?.displayName ?? email };
}

interface RawFile {
  id: string;
  name: string;
  mimeType?: string;
}

/** Child folders of `parentId` ("root" for My Drive), for the browsable picker. */
export async function listFolders(
  accessToken: string,
  parentId: string,
): Promise<FolderEntry[]> {
  const q =
    `'${parentId}' in parents and ` +
    "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const p = new URLSearchParams({
    q,
    fields: "files(id,name)",
    orderBy: "name",
    pageSize: "200",
    // Surface folders from Shared Drives + shared-with-me, not just My Drive.
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`${API}/files?${p.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`listFolders failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { files?: RawFile[] };
  return (j.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

/** All image files directly inside `folderId`, paging until exhausted. */
export async function listImages(
  accessToken: string,
  folderId: string,
): Promise<PhotoRef[]> {
  const out: PhotoRef[] = [];
  let pageToken: string | undefined;
  do {
    const q =
      `'${folderId}' in parents and ` +
      "mimeType contains 'image/' and trashed = false";
    const p = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name)",
      orderBy: "name",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(`${API}/files?${p.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`listImages failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { files?: RawFile[]; nextPageToken?: string };
    for (const f of j.files ?? []) out.push({ id: f.id, name: f.name });
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

/** Download one image's bytes + content type, for proxying through the core. */
export async function downloadImage(
  accessToken: string,
  fileId: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(
    `${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`download failed: ${res.status} ${await res.text()}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType };
}

/** Best-effort token revocation when disconnecting. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch {
    /* ignore — we still drop our local copy */
  }
}
