# Hotkey Support — Architecture & Feasibility

Status: **design / feasibility**. This document proposes a keyboard-navigation
system that makes hotkeys a first-class part of the hub, and lands two shared
components (`Card`, `Title`) as the integration seam. A follow-up doc will
capture the per-module hotkey requirements (the `(A)`-style in-card actions for
calendar, todos, notes, …).

## Verdict

Feasible, and it fits the existing grain. The hub already has the exact pattern
we need: a **shell-owned cross-cutting signal that modules opt into via a
frontend export** — that's `OverlayHost` + `Overlay`/`idleMs`
(`packages/ui/src/components/OverlayHost.tsx`, `packages/sdk/src/frontend.ts`).
Hotkeys are the same shape:

- the **shell** owns the focus state machine + the global keydown listener,
- each **module** opts in by declaring a top-level hotkey and (optionally)
  registering in-card actions,
- the **registry** (capabilities-style "one registry, modules register into it")
  dispatches keys to whichever module is focused.

No module talks to another; everything flows through shell-provided context,
exactly like `ctx` on the backend.

## Behaviour model (the state machine)

Three nested states, highest priority first:

1. **Idle** — nothing focused. Default. The hub returns here after a short
   inactivity timeout or on `Escape`. In idle, a single key that matches a
   module's registered hotkey **focuses** that module. `Calendar (C)`,
   `Todos (T)`, `Notes (N)`. Case-insensitive.
2. **Module focused** — exactly one card is focused. It shows a subtle pulsing
   glow. The module's own in-card hotkeys are now live. `Escape` (or inactivity)
   returns to idle. By soft convention `A` = "add item":
   - `C → A` opens the calendar's new-event form,
   - `T → A` focuses the todo add-input,
   - `N → A`… see below — Notes overrides the convention.
3. **In-card action** — the module handles the key however it likes. The
   standard is `A`-to-add, but each module is free: Notes makes pressing `N`
   (entering the module) *instantly create + focus a new note*; if it's left
   empty on blur it's discarded — so a thought is captured with `N`, type, done.
   That's the point of letting each module keep its own implementation.

```
        any module hotkey (idle only)
 ┌────────┐ ───────────────────────────▶ ┌──────────────────┐
 │  IDLE  │                               │  MODULE FOCUSED   │
 │ (none) │ ◀─────────────────────────── │  (glow + own keys)│
 └────────┘   Esc / inactivity timeout    └──────────────────┘
                                              │   in-card keys
                                              ▼  (A = add, …)
                                          module-defined handlers
```

## Where the pieces live

Shared, dist-built packages already in play — reuse them, don't invent a new one:

| Concern | Home | Why |
|---|---|---|
| `hotkey` field on the manifest | `@hub/sdk` (`manifest.ts`) | Static metadata, read by shell + Title. SDK is consumed as **built dist → rebuild after edit**. |
| `Card`, `Title`, `HotkeyProvider`, `useModuleHotkeys` | `@hub/components` | Both the shell **and** custom modules import from here already (`ScrollView`). Modules cannot import from `@hub/ui` (it's the app, not a package). Also dist-built → rebuild after edit. |
| Mounting the provider + global keydown + idle timer | `@hub/ui` (`App.tsx` / `DashboardGrid.tsx`) | Shell-only knowledge (layout, dashboards, overlay-active, assistant key). |
| Glow keyframes | `packages/ui/src/styles.css` | Custom `@keyframes` can't be expressed as Tailwind arbitrary classes; component class names are already scanned via `@source ".../packages/components/src"`. |

## Components

### `Card` (new, `@hub/components`)

The focus-aware replacement for the raw `<section className="panel …">` that
`DashboardGrid` renders today (`DashboardGrid.tsx:49-56`). Responsibilities:

- Read `HotkeyContext`; compute `focused = focusedId === instanceId`.
- Render the grid `<section>` with the `panel` (or bare) surface, preserving the
  existing `group relative flex flex-col min-h-0 overflow-hidden` classes so the
  hover-reveal cog (`group-hover`/`group-focus-within`) keeps working.
- Apply the pulsing glow via `data-focused` (see Styling).
- Be focusable (`tabIndex={-1}`), move DOM focus to itself when activated, and
  treat click / focus as "focus me", blur / outside-click as "unfocus". App-level
  focus and DOM focus stay in sync — this also makes the typing-guard natural and
  keeps the cog's `group-focus-within` reveal honest.
- Provide a small `CardContext` to its children: `{ instanceId, hotkey, focused }`
  so `Title` and `useModuleHotkeys` need no props.

```tsx
interface CardProps {
  instanceId: string;
  hotkey?: string;                 // resolved (manifest default ± layout override)
  surface?: "panel" | "bare";
  children: ReactNode;             // shell composes: cog button + <Panel/>
}
```

The shell still owns the cog and the `SettingsModal` (they depend on
`moduleFrontends` + shell state) — it just composes them *inside* `Card` as
children. Custom modules can use `Card` directly for bespoke layouts.

### `Title` (new, `@hub/components`)

Consistent card heading. Replaces the ad-hoc `<span className="panel-label">…`
headers in module panels (`notes/frontend.tsx:241`,
`todo-google/frontend.tsx:398`, `calendar-google/frontend.tsx:842`). Reads the
resolved hotkey from `CardContext` (so a layout override is reflected without the
module knowing) and renders `NAME (X)`:

```tsx
function Title({ children }: { children: ReactNode }) {
  const { hotkey, focused } = useCard();
  return (
    <span className="panel-label inline-flex items-baseline gap-1.5">
      {children}
      {hotkey && <span className="hotkey-hint" data-focused={focused}>{hotkey.toUpperCase()}</span>}
    </span>
  );
}
```

The hint is dim by default and brightens when focused — a quiet affordance that
reads across the room without shouting on a wall display.

## Supporting machinery (the glue)

These aren't the headline components but `Card`/`Title` need them.

### `HotkeyProvider` (`@hub/components`, mounted by the shell)

Owns the registry + the focus state. The shell renders it around the grid and
feeds it the resolved hotkey table and an `enabled` flag (false while a
screensaver overlay is up — see Coordination).

```ts
interface HotkeyContextValue {
  focusedId: string | null;
  focus(id: string | null): void;
  // module registers its in-card bindings; provider dispatches when focused.
  register(id: string, bindings: Record<string, () => void>): () => void;
}
```

Single capture-phase `window` keydown owner (don't scatter N listeners across
modules — one dispatcher avoids ordering bugs and mirrors the capability
registry's "one place" philosophy):

- **idle** (`focusedId === null`): match `key` against the hotkey table → `focus(id)`.
- **focused**: `Escape` → `focus(null)`; otherwise look up `register`ed bindings
  for `focusedId` and invoke a match.
- Always bail when the target is an `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`
  (same guard as the existing Space→assistant handler, `App.tsx:42-44`) — except
  `Escape`, which should still blur/unfocus.

Plus an idle timer (reuse the activity-tick idea from `OverlayHost.tsx:36-39`)
that calls `focus(null)` after ~8-15s of no interaction.

### `useModuleHotkeys` (`@hub/components`, used in a module Panel)

```ts
useModuleHotkeys({ a: addEvent /*, … */ });
```

Reads `{ instanceId, focused }` from `CardContext`, registers the bindings into
the provider (stable), auto-unregisters on unmount. The module stays
self-contained — its handlers close over its own state (focus an input, open a
form, create a note). This is the seam that lets each module's hotkey
implementation "remain unique per" while sharing the standard.

## Data model: declaring & overriding hotkeys

- **Default** in the manifest (static, like `surface`):
  ```ts
  // @hub/sdk manifest.ts
  /** Single-key shortcut to focus this module from idle. Case-insensitive,
   *  one character. Opt-in — interactive modules only. */
  hotkey?: string;
  ```
- **Override** per placement via the layout widget (so the same module placed on
  two dashboards can differ, and a user can remap without code). Resolution:
  `layout widget.hotkey → manifest.hotkey → none`. Provider builds the table from
  resolved values and **detects collisions** (two modules claiming `C`) — log a
  warning and keep the first, never throw (matches the loader's
  "degrade gracefully, never take down the hub" stance).

`Space` is **reserved** for the assistant (`App.tsx:38-50`) and must be rejected
as a module hotkey.

## Styling: the pulsing glow

Add to `packages/ui/src/styles.css` (custom animation, theme-token driven, Pi-safe):

```css
@keyframes hub-card-pulse {
  0%, 100% { box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-primary) 35%, transparent),
                         0 0 12px color-mix(in oklab, var(--color-primary) 18%, transparent); }
  50%      { box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-primary) 55%, transparent),
                         0 0 22px color-mix(in oklab, var(--color-primary) 32%, transparent); }
}
.panel[data-focused="true"] { animation: hub-card-pulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .panel[data-focused="true"] { animation: none; box-shadow: 0 0 0 1px var(--color-primary); }
}
```

Animate only `box-shadow` (cheap) — **no `blur()`/`backdrop-filter`**, which is
the documented worst performer on the Pi's Chromium (`styles.css:49-52`).

## Coordination with existing global key/idle handlers

Three things already listen globally; the hotkey system must slot in cleanly:

1. **Space → assistant** (`App.tsx:38-50`). Keep, but `Space` is not a valid
   module hotkey. *Future cleanup:* fold this into `HotkeyProvider` as a reserved
   global so there's one keydown owner.
2. **`OverlayHost` idle + wake-swallow** (`OverlayHost.tsx:43-60`). When a
   screensaver overlay is active it stops the first interaction in the capture
   phase. The provider must be **disabled while any overlay is active** (pass an
   `enabled` prop driven by the same overlay-active signal) so a wake keystroke
   never also focuses a card. Cleanest long-term: lift idle/overlay-active into a
   shared shell context both `OverlayHost` and `HotkeyProvider` read.
3. **Notes auto-focuses a new textarea on add** (`notes/frontend.tsx:218-225`).
   Because focus moves into a text field, the typing-guard naturally suppresses
   further letter hotkeys — exactly what we want for "press N, keep typing".

## File-by-file change list

- `packages/sdk/src/manifest.ts` — add `hotkey?: string`. **Rebuild SDK.**
- `packages/sdk/src/layout.ts` — add optional `hotkey?` to the widget instance
  (override). **Rebuild SDK.**
- `packages/components/src/` — new `Card.tsx`, `Title.tsx`, `hotkeys.tsx`
  (provider + context + `useModuleHotkeys`); export from `index.ts`. **Rebuild components.**
- `packages/ui/src/App.tsx` — mount `HotkeyProvider` (feed resolved table +
  overlay-active `enabled`).
- `packages/ui/src/components/DashboardGrid.tsx` — render each widget through
  `Card` (pass `instanceId`, resolved `hotkey`, `surface`); compose cog + Panel
  as children. Resolve + collision-check the hotkey table here.
- `packages/ui/src/styles.css` — glow keyframes + `hotkey-hint` styles.
- `modules/{calendar-google,todo-google,notes}/manifest.ts` — add `hotkey`
  (`C`/`T`/`N`).
- `modules/{calendar-google,todo-google,notes}/frontend.tsx` — swap the header
  `panel-label` span for `<Title>`, add `useModuleHotkeys({ a: … })` (+ Notes'
  on-enter create-and-focus). *Details deferred to the per-module doc.*

## Rollout phases

1. **Seam, no behaviour.** Land `Card`/`Title` + provider; `DashboardGrid` routes
   through `Card`. Nothing focuses yet (no manifest hotkeys). Pure refactor —
   verify the dashboard renders identically and the cog still reveals on hover.
2. **Idle → focus.** Add `hotkey` to the three manifests; implement the idle
   dispatch + glow + `Escape`/timeout. `C`/`T`/`N` focus their cards.
3. **In-card actions.** `useModuleHotkeys` per module: `A`-to-add convention +
   Notes' instant-note override. This is what the per-module requirements doc
   will specify.
4. **Cleanup (optional).** Fold Space→assistant into the provider; share the
   idle/overlay-active signal between `OverlayHost` and `HotkeyProvider`.

Each phase is independently shippable and typecheck/`build`-verifiable.

## Open questions (for the per-module doc / your call)

- **Multi-instance**: a hotkey maps to a *module*, but a module can be placed
  more than once. Focus the first placed instance? Disambiguate with a second
  key? (Today the three interactive modules are single-instance, so: first-wins,
  note the limit.)
- **Idle timeout length** before auto-return to idle (proposed 8-15s; should it
  match or differ from the screensaver idle?).
- **Visible hint always, or only after a "leader" press?** Proposal: always show
  the dim `(X)` so the affordance is discoverable on the wall.
- **Nested escape**: in a focused module mid-form (e.g. calendar add-event open),
  should `Escape` close the form first, then a second `Escape` unfocus? (Suggest
  yes — module's own handler eats the first `Escape`.)
- **Within-card navigation** beyond `A` (arrow keys to move between todos/notes,
  `Enter`/`Space` to toggle)? Out of scope here; the registry supports it later.
```
