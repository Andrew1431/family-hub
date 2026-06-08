# Family Hub

An open-source, modular **smart-mirror / family dashboard** for a wall-mounted display
(target: Raspberry Pi + SSD, but develops on any machine). Each panel — clock, weather,
calendar, to-dos, AI assistant — is a self-contained **module** loaded dynamically by a
small core. The visual style is warm and "hearth"-like (copper on dark brown, serif
accents), not a typical dark-mode dashboard. Design north star: `SAMPLE_UI.jsx` (a
single-file React mock kept for reference only — **not** wired into the app).

See `PROJECT_PLAN.md` for the original intent.

## Stack (and non-negotiables)

- **pnpm workspaces** monorepo. Node for dev; **Bun** is the intended Pi production runtime.
- Backend: **Fastify** + **`node:sqlite`** (Node's built-in SQLite — no native deps; `bun:sqlite`
  is the prod seam) + WebSockets. **Not Next.js.**
- Frontend: **React 19** + **Vite** + **Tailwind v4** (CSS-first `@source`, no JS config) +
  **daisyUI v5**. Self-hosted fonts via `@fontsource` (offline Pi).
- TypeScript everywhere, strict, including `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess` — see Gotchas.

## Layout

```
packages/
  sdk/      @hub/sdk   — contracts only (manifest, context, capability, http helpers).
                         Consumed as BUILT dist (package.json main=./dist) → rebuild after edits.
  core/     @hub/core  — Fastify server, module loader, capability registry, event bus,
                         sqlite KV stores, env loader, /api + /ws.
  ui/       @hub/ui    — React shell: fetches manifests/layout, places panels, owns chrome
                         (Header, DashboardGrid, SettingsModal, ChatModal, AssistantOrb).
  tooling/  @hub/tooling — seed.mjs (template→local config seeder), gen-modules.mjs
                         (scans modules/ → writes ui/src/modules.generated.ts).
modules/    clock, weather, calendar-google, todo-google, assistant — each a mini-package
            with manifest.ts (+ backend.ts and/or frontend.tsx, config.template.json).
config/     *.template.* (committed defaults) + *.local.* (gitignored, seeded on first run).
data/       hub.sqlite (runtime DB; gitignored).
```

## Commands

```bash
pnpm dev          # runs core (tsx watch :4000) + ui (vite :5173) together
pnpm build        # builds every package
pnpm typecheck    # tsc --noEmit across the workspace
pnpm seed         # copy any missing config/*.template.* → *.local.*

# single targets:
pnpm --filter @hub/sdk build         # REQUIRED after editing the SDK (consumers use dist)
pnpm --filter @hub/ui build
pnpm exec tsc -p modules/<name>/tsconfig.json   # typecheck one module
```

- **Dev URLs:** UI at `http://localhost:5173`; it **proxies `/api` and `/ws` to core `:4000`**
  (`packages/ui/vite.config.ts`). Hit core directly for backend checks (e.g.
  `curl localhost:4000/api/health`).
- `pnpm --filter @hub/ui dev` has a `predev` that runs `seed.mjs` + `gen-modules.mjs`, so
  module panels are auto-registered. If you add a module and the panel doesn't appear,
  re-run `node packages/tooling/gen-modules.mjs` (or restart the ui dev server).
- **`.env` is read only at core boot.** `tsx watch` does NOT watch `.env` (it isn't imported),
  so after editing `.env` you must **restart core** for new secrets to take effect.

## The module system

A module is a folder under `modules/` with a `manifest.ts` and optionally a backend and/or
frontend. The loader (`packages/core/src/loader.ts`) discovers them at boot.

- **manifest.ts** (`ModuleManifest`): `name` (url-safe id, also route prefix + layout key),
  `title`, `version`, `defaultSize`, `hasBackend`, `hasFrontend`, `surface` ("panel" frosted
  card default | "bare"), `requires?.{secrets,config}` (boot warns, never throws),
  `secretEnv?` (secret-key → shared env-var alias).
- **backend.ts**: `export default defineBackend((ctx) => { … })`. Runs once at mount. Register
  routes (`ctx.route`), capabilities (`ctx.capabilities.register`), bus subscriptions. Mounted
  under `/api/m/<name>`. `ctx` gives `{ name, log, config, secrets, bus, capabilities, route }`.
- **frontend.tsx**: `export default defineModule({ manifest, Panel, Settings? })`. `Panel` is the
  card body (the grid provides the frosted shell unless `surface:"bare"`). `Settings?` (optional)
  is a custom settings component — the shell renders a **cog** on the card (visible only on
  hover/keyboard-focus) that opens it in the core-owned `SettingsModal`. No cog if no `Settings`.

### Routing notes
- Handlers receive `{ params, query, body }` and return a value → JSON. To send a raw response
  (HTML page, redirect) return `html(...)` / `redirect(...)` from `@hub/sdk` (see `sdk/src/http.ts`).
- The core owns a generic `GET/PUT /api/m/:name/config` over the module's config store
  (non-secret values only). **A module must NOT define its own `/config` route** — it collides.

## Capability / AI system (the spine)

One primitive: a **Capability** `{ name, description, inputSchema, handler, annotations? }`
registered into a shared `CapabilityRegistry` (via `ctx.capabilities`). Anthropic tool-use defs
and MCP tool defs have the same shape, so a capability projects to both. The **assistant** module
is generic: it reads the whole registry (`toAnthropicTools()`), so **any module that registers a
capability instantly extends what the AI can do** — the assistant has zero module-specific code.
Its system prompt is built dynamically from the live tool list (no hardcoded feature names).

- Assistant backend: `modules/assistant/backend.ts` — Claude proxy with a manual tool-use loop.
  Default model `claude-sonnet-4-6`, effort `low` (cheap; both overridable via `ctx.config`).
  API key via `ANTHROPIC_API_KEY`. **API billing only** — consumer Pro/Max can't power it (ToS).
- Roadmap: P1 in-process tool-use (now) → P2 expose registry as an MCP server → P3 consume
  external MCP servers declared by modules.

## Config vs Secrets

Two separate stores, both in `packages/core/src/stores.ts`:

- **Config** (`ctx.config`, non-secret): resolution = **DB override → file defaults**. Defaults come
  from merging `config.template.json` (committed) + `config.local.json` (gitignored). Writes go to
  the sqlite DB, so a Settings UI persists without rewriting the user's file. Exposed to the UI via
  the generic `/config` endpoint.
- **Secrets** (`ctx.secrets`, never sent to UI): resolution = **`HUB_<MODULE>_<KEY>` env → `secretEnv`
  alias env → sqlite secret store**. Repo-root `.env` (gitignored) is loaded at boot by
  `core/src/env.ts`. **Never** put secret values in committed/template files — only `.env.example`
  documents the NAMES.

### Shared Google client
All Google modules share ONE OAuth client (the hub's app identity): `.env` `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`, wired via each module's `secretEnv` alias (`clientId`→`GOOGLE_CLIENT_ID`,
etc.). Per-account **refresh tokens stay per-module** (each module's own secret ns, least-privilege
scopes), so each account connects once per Google module. See `modules/calendar-google/google.ts`.

## Adding a module (recipe)

1. `modules/<name>/` with `package.json` (`@hub-module/<name>`, deps `@hub/sdk: workspace:*`,
   `react` peer), `tsconfig.json` (extends `../../tsconfig.base.json`, include your files).
2. `manifest.ts` exporting a `ModuleManifest` (set `hasBackend`/`hasFrontend`).
3. `backend.ts` (`defineBackend`) and/or `frontend.tsx` (`defineModule`).
4. `config.template.json` for any settings defaults.
5. `pnpm install` (if new deps), then restart `pnpm dev` (predev regenerates `modules.generated.ts`).
6. Typecheck the module, then verify against live endpoints (`curl localhost:4000/api/m/<name>/...`).

## Conventions & gotchas

- **Lean deps.** Prefer raw `fetch` over heavy SDKs (e.g. Google Calendar/Tasks via REST, not
  `googleapis`). Add a dependency only when it earns its weight (e.g. `node-ical` for the genuinely
  hard ICS/RRULE/timezone parsing). No new deps without a reason.
- **Mock data is shaped exactly like the real API** so swapping mock→real is a drop-in.
- **Tailwind v4 content scanning:** module frontends live outside `packages/ui`, so
  `packages/ui/src/styles.css` has `@source "../../../modules";`. A utility/daisyUI class used only
  inside a module won't generate without it.
- **`node-ical` is CJS with no usable named ESM export** — use `import ical from "node-ical"`
  (default) + `import type { VEvent } from "node-ical"`; a named import 400s at runtime.
- **`exactOptionalPropertyTypes`:** never assign `undefined` to an optional prop; build it
  conditionally (`...(x ? { x } : {})`). **`noUncheckedIndexedAccess`:** index access is `T | undefined`.
- **After editing `@hub/sdk`, rebuild it** (`pnpm --filter @hub/sdk build`) — consumers load `dist`.
- **Layout/overflow:** the dashboard is locked to the viewport (`h-full overflow-hidden`); each card
  is a hard-bounded box that owns its own scroll. Don't let content grow the page.

## Module status & roadmap

| Module | State |
|---|---|
| clock | real |
| weather | **real** — Open-Meteo (no key), config lat/lon + °C/°F, night-aware icons, UV. Default Cambridge ON. |
| calendar-google | **real, verified live** — ICS subscriptions (read) + Google OAuth accounts (read/write). Merged, day-grouped; OAuth connect + basic event creation confirmed working. |
| todo-google | **still mock** — shaped like Google Tasks; not wired to real API yet. |
| assistant | **real** — Claude proxy + tool-use over the capability registry. Needs `ANTHROPIC_API_KEY`. |

**Next up:** Google **Tasks** module (reuses the shared Google client + per-module connect, mirrors
the calendar's OAuth pattern). Later: calendar multiple-view toggle (day/week/agenda/month);
MCP phases P2/P3; Pi deployment (kiosk Chromium, screen-blank off, auto-restart, night-dim).

## Working agreements

- **Verify against live endpoints**, not synthetic one-off scripts. Boot/observe the dev server and
  `curl` the real routes; that's the signal that something actually mounted and works.
- **Typecheck (and build the UI when frontend changed) before calling something done.** Report
  failures honestly with the output.
- **Never commit secrets.** `.env` only (gitignored); templates and `.env.example` carry names, not
  values. The generic config endpoint must never return secret values.
- **Keep dependencies lean** and modules decoupled — they talk to the core only through `ctx`
  (config, secrets, bus, capabilities, route), never to each other directly.
- Match the surrounding code's style and the warm visual language; confirm before
  hard-to-reverse or outward-facing actions.
- Git history exists and is maintained — mine it for context, and commit only when asked.
