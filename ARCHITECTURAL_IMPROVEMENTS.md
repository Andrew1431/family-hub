# Architectural Improvements

Findings from a full architectural review (June 2026), in priority order. Each item records
the problem, the **decided direction**, and what "done" looks like. This is a working
document for the cleanup initiative — strike items as they land.

**The driving goal:** features and modules should be easily implementable *by hand*. Today a
new Google-backed module needs ~350 lines of copied OAuth boilerplate before any feature
code; the items below get that to ~30.

**What's deliberately NOT on this list:** the capability registry, the loader/context/stores,
and the shell (App/Grid/OverlayHost/SettingsModal). They're at the right altitude — small,
single-purpose, and worth protecting from "improvement."

---

## 1. Close the typecheck gap (do first)

**Problem.** `pnpm -r typecheck` only covers `@hub/sdk`, `@hub/core`, `@hub/ui` — no module
has a `typecheck` script. Module *frontends* are typechecked incidentally (the UI's generated
registry imports them), but module **backends and `google.ts` files — the code talking to
live APIs — are never typechecked in CI**. `modules/clock/` has no `tsconfig.json` at all,
so even the documented manual command fails there.

**Direction.**
- Add `modules/clock/tsconfig.json` (copy weather's).
- Add a root script that typechecks every `modules/*/tsconfig.json` (a small loop in
  `packages/tooling/`, or per-module `typecheck` scripts so `pnpm -r typecheck` picks them up).
- Wire into `.github/workflows/ci.yml`.

**Done when:** breaking a type in any `modules/*/backend.ts` fails CI.

*Sequenced first so every refactor below is verified by the thing it's refactoring toward.*

## 2. Extract `@hub/google` (the headline: ~800 duplicated lines)

**Problem.** Three near-identical copies across `calendar-google`, `todo-google`,
`photos-drive`, at three layers:

- **`google.ts` ×3** — `getCreds`, `authUrl`, `exchangeCode`, `TokenSet`, `accessTokenFor`
  (cache + refresh + `AccountAuthError`), `clearTokenCache`, `revokeToken` are byte-identical
  except for `SCOPES` (~150 lines each).
- **`backend.ts` ×3** — `oauthStates`/`newState`/`consumeState`, `escapeHtml`, `oauthPage`
  (the popup HTML, verbatim ×3), `redirectUriFrom`, and the four routes `GET /oauth/status`,
  `PUT /oauth/client`, `GET /oauth/start`, `GET /oauth/callback` plus the disconnect route
  (~120 lines each). Only "identify the account" and post-connect bookkeeping differ.
- **`frontend.tsx` ×3** — client-ID/secret form, redirect-URI copy chip, `connect()` popup
  poller, disconnect button (~90 lines each).

This is a bug-fix fan-out hazard: e.g. the `oauthStates` map never prunes abandoned entries —
a (tiny) leak now living in three places.

**Direction.** New workspace package **`@hub/google`**:
- The OAuth/token core (creds, auth URL, code exchange, access-token cache, revoke).
- A backend helper, roughly
  `registerGoogleOAuthRoutes(ctx, { scopes, identify, onConnected, onDisconnected })`,
  that owns the four oauth routes, CSRF state, and the popup result page.
- A shared `<GoogleConnect>` settings component (client setup + connect popup + disconnect).
- Refresh tokens **stay in each module's own secret namespace** (least-privilege scopes,
  one connect per module) — the helper takes `ctx`, it doesn't centralize token storage.

Trade-off accepted: modules stop being fully copy-paste self-contained. They already all
depend on `@hub/sdk`, so the precedent exists; per-module feature code is what should stay
self-contained, not commodity OAuth.

**Done when:** the three modules' `google.ts` files contain only their REST API calls
(calendar/tasks/drive), and a new Google module's auth wiring is ~30 lines.

## 3. Standard error envelope in the core route registrar

**Problem.** The
`try { … } catch (err) { return { ok:false, message: err instanceof Error ? err.message : String(err) } }`
envelope is hand-rolled ~30 times across module backends (`todo-google/backend.ts` alone has
~12). Pure noise; every handler must remember the incantation.

**Direction.** The loader's route wrapper (`packages/core/src/loader.ts`) catches thrown
errors and serializes the standard `{ ok:false, message }` envelope. Module handlers just
**throw** (or return data). Capability handlers invoked by the assistant should get the same
treatment in the registry's `invoke`, so tool failures keep returning a friendly message to
the model rather than crashing the chat loop.

**Done when:** module route/capability handlers contain zero envelope try/catch blocks and
the recipe is "return data or throw".

## 4. Delete the event bus (dead code, ~170 lines)

**Problem.** `GlobalEventBus` (`packages/core/src/bus.ts`), the `/ws` endpoint in
`server.ts`, `ctx.bus`, the `EventBus` SDK type, and `packages/ui/src/lib/bus.ts`
(`publish`/`useSubscribe`) have **zero consumers**. Every panel polls via react-query —
which, for a wall display, is the simpler and more robust pattern anyway.

**Direction.** Delete it (core class, `/ws` route, `ctx.bus`, SDK `EventBus` type, UI
`lib/bus.ts`, the vite `/ws` proxy entry, and the CLAUDE.md references). It lives in git
history; resurrect when a module genuinely needs server-push.

Same category, kept for now: `toMcpTools()` on the registry is unused until the MCP P2
milestone — it's 6 lines and documents real intent, so it stays, but don't grow it.

## 5. Frontend repetition pass

- **Settings boilerplate**: clock, weather (and the big three) each hand-roll
  fetch-config → local state → PUT → invalidate → spinner-while-null → Cancel/Save footer.
  Extract a `useModuleConfig(moduleName)` hook + shared spinner/footer pieces (~40 lines
  saved per module, and the pattern becomes copyable by hand). Open question: where shared
  *components* live — `@hub/sdk` is contracts-only today, so likely a small `@hub/ui-kit`
  (or fold into `@hub/google`'s sibling).
- **Type re-declaration drift**: `todo-google/frontend.tsx` redefines `Task`/`List`
  ("mirror backend google.ts"); calendar's frontend redefines `ResolvedEvent`,
  `GoogleCalendar`, `GoogleAccount`. Weather has the right pattern —
  `import type { CurrentWeather } from "./backend"` is free and can't drift. Standardize.
- **`calendar-google/frontend.tsx` is 1,203 lines** — panel, month grid, two modals, and two
  settings panels in one file. Split into `panel.tsx` / `month.tsx` / `settings.tsx`.
- The 24-line gear SVG path is pasted twice (`packages/ui/src/App.tsx`,
  `packages/ui/src/components/DashboardGrid.tsx`). Extract an icon component.
- `todo-google` settings: `newListTitle` state is shared across all account cards (typing in
  one account's "New list…" box mirrors into the others). Move into a per-account child.

## 6. Docs & comment drift

- `modules/assistant/backend.ts` comment says "Sonnet 4.6 … cheaper than Opus" but
  `DEFAULT_MODEL` is `claude-haiku-4-5`; CLAUDE.md also still claims the sonnet default.
- `modules/weather/backend.ts` header says "Real data source (**future**)" — it shipped.
- CLAUDE.md's module-status table says todo-google is "still mock" — it's fully real.
- Document the **trusted-LAN security model** explicitly (README): the hub has no auth;
  anyone on the network can read/write settings and spend Anthropic credits via `/chat`.
  That's a legitimate design for a home device, but it should be a stated stance.

## 7. Smaller / opportunistic

- `packages/core/package.json` `start` uses `NODE_ENV=production …` env-prefix syntax
  (breaks on Windows) and runs `tsx` even though the stated prod runtime is Bun. Decide what
  `start` means for the Pi and make it real.
- **Tests**: zero today. Most code is integration-shaped (the "verify against live
  endpoints" agreement covers it), but `wallToUtc`/ICS recurrence expansion
  (`calendar-google/backend.ts`), `mergeLists` (`todo-google/backend.ts`), and `groupByDay`
  (calendar frontend) are pure functions where timezone/DST regressions are silent. A minimal
  vitest setup covering just those would pay for itself. Add a formatter/linter before
  accepting outside contributions.
- **DX**: a `pnpm new-module <name>` scaffold in `packages/tooling/` would collapse the
  6-step module recipe to one command — directly serves the "implementable by hand" goal.
- OAuth `oauthStates` pruning (sweep expired entries) — fold into the `@hub/google` helper.

---

## Sequence

1. Typecheck gap (#1) — so everything after is verified.
2. `@hub/google` extraction (#2) — biggest line-count and fan-out win.
3. Error envelope in core (#3) — shrinks every backend.
4. Delete the event bus (#4).
5. Frontend pass (#5).
6. Docs sweep (#6), opportunistic items (#7) as touched.
