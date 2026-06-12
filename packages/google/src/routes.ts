import { html, redirect, type ModuleContext, type RawResponse, type RouteHandlerArgs } from "@hub/sdk";
import {
  authUrl,
  clearTokenCache,
  exchangeCode,
  getCreds,
  type TokenSet,
} from "./auth.js";

/*
 * The OAuth routes every Google module shares.
 *
 * Per feature module (calendar, tasks, photos):
 *   GET  /oauth/status   — is the client configured + the (shared) redirect URI
 *   PUT  /oauth/client   — store the per-deployment client id/secret (write-only)
 *   GET  /oauth/start    — 302 to Google's consent screen
 *
 * ONE shared callback for the whole hub, hosted by the tiny `google-oauth` module:
 *   GET  /api/m/google-oauth/callback
 *
 * Google needs only that single redirect URI registered. The callback figures
 * out which module started the flow from the OAuth `state` (`<module>:<csrf>`),
 * then runs that module's identify/onConnected against its OWN secret namespace —
 * so refresh tokens and scopes stay per-module (least privilege), even though the
 * redirect URI is shared. Modules supply only what genuinely differs: their
 * scopes, how to identify the account, and post-connect config bookkeeping.
 *
 * Disconnect stays per-module (the account shape differs) — use `revokeToken` +
 * `clearTokenCache` from `@hub/google` there.
 */

/** The module that hosts the single shared OAuth callback (see modules/google-oauth). */
export const GOOGLE_OAUTH_MODULE = "google-oauth";
const CALLBACK_PATH = "/callback";

const DEFAULT_REDIRECT_BASE = "http://localhost:4000";
const OAUTH_STATE_TTL_MS = 10 * 60_000;

export interface GoogleOAuthOptions<C = unknown> {
  /** OAuth scopes to request (the module's least-privilege set). */
  scopes: string[];
  /** Where this module's settings live, for the "configure the client first" copy
   *  (e.g. "calendar settings", "Photos settings"). */
  settingsLabel: string;
  /** Identify the account that just authorized, from its fresh access token. May
   *  carry data forward to `onConnected` to avoid a second API round-trip. */
  identify: (accessToken: string) => Promise<{ accountId: string; carry?: C }>;
  /** Module bookkeeping after the refresh token is stored: persist the account,
   *  snapshot its calendars/lists, set defaults, etc. */
  onConnected: (args: {
    accountId: string;
    accessToken: string;
    carry: C | undefined;
  }) => Promise<void>;
  /** Extra fields merged into `GET /oauth/status` (accounts, writeTarget, …). */
  statusExtra?: (args: RouteHandlerArgs) => Promise<Record<string, unknown>>;
}

// ── Process-global dispatch registry ─────────────────────────────────────────
// Each feature module registers itself here; the shared callback (in the `google`
// module) looks the originator up by the `state` it minted. Single process, so a
// plain module-level Map is the whole mechanism.

interface Registration {
  ctx: ModuleContext;
  scopes: string[];
  identify: (accessToken: string) => Promise<{ accountId: string; carry?: unknown }>;
  onConnected: (args: { accountId: string; accessToken: string; carry: unknown }) => Promise<void>;
  consumeState: (csrf: string) => boolean;
}

const registry = new Map<string, Registration>();

function redirectBaseUri(base: string | undefined): string {
  return `${(base ?? DEFAULT_REDIRECT_BASE).replace(/\/$/, "")}/api/m/${GOOGLE_OAUTH_MODULE}${CALLBACK_PATH}`;
}

/** The shared redirect URI for a module, derived from its `redirectBase` config. */
async function sharedRedirectUri(ctx: ModuleContext): Promise<string> {
  return redirectBaseUri(await ctx.config.get<string>("redirectBase"));
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** The page shown in the OAuth popup; closes itself on success. */
function oauthPage(message: string, ok: boolean): RawResponse {
  return html(`<!doctype html><html><head><meta charset="utf-8"><title>Family Hub</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1210;color:#f0e6dd;display:grid;place-items:center;height:100vh;margin:0}
.card{max-width:420px;text-align:center;padding:2rem}.ico{font-size:3rem}.msg{margin-top:1rem;line-height:1.5;color:#cbb7ad}</style></head>
<body><div class="card"><div class="ico">${ok ? "✅" : "⚠️"}</div><div class="msg">${escapeHtml(message)}</div></div>
<script>setTimeout(function(){window.close()}, ${ok ? 1500 : 6000})</script></body></html>`);
}

export function registerGoogleOAuthRoutes<C = unknown>(
  ctx: ModuleContext,
  opts: GoogleOAuthOptions<C>,
): void {
  // ── OAuth CSRF state (in-memory, this module's process only) ────────────────
  // Pruned opportunistically so abandoned consent attempts don't accumulate.
  const oauthStates = new Map<string, number>();

  function newState(): string {
    const now = Date.now();
    for (const [s, at] of oauthStates) {
      if (now - at >= OAUTH_STATE_TTL_MS) oauthStates.delete(s);
    }
    const s = crypto.randomUUID();
    oauthStates.set(s, now);
    return s;
  }

  function consumeState(csrf: string): boolean {
    const at = oauthStates.get(csrf);
    if (at === undefined) return false;
    oauthStates.delete(csrf);
    return Date.now() - at < OAUTH_STATE_TTL_MS;
  }

  registry.set(ctx.name, {
    ctx,
    scopes: opts.scopes,
    identify: opts.identify as Registration["identify"],
    onConnected: opts.onConnected as Registration["onConnected"],
    consumeState,
  });

  // Snapshot for the settings UI: is the client configured, the exact (shared)
  // redirect URI to register in Google Cloud, plus any module-specific extras.
  ctx.route("GET", "/oauth/status", async (args) => {
    const creds = await getCreds(ctx.secrets);
    return {
      configured: Boolean(creds),
      redirectUri: await sharedRedirectUri(ctx),
      ...(opts.statusExtra ? await opts.statusExtra(args) : {}),
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

  // Kick off consent: open this URL in a popup; it 302s to Google. The state
  // carries this module's name so the shared callback can route back to us.
  ctx.route("GET", "/oauth/start", async () => {
    const creds = await getCreds(ctx.secrets);
    if (!creds) {
      return oauthPage(`Add your Google Client ID and Secret in ${opts.settingsLabel} first.`, false);
    }
    const state = `${ctx.name}:${newState()}`;
    return redirect(authUrl(creds, await sharedRedirectUri(ctx), state, opts.scopes));
  });
}

/**
 * The single shared OAuth callback, wired up once by the `google` module. Parses
 * `state` (`<module>:<csrf>`), validates it against the originating module, then
 * exchanges the code and stores the refresh token in THAT module's secrets.
 */
export async function handleGoogleOAuthCallback(query: unknown): Promise<RawResponse> {
  const q = query as { code?: string; state?: string; error?: string };
  if (q.error) return oauthPage(`Google sign-in was cancelled (${q.error}).`, false);
  if (!q.code || !q.state) {
    return oauthPage("Invalid or expired sign-in attempt. Please try again.", false);
  }
  const sep = q.state.indexOf(":");
  const moduleName = sep >= 0 ? q.state.slice(0, sep) : "";
  const csrf = sep >= 0 ? q.state.slice(sep + 1) : "";
  const reg = registry.get(moduleName);
  if (!reg || !reg.consumeState(csrf)) {
    return oauthPage("Invalid or expired sign-in attempt. Please try again.", false);
  }
  try {
    const creds = await getCreds(reg.ctx.secrets);
    if (!creds) return oauthPage("Google client isn't configured.", false);
    const tokens: TokenSet = await exchangeCode(creds, await sharedRedirectUri(reg.ctx), q.code);

    const { accountId, carry } = await reg.identify(tokens.accessToken);

    if (tokens.refreshToken) {
      await reg.ctx.secrets.set(`refresh:${accountId}`, tokens.refreshToken);
    } else if (!(await reg.ctx.secrets.get<string>(`refresh:${accountId}`))) {
      return oauthPage(
        "Google didn't return a refresh token. Remove Family Hub at " +
          "myaccount.google.com/permissions, then reconnect.",
        false,
      );
    }
    clearTokenCache(reg.ctx.secrets, accountId);

    await reg.onConnected({ accountId, accessToken: tokens.accessToken, carry });

    return oauthPage(`Connected ${accountId}. You can close this window.`, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reg.ctx.log.warn(`oauth callback failed: ${message}`);
    return oauthPage(`Sign-in failed: ${message}`, false);
  }
}
