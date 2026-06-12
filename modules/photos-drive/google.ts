/*
 * Google Drive over raw REST (no googleapis dep, matching the calendar module).
 *
 * Auth/token plumbing (creds, the OAuth flow, the access-token cache) lives in
 * the shared `@hub/google` package; this file is the Drive REST surface only.
 *
 * Scope is `drive.readonly` (restricted tier) — we browse folders, list images,
 * and stream their bytes through the core, so the UI never holds a Google token.
 */

export const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

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
