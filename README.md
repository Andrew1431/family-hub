# Family Hub

An open-source, modular **smart-mirror / family dashboard** for a wall-mounted display
(target: Raspberry Pi + SSD, but develops on any machine). Each panel — clock, weather,
calendar, to-dos, AI assistant — is a self-contained **module** loaded dynamically by a
small core. The visual style is warm and "hearth"-like (copper on dark brown, serif
accents), not a typical dark-mode dashboard.

---

> # 🚧 WORK IN PROGRESS 🚧
>
> ## This project is under active development and is **NOT yet documented for end users.**
>
> ### There are **no complete usage instructions yet.** Per-module setup docs are still being written.
>
> ### For now, the fastest path is to **point an AI coding assistant (Claude Code, Cursor, etc.) at this repository and ask it to walk you through setup** for your machine. The codebase is structured and commented to make that easy.

---

## What it is

A wall-mounted "smart mirror" for the home: a single locked-to-viewport dashboard of
panels your family glances at — the time, today's weather, the shared calendar, the
to-do lists, and a built-in AI assistant you can talk to. It's designed to run quietly
on low-power hardware (a Raspberry Pi with an SSD) but develops on any laptop.

The core idea is the **module system**: every panel is an independent mini-package under
`modules/`. The small core discovers them at boot, mounts their backends under a scoped
URL, and places their panels on the grid. Adding a feature means adding a module — no
changes to the core.

A standout piece is the **capability/AI spine**: any module can register a "capability"
(a typed tool), and the AI assistant automatically gains the ability to use it — the
assistant has zero module-specific code. Teach the hub a new trick by adding a module,
and the assistant can already drive it.

## Stack

- **pnpm workspaces** monorepo. Node for dev; **Bun** is the intended Raspberry Pi production runtime.
- **Backend:** Fastify + `node:sqlite` (Node's built-in SQLite, no native deps) + WebSockets. **Not Next.js** — kept lean for embedded hardware.
- **Frontend:** React 19 + Vite + Tailwind v4 (CSS-first, no JS config) + daisyUI v5. Self-hosted fonts via `@fontsource` for fully offline operation.
- **AI:** Claude API (your own API key) via an in-process tool-use loop over the capability registry. **Entirely optional** — the assistant can be disabled in settings, and the hub runs fully without an API key.
- TypeScript everywhere, strict.

## Modules

| Module | State |
|---|---|
| **clock** | Real |
| **weather** | Real — Open-Meteo (no API key), configurable location and °C/°F, night-aware icons, UV index |
| **calendar-google** | Real — ICS subscriptions (read) + Google OAuth accounts (read/write), merged and day-grouped |
| **todo-google** | Real — Google Tasks via OAuth (read/write), per-account lists, quick-add, stacked/tabs views |
| **assistant** | Real — Claude proxy with tool-use over the capability registry (requires your own `ANTHROPIC_API_KEY`) |

## Repo layout

```
packages/
  sdk/      @hub/sdk      — module contracts (manifest, context, capability, http helpers)
  core/     @hub/core     — Fastify server, module loader, capability registry, event bus, sqlite stores
  ui/       @hub/ui       — React shell: chrome, dashboard grid, settings/chat modals, assistant orb
  tooling/  @hub/tooling  — config seeder + module generator
modules/    clock, weather, calendar-google, todo-google, assistant
config/     *.template.* (committed defaults) + *.local.* (gitignored, seeded on first run)
data/       hub.sqlite (runtime DB; gitignored)
```

See `CLAUDE.md` for the full architecture reference and `PROJECT_PLAN.md` for the original vision.

## Basic setup (developers, for now)

> ⚠️ This is a rough developer bootstrap, **not** a finished install guide. If anything is
> unclear, hand this README and the repo to an AI assistant and ask it to guide you.

Requirements: Node 20+ and pnpm.

```bash
pnpm install                 # install workspace deps
cp .env.example .env         # then fill in your secrets (see below)
pnpm dev                     # runs core (:4000) + ui (:5173) together
```

Open `http://localhost:5173`. Config templates are auto-copied to gitignored `*.local.*`
files on first run, so the app boots with sensible defaults before you've configured anything.

### Secrets (`.env`)

Copy `.env.example` to `.env` (gitignored — never committed) and fill in only what you
need. Everything is optional; modules whose secrets are missing simply warn and stay idle.

- `ANTHROPIC_API_KEY` — enables the AI assistant. **Optional** — leave it blank and the hub runs fine without any AI; the assistant can also be turned off entirely in settings. **API billing only** (a consumer Claude Pro/Max login cannot power it, per Anthropic's ToS).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — one shared Google OAuth client used by all Google modules (calendar, tasks). Create a single "Web application" OAuth client in Google Cloud and register the redirect URIs listed in `.env.example`.

`.env` is read **only at core boot** — restart `pnpm dev` after editing it.

## Contributing

This is early, open-source, and built in the open. Issues and module contributions are
welcome — but please note documentation is still catching up to the code. See `CLAUDE.md`
for conventions and the "Adding a module" recipe.

## License

MIT — see [LICENSE](LICENSE).
