import type { KVStore } from "@hub/sdk";

/*
 * Shared Google OAuth2 + token core for every Google-backed module.
 *
 * ONE client_id/secret per deployment (the hub's app identity) lives in each
 * module's secret store via the shared `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
 * env aliases. Each connected account's refresh token stays in the CALLING
 * module's own secret namespace (least-privilege scopes, one connect per module).
 * Access tokens are short-lived and cached in memory.
 *
 * Scopes are passed in per module — this file is auth plumbing only; the REST
 * calls (calendar/tasks/drive) live in each module's own `google.ts`.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

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

export function authUrl(
  creds: Creds,
  redirectUri: string,
  state: string,
  scopes: string[],
): string {
  const p = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
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
// The cache is namespaced by the calling module's secret store: the same account
// (email) can be connected in two modules with different scopes/refresh tokens,
// so keying by accountId alone would cross the streams. A WeakMap keyed by the
// per-module `secrets` instance keeps each module's tokens separate.

const cachesBySecrets = new WeakMap<KVStore, Map<string, { token: string; exp: number }>>();

function cacheFor(secrets: KVStore): Map<string, { token: string; exp: number }> {
  let m = cachesBySecrets.get(secrets);
  if (!m) {
    m = new Map();
    cachesBySecrets.set(secrets, m);
  }
  return m;
}

/** A refresh-token failure (revoked/expired) — the account must reconnect. */
export class AccountAuthError extends Error {}

export async function accessTokenFor(secrets: KVStore, accountId: string): Promise<string> {
  const cache = cacheFor(secrets);
  const cached = cache.get(accountId);
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
  cache.set(accountId, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export function clearTokenCache(secrets: KVStore, accountId: string): void {
  cacheFor(secrets).delete(accountId);
}

/** Best-effort token revocation when disconnecting an account. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    /* ignore — we still drop our local copy */
  }
}
