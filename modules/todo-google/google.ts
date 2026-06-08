import type { KVStore } from "@hub/sdk";

/*
 * Google Tasks over raw REST (no googleapis dep), mirroring the calendar module.
 *
 * Auth: standard OAuth2 authorization-code flow against the SAME shared client
 * (the hub's app identity) as every other Google module. The client_id/secret
 * live in secrets via the manifest's secretEnv aliases; each connected account's
 * refresh token is stored per-account in THIS module's secret namespace and never
 * sent to the UI. Access tokens are short-lived and cached in memory.
 *
 * Unlike calendar, a task list carries no owner email, so we add the
 * userinfo.email scope and read the userinfo endpoint once at connect to learn
 * which account we just linked.
 */

export const SCOPES = [
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/userinfo.email",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const API = "https://tasks.googleapis.com/tasks/v1";

// ── Stored shapes (config is non-secret) ─────────────────────────────────────

/** A task list the user can show, as stored in config (non-secret). */
export interface GoogleTaskList {
  id: string;
  title: string;
  color: string;
  enabled: boolean;
}

/** A connected Google account, as stored in config (non-secret). */
export interface GoogleAccount {
  id: string; // the account's email
  email: string;
  name: string;
  lists: GoogleTaskList[];
}

// ── Resolved shapes (sent to the panel) ──────────────────────────────────────

export interface ResolvedTask {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  notes?: string;
  due?: string; // YYYY-MM-DD (date-only; Google Tasks ignores time)
  completed?: string; // RFC3339 timestamp
}

export interface ResolvedList {
  id: string;
  accountId: string;
  title: string;
  color: string;
  tasks: ResolvedTask[];
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

/** Identify the just-connected account from its access token. */
export async function fetchUserInfo(
  accessToken: string,
): Promise<{ email: string; name: string }> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { email?: string; name?: string };
  const email = j.email ?? "unknown";
  return { email, name: j.name ?? email };
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

// ── Tasks REST ────────────────────────────────────────────────────────────────

interface RawTaskList {
  id: string;
  title: string;
}

/** Enumerate the account's task lists (titles are Google's source of truth). */
export async function fetchTaskLists(
  accessToken: string,
): Promise<{ id: string; title: string }[]> {
  const res = await fetch(`${API}/users/@me/lists?maxResults=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`lists failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { items?: RawTaskList[] };
  return (j.items ?? []).map((it) => ({ id: it.id, title: it.title }));
}

interface RawTask {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
  completed?: string;
  deleted?: boolean;
}

/** RFC3339 (e.g. "2026-06-08T00:00:00.000Z") → "YYYY-MM-DD". Google Tasks stores
 *  due as a date only; slicing the date portion avoids any timezone drift. */
function dueDateOnly(due: string): string {
  return due.slice(0, 10);
}

function mapTask(it: RawTask): ResolvedTask | null {
  if (it.deleted) return null;
  return {
    id: it.id,
    title: it.title || "(untitled)",
    status: it.status === "completed" ? "completed" : "needsAction",
    ...(it.notes ? { notes: it.notes } : {}),
    ...(it.due ? { due: dueDateOnly(it.due) } : {}),
    ...(it.completed ? { completed: it.completed } : {}),
  };
}

/** Fetch tasks in one list, including completed/hidden so we can show them. */
export async function fetchTasks(accessToken: string, listId: string): Promise<ResolvedTask[]> {
  const p = new URLSearchParams({
    showCompleted: "true",
    showHidden: "true",
    maxResults: "100",
  });
  const res = await fetch(`${API}/lists/${encodeURIComponent(listId)}/tasks?${p.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`tasks failed for ${listId}: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { items?: RawTask[] };
  return (j.items ?? []).map(mapTask).filter((t): t is ResolvedTask => t !== null);
}

/** Create a task. `due` is a YYYY-MM-DD string; sent at UTC midnight. */
export async function insertTask(
  accessToken: string,
  listId: string,
  task: { title: string; notes?: string; due?: string },
): Promise<ResolvedTask> {
  const body: Record<string, unknown> = { title: task.title };
  if (task.notes) body.notes = task.notes;
  if (task.due) body.due = `${task.due}T00:00:00.000Z`;
  const res = await fetch(`${API}/lists/${encodeURIComponent(listId)}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`insert task failed: ${res.status} ${await res.text()}`);
  const mapped = mapTask((await res.json()) as RawTask);
  if (!mapped) throw new Error("insert task returned a deleted task");
  return mapped;
}

/** Patch a task: toggle completion and/or change due/title. Clearing `due`
 *  requires sending null (an empty patch leaves it untouched). */
export async function patchTask(
  accessToken: string,
  listId: string,
  taskId: string,
  fields: { status?: "needsAction" | "completed"; title?: string; due?: string | null },
): Promise<ResolvedTask> {
  const body: Record<string, unknown> = {};
  if (fields.status) {
    body.status = fields.status;
    // Re-opening a task: clear the completion stamp so it leaves the done pile.
    if (fields.status === "needsAction") body.completed = null;
  }
  if (fields.title !== undefined) body.title = fields.title;
  if (fields.due !== undefined) body.due = fields.due ? `${fields.due}T00:00:00.000Z` : null;
  const res = await fetch(
    `${API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`patch task failed: ${res.status} ${await res.text()}`);
  const mapped = mapTask((await res.json()) as RawTask);
  if (!mapped) throw new Error("patch task returned a deleted task");
  return mapped;
}

export async function deleteTask(
  accessToken: string,
  listId: string,
  taskId: string,
): Promise<void> {
  const res = await fetch(
    `${API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete task failed: ${res.status} ${await res.text()}`);
  }
}

export async function insertTaskList(accessToken: string, title: string): Promise<{ id: string; title: string }> {
  const res = await fetch(`${API}/users/@me/lists`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`create list failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as RawTaskList;
  return { id: j.id, title: j.title };
}

export async function renameTaskList(
  accessToken: string,
  listId: string,
  title: string,
): Promise<void> {
  const res = await fetch(`${API}/users/@me/lists/${encodeURIComponent(listId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`rename list failed: ${res.status} ${await res.text()}`);
}

export async function deleteTaskList(accessToken: string, listId: string): Promise<void> {
  const res = await fetch(`${API}/users/@me/lists/${encodeURIComponent(listId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete list failed: ${res.status} ${await res.text()}`);
  }
}

/** Best-effort token revocation when disconnecting an account. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch {
    /* ignore — we still drop our local copy */
  }
}
