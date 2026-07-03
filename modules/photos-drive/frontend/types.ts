// Shared frontend shapes (mirror backend google.ts) + fetch helpers.

export interface PhotoRef {
  id: string;
  name: string;
}
export interface DriveFolder {
  id: string;
  name: string;
}
export interface DriveAccount {
  id: string;
  email: string;
  name: string;
}
export interface FolderEntry {
  id: string;
  name: string;
}
export interface OAuthStatus {
  configured: boolean;
  redirectUri: string;
  account: DriveAccount | null;
  /** The opened widget's folder (null when opened from the central hub). */
  folder: DriveFolder | null;
  /** The global screensaver folder. */
  screensaverFolder: DriveFolder | null;
}

// Reserved instance id under which the global screensaver folder is stored
// (kept in sync with the backend) — lets it reuse the per-widget folder picker.
export const SCREENSAVER_INSTANCE = "__screensaver__";

export interface PhotosResult {
  ok: boolean;
  reason?: "not-connected" | "no-folder" | "error";
  error?: string;
  folder?: DriveFolder;
  photos: PhotoRef[];
}
export interface PhotoConfig {
  intervalSec: number;
  screensaver: boolean;
  idleSec: number;
}

export const API = "/api/m/photos-drive";
export const CONFIG_DEFAULTS: PhotoConfig = { intervalSec: 8, screensaver: true, idleSec: 120 };

export const photoUrl = (id: string): string => `${API}/photo/${encodeURIComponent(id)}`;

/** One widget's photos (scoped to its instance's chosen folder). */
export async function fetchPhotos(instanceId: string): Promise<PhotosResult> {
  const r = await fetch(`${API}/photos?instance=${encodeURIComponent(instanceId)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<PhotosResult>;
}

/** The screensaver's photos (its own globally-chosen folder). */
export async function fetchScreensaverPhotos(): Promise<PhotosResult> {
  const r = await fetch(`${API}/photos/screensaver`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<PhotosResult>;
}

export async function fetchPhotoConfig(): Promise<PhotoConfig> {
  const r = await fetch(`${API}/config`);
  if (!r.ok) throw new Error(r.statusText);
  const c = (await r.json()) as Partial<PhotoConfig>;
  return { ...CONFIG_DEFAULTS, ...c };
}
