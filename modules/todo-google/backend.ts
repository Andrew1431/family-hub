import { defineBackend, html, redirect, type KVStore } from "@hub/sdk";
import {
  accessTokenFor,
  authUrl,
  clearTokenCache,
  deleteTask,
  deleteTaskList,
  exchangeCode,
  fetchTaskLists,
  fetchTasks,
  fetchUserInfo,
  getCreds,
  insertTask,
  insertTaskList,
  patchTask,
  renameTaskList,
  revokeToken,
  type GoogleAccount,
  type GoogleTaskList,
  type ResolvedList,
} from "./google";

/*
 * Tasks module — real Google Tasks over REST.
 *
 * "Groups" are Google task lists (Groceries, Chores, …). Lists themselves live
 * in one Google account; the intended setup is a single shared "family" account
 * both phones add in the Google Tasks app, so checking an item off anywhere
 * syncs everywhere. Google Tasks has no cross-account sharing, so we lean on the
 * shared-account approach rather than pretending lists can be shared.
 *
 * Config (non-secret) stores per-list local metadata (color, enabled) plus the
 * default list for quick-adds and the panel view mode. Task contents always come
 * live from Google; titles are Google's source of truth.
 */

interface DefaultList {
  accountId: string;
  listId: string;
}

type ViewMode = "stacked" | "tabs";

const DEFAULT_REDIRECT_BASE = "http://localhost:4000";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const PALETTE = [
  "#10b981", "#6366f1", "#ec4899", "#f59e0b",
  "#3b82f6", "#ef4444", "#14b8a6", "#a855f7",
];

// ── Config accessors (config is non-secret; tokens live in secrets) ───────────

async function getAccounts(config: KVStore): Promise<GoogleAccount[]> {
  const a = await config.get<GoogleAccount[]>("accounts");
  return Array.isArray(a) ? a : [];
}

async function getDefaultList(config: KVStore): Promise<DefaultList | null> {
  const d = await config.get<DefaultList>("defaultList");
  return d && d.accountId && d.listId ? d : null;
}

async function getViewMode(config: KVStore): Promise<ViewMode> {
  return (await config.get<ViewMode>("viewMode")) === "tabs" ? "tabs" : "stacked";
}

function redirectUriFrom(base: string | undefined): string {
  return `${(base ?? DEFAULT_REDIRECT_BASE).replace(/\/$/, "")}/api/m/todo-google/oauth/callback`;
}

// ── List metadata merge ───────────────────────────────────────────────────────
// Google owns the set of lists and their titles; the hub owns color/enabled.
// We recompute the merge on each read so freshly-created lists appear without a
// save, and deleted ones drop out.

function mergeLists(
  stored: GoogleTaskList[],
  live: { id: string; title: string }[],
): GoogleTaskList[] {
  return live.map((l, i) => {
    const prior = stored.find((s) => s.id === l.id);
    if (prior) return { ...prior, title: l.title };
    return { id: l.id, title: l.title, color: PALETTE[i % PALETTE.length]!, enabled: true };
  });
}

/** Connected accounts with their lists merged live from Google. Accounts whose
 *  token is dead are returned with their last-known lists so the UI can prompt a
 *  reconnect rather than silently dropping them. */
async function resolveAccounts(
  accounts: GoogleAccount[],
  secrets: KVStore,
  log: { warn(m: string, meta?: unknown): void },
): Promise<GoogleAccount[]> {
  return Promise.all(
    accounts.map(async (acct) => {
      try {
        const token = await accessTokenFor(secrets, acct.id);
        const live = await fetchTaskLists(token);
        return { ...acct, lists: mergeLists(acct.lists, live) };
      } catch (err) {
        log.warn(`tasks account "${acct.email}" auth failed: ${String(err)}`);
        return acct;
      }
    }),
  );
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
  // Resolved enabled lists with their tasks — the panel + assistant data source.
  async function collectLists(filterListId?: string): Promise<ResolvedList[]> {
    const accounts = await resolveAccounts(await getAccounts(ctx.config), ctx.secrets, ctx.log);
    const out: ResolvedList[] = [];
    for (const acct of accounts) {
      const lists = acct.lists.filter((l) => l.enabled && (!filterListId || l.id === filterListId));
      if (lists.length === 0) continue;
      let token: string;
      try {
        token = await accessTokenFor(ctx.secrets, acct.id);
      } catch {
        continue; // dead token; reconnect surfaces in settings
      }
      const resolved = await Promise.all(
        lists.map(async (l) => {
          try {
            return {
              id: l.id,
              accountId: acct.id,
              title: l.title,
              color: l.color,
              tasks: await fetchTasks(token, l.id),
            } satisfies ResolvedList;
          } catch (err) {
            ctx.log.warn(`tasks list "${l.title}" failed: ${String(err)}`);
            return { id: l.id, accountId: acct.id, title: l.title, color: l.color, tasks: [] };
          }
        }),
      );
      out.push(...resolved);
    }
    return out;
  }

  // Resolve where a quick-add lands. Priority: explicit listId → named list
  // (case-insensitive, exact title then substring) → configured default →
  // first enabled list. Returns the resolved title so callers can confirm
  // which list the task actually landed in.
  async function resolveAddTarget(opts: {
    listId?: string;
    listName?: string;
  }): Promise<(DefaultList & { title: string }) | null> {
    const accounts = await getAccounts(ctx.config);
    const titleOf = (accountId: string, listId: string) =>
      accounts.find((a) => a.id === accountId)?.lists.find((l) => l.id === listId)?.title ?? "";

    if (opts.listId) {
      const acct = accounts.find((a) => a.lists.some((l) => l.id === opts.listId));
      if (acct) return { accountId: acct.id, listId: opts.listId, title: titleOf(acct.id, opts.listId) };
      // Unknown list id — fall through (may be a brand-new list).
    }

    if (opts.listName) {
      const needle = opts.listName.trim().toLowerCase();
      const candidates = accounts.flatMap((a) =>
        a.lists.filter((l) => l.enabled).map((l) => ({ accountId: a.id, list: l })),
      );
      const match =
        candidates.find((c) => c.list.title.toLowerCase() === needle) ??
        candidates.find((c) => c.list.title.toLowerCase().includes(needle));
      if (match) return { accountId: match.accountId, listId: match.list.id, title: match.list.title };
      // Named list not found — fall through to the default rather than failing.
    }

    const def = await getDefaultList(ctx.config);
    if (def) return { ...def, title: titleOf(def.accountId, def.listId) };
    for (const acct of accounts) {
      const first = acct.lists.find((l) => l.enabled);
      if (first) return { accountId: acct.id, listId: first.id, title: first.title };
    }
    return null;
  }

  // Find which account owns a given list id.
  async function locateList(listId: string): Promise<string | null> {
    const accounts = await getAccounts(ctx.config);
    return accounts.find((a) => a.lists.some((l) => l.id === listId))?.id ?? null;
  }

  // Find a task's (accountId, listId) by scanning every enabled list's tasks.
  async function locateTask(taskId: string): Promise<DefaultList | null> {
    for (const list of await collectLists()) {
      if (list.tasks.some((t) => t.id === taskId)) {
        return { accountId: list.accountId, listId: list.id };
      }
    }
    return null;
  }

  async function addTask(input: {
    title: string;
    notes?: string;
    due?: string;
    listId?: string;
    listName?: string;
  }): Promise<{ ok: boolean; id?: string; list?: string; message?: string }> {
    const target = await resolveAddTarget({
      ...(input.listId ? { listId: input.listId } : {}),
      ...(input.listName ? { listName: input.listName } : {}),
    });
    if (!target) {
      return {
        ok: false,
        message:
          "No task list is available. Connect your Google account and create or " +
          "enable a list in to-do settings first.",
      };
    }
    const token = await accessTokenFor(ctx.secrets, target.accountId);
    const task = await insertTask(token, target.listId, {
      title: input.title,
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.due ? { due: input.due } : {}),
    });
    return { ok: true, id: task.id, list: target.title };
  }

  // ── Capabilities (exposed to the assistant) ────────────────────────────────

  // Ambient context: tell the assistant which lists exist (+ IDs and the
  // default) so it can target the right one without a tool round-trip. Read
  // from stored config — cheap, no Google call — since list membership is what
  // matters here, not the live task contents.
  ctx.capabilities.registerContext(async () => {
    const accounts = await getAccounts(ctx.config);
    const def = await getDefaultList(ctx.config);
    const lists = accounts.flatMap((a) =>
      a.lists
        .filter((l) => l.enabled)
        .map((l) => `${l.title} (id: ${l.id}${def && def.listId === l.id ? ", default" : ""})`),
    );
    if (lists.length === 0) return undefined;
    return `To-do lists available: ${lists.join("; ")}. When adding to a named list, pass its listName or listId to todo_add_task.`;
  });

  ctx.capabilities.register({
    name: "todo_list_tasks",
    description:
      "List the family's to-do lists and their tasks (e.g. groceries, chores). " +
      "Each list includes its name and the tasks within, with completion status " +
      "and any due date.",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string", description: "Optional task list ID to filter by." },
      },
      additionalProperties: false,
    },
    annotations: { readOnly: true },
    handler: (input: { listId?: string }) => collectLists(input.listId),
  });

  ctx.capabilities.register({
    name: "todo_add_task",
    description:
      "Add a task to a to-do list. Use this for groceries, errands, and reminders. " +
      "If the user names a specific list (e.g. 'add milk to my grocery list'), pass " +
      "listName with that name — it's matched case-insensitively against the family's " +
      "lists (call todo_list_tasks first if you're unsure which lists exist). With no " +
      "list named, it lands in the family's default list. The result's `list` field " +
      "is the list the task actually landed in — use it to confirm.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the task is, e.g. 'Buy milk'." },
        notes: { type: "string", description: "Optional extra details." },
        due: { type: "string", description: "Optional due date as YYYY-MM-DD (date only)." },
        listName: {
          type: "string",
          description:
            "Optional list name to target, e.g. 'Groceries'. Matched case-insensitively " +
            "against existing list titles; falls back to the default list if no match.",
        },
        listId: { type: "string", description: "Optional exact task list ID (overrides listName)." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (input: {
      title: string;
      notes?: string;
      due?: string;
      listId?: string;
      listName?: string;
    }) => {
      try {
        return await addTask(input);
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  ctx.capabilities.register({
    name: "todo_complete_task",
    description: "Mark a task as done (checked off) by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The task ID to complete." },
        listId: { type: "string", description: "Optional list ID the task is in (found automatically if omitted)." },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: { taskId: string; listId?: string }) => {
      try {
        const loc = input.listId ? await locateList(input.listId).then((accountId) =>
          accountId ? { accountId, listId: input.listId! } : null,
        ) : await locateTask(input.taskId);
        if (!loc) return { ok: false, message: "Task not found." };
        const token = await accessTokenFor(ctx.secrets, loc.accountId);
        await patchTask(token, loc.listId, input.taskId, { status: "completed" });
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  ctx.capabilities.register({
    name: "todo_create_list",
    description: "Create a new to-do list (e.g. a new shopping list or project).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Name of the new list." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { requiresConfirmation: true },
    handler: async (input: { title: string }) => {
      try {
        const accounts = await getAccounts(ctx.config);
        const acct = accounts[0];
        if (!acct) return { ok: false, message: "No Google account connected." };
        const token = await accessTokenFor(ctx.secrets, acct.id);
        const created = await insertTaskList(token, input.title.trim());
        return { ok: true, id: created.id };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ── Panel routes ───────────────────────────────────────────────────────────

  ctx.route("GET", "/tasks", async () => ({
    viewMode: await getViewMode(ctx.config),
    lists: await collectLists(),
  }));

  ctx.route("POST", "/tasks", async ({ body }) => {
    const b = body as { title?: string; notes?: string; due?: string; listId?: string } | undefined;
    if (!b?.title?.trim()) return { ok: false, message: "title is required" };
    try {
      return await addTask({
        title: b.title.trim(),
        ...(b.notes ? { notes: b.notes } : {}),
        ...(b.due ? { due: b.due } : {}),
        ...(b.listId ? { listId: b.listId } : {}),
      });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Toggle completion (completed:true marks done, false re-opens).
  ctx.route("POST", "/tasks/complete", async ({ body }) => {
    const b = body as { listId?: string; taskId?: string; completed?: boolean } | undefined;
    if (!b?.taskId) return { ok: false, message: "taskId is required" };
    try {
      const accountId = b.listId ? await locateList(b.listId) : null;
      const loc = accountId && b.listId ? { accountId, listId: b.listId } : await locateTask(b.taskId);
      if (!loc) return { ok: false, message: "Task not found." };
      const token = await accessTokenFor(ctx.secrets, loc.accountId);
      await patchTask(token, loc.listId, b.taskId, {
        status: b.completed === false ? "needsAction" : "completed",
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ctx.route("DELETE", "/tasks/:listId/:taskId", async ({ params }) => {
    const { listId, taskId } = params;
    if (!listId || !taskId) return { ok: false, message: "listId and taskId are required" };
    try {
      const accountId = await locateList(listId);
      if (!accountId) return { ok: false, message: "List not found." };
      const token = await accessTokenFor(ctx.secrets, accountId);
      await deleteTask(token, listId, taskId);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── List management ─────────────────────────────────────────────────────────

  ctx.route("POST", "/lists", async ({ body }) => {
    const b = body as { title?: string; accountId?: string } | undefined;
    if (!b?.title?.trim()) return { ok: false, message: "title is required" };
    try {
      const accounts = await getAccounts(ctx.config);
      const acct = (b.accountId ? accounts.find((a) => a.id === b.accountId) : accounts[0]);
      if (!acct) return { ok: false, message: "No Google account connected." };
      const token = await accessTokenFor(ctx.secrets, acct.id);
      const created = await insertTaskList(token, b.title.trim());
      return { ok: true, id: created.id };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ctx.route("PATCH", "/lists/:id", async ({ params, body }) => {
    const id = params.id;
    const title = (body as { title?: string } | undefined)?.title?.trim();
    if (!id || !title) return { ok: false, message: "id and title are required" };
    try {
      const accountId = await locateList(id);
      if (!accountId) return { ok: false, message: "List not found." };
      const token = await accessTokenFor(ctx.secrets, accountId);
      await renameTaskList(token, id, title);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ctx.route("DELETE", "/lists/:id", async ({ params }) => {
    const id = params.id;
    if (!id) return { ok: false, message: "id is required" };
    try {
      const accountId = await locateList(id);
      if (!accountId) return { ok: false, message: "List not found." };
      const token = await accessTokenFor(ctx.secrets, accountId);
      await deleteTaskList(token, id);
      // Drop local metadata + clear default if it pointed here.
      const accounts = await getAccounts(ctx.config);
      await ctx.config.set(
        "accounts",
        accounts.map((a) =>
          a.id === accountId ? { ...a, lists: a.lists.filter((l) => l.id !== id) } : a,
        ),
      );
      const def = await getDefaultList(ctx.config);
      if (def?.listId === id) await ctx.config.set("defaultList", null);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Google OAuth + account/list settings ────────────────────────────────────

  ctx.route("GET", "/oauth/status", async () => {
    const creds = await getCreds(ctx.secrets);
    const redirectBase = await ctx.config.get<string>("redirectBase");
    return {
      configured: Boolean(creds),
      redirectUri: redirectUriFrom(redirectBase),
      accounts: await resolveAccounts(await getAccounts(ctx.config), ctx.secrets, ctx.log),
      defaultList: await getDefaultList(ctx.config),
      viewMode: await getViewMode(ctx.config),
    };
  });

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

  ctx.route("GET", "/oauth/start", async () => {
    const creds = await getCreds(ctx.secrets);
    if (!creds) {
      return html(oauthPage("Add your Google Client ID and Secret in to-do settings first.", false));
    }
    const redirectBase = await ctx.config.get<string>("redirectBase");
    return redirect(authUrl(creds, redirectUriFrom(redirectBase), newState()));
  });

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

      const info = await fetchUserInfo(tokens.accessToken);
      const accountId = info.email;

      if (tokens.refreshToken) {
        await ctx.secrets.set(`refresh:${accountId}`, tokens.refreshToken);
      } else if (!(await ctx.secrets.get<string>(`refresh:${accountId}`))) {
        return html(
          oauthPage(
            "Google didn't return a refresh token. Remove Family Hub at " +
              "myaccount.google.com/permissions, then reconnect.",
            false,
          ),
        );
      }

      const live = await fetchTaskLists(tokens.accessToken);
      const accounts = await getAccounts(ctx.config);
      const prior = accounts.find((a) => a.id === accountId);
      const account: GoogleAccount = {
        id: accountId,
        email: accountId,
        name: info.name,
        lists: mergeLists(prior?.lists ?? [], live),
      };
      const next = prior
        ? accounts.map((a) => (a.id === accountId ? account : a))
        : [...accounts, account];
      await ctx.config.set("accounts", next);

      // Default the first list for quick-adds if nothing is chosen yet.
      if (!(await getDefaultList(ctx.config))) {
        const first = account.lists.find((l) => l.enabled);
        if (first) await ctx.config.set("defaultList", { accountId, listId: first.id });
      }
      clearTokenCache(accountId);
      return html(oauthPage(`Connected ${accountId}. You can close this window.`, true));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.log.warn(`oauth callback failed: ${message}`);
      return html(oauthPage(`Sign-in failed: ${message}`, false));
    }
  });

  // Persist list color/visibility choices, default list, and view mode.
  ctx.route("PUT", "/accounts", async ({ body }) => {
    const b = body as
      | { accounts?: GoogleAccount[]; defaultList?: DefaultList | null; viewMode?: ViewMode }
      | undefined;
    if (Array.isArray(b?.accounts)) await ctx.config.set("accounts", b.accounts);
    if (b && "defaultList" in b) await ctx.config.set("defaultList", b.defaultList ?? null);
    if (b?.viewMode) await ctx.config.set("viewMode", b.viewMode === "tabs" ? "tabs" : "stacked");
    return { ok: true };
  });

  ctx.route("DELETE", "/accounts/:id", async ({ params }) => {
    const id = params.id;
    if (!id) return { ok: false, error: "missing account id" };
    const refresh = await ctx.secrets.get<string>(`refresh:${id}`);
    if (refresh) await revokeToken(refresh);
    await ctx.secrets.delete(`refresh:${id}`);
    clearTokenCache(id);
    const accounts = await getAccounts(ctx.config);
    await ctx.config.set("accounts", accounts.filter((a) => a.id !== id));
    const def = await getDefaultList(ctx.config);
    if (def?.accountId === id) await ctx.config.set("defaultList", null);
    return { ok: true };
  });

  ctx.log.info("todo-google backend ready (Google Tasks)");
});
